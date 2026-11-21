import { explainLetter, probeOnDevice, warmOnDevice } from './src/engine.mjs';

const $ = (id) => document.getElementById(id);
const letterText = $('letterText');
const photoInput = $('photoInput');
const photoName = $('photoName');
const explainBtn = $('explainBtn');
const clearBtn = $('clearBtn');
const statusZone = $('statusZone');
const resultZone = $('resultZone');
const consentZone = $('consentZone');
const examples = document.querySelectorAll('[data-example]');

let photo = null; // { dataUrl, mimeType, name }

const EXAMPLES = {
  council: {
    label: 'Council tax reminder',
    text: `London Borough of Camden - Council Tax Reminder
Account reference: 4582 1190 33
Date: 12 November 2026

Dear Mr A Rahman,

Our records show that GBP 412.00 of your 2026/27 council tax is still unpaid.
You must pay the full amount within 14 days of the date of this letter.
If payment is not received we may apply to the magistrates' court for a
liability order, which adds GBP 95.00 in costs.

Ways to pay: online at camden.gov.uk/pay, by phone on 020 7974 4444,
or at any Post Office with the barcode above.

If you are struggling to pay, contact us now - we can usually agree a
payment plan. This reminder is issued under the Council Tax
(Administration and Enforcement) Regulations 1992.`
  },
  bank: {
    label: 'Bank overdraft letter',
    text: `Meridian Bank plc
Customer Services, 1 High Street, London EC1A 1AA
Date: 8 November 2026

Dear Ms Okafor,

Changes to your arranged overdraft - account ending 4471

From 1 January 2027 the interest rate on your arranged overdraft will
change from 19.9% EAR to 24.9% EAR (variable). No action is needed if
you are happy with the change. If you would like to reduce or remove
your overdraft, call us on 0345 600 1234 or visit any branch by
18 December 2026.

If you regularly use your overdraft and are finding it hard to repay,
free debt advice is available from StepChange on 0800 138 1111.`
  },
  nhs: {
    label: 'NHS appointment letter',
    text: `University College London Hospitals NHS Foundation Trust
Outpatient Appointments, 235 Euston Road, London NW1 2BU

Dear Mrs Ellis,

You have been given an appointment at the Cardiology Clinic.
Date: Tuesday 1 December 2026   Time: 09:40
Location: Clinic 4, Lower Ground Floor, University College Hospital
Reference: UCLH-784512

Please arrive 15 minutes early and bring a list of your current
medicines. If you cannot attend, call 020 3447 9393 as soon as
possible so we can offer the slot to another patient. Missing your
appointment without telling us may delay your care.

This is an appointment confirmation, not test results.`
  }
};

function setStatus(msg, kind = 'info') {
  statusZone.textContent = msg;
  statusZone.className = `status ${kind}`;
  statusZone.hidden = !msg;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderResult(data, path) {
  const urgencyClass = { 'routine': 'ok', 'needs action': 'warn', 'urgent': 'bad' }[data.urgency] || 'warn';
  const rows = [];
  rows.push(`<div class="verdict ${urgencyClass}">
    <h2>${escapeHtml(data.letter_type)}</h2>
    <p class="sub">From: ${escapeHtml(data.who_from)} · ${escapeHtml(data.urgency)}</p>
  </div>`);
  rows.push(`<section class="card"><h3>In plain English</h3><p>${escapeHtml(data.plain_summary)}</p></section>`);
  if (data.actions?.length) {
    rows.push(`<section class="card"><h3>What you need to do</h3><ul>${
      data.actions.map((a) => `<li>${escapeHtml(a.action)} <span class="when">${escapeHtml(a.by_when)}</span></li>`).join('')
    }</ul></section>`);
  }
  if (data.amounts?.length) {
    rows.push(`<section class="card"><h3>Money mentioned</h3><ul>${
      data.amounts.map((a) => `<li>${escapeHtml(a.label)}: <strong>${escapeHtml(a.amount)}</strong></li>`).join('')
    }</ul></section>`);
  }
  if (data.possible_scam) {
    rows.push(`<section class="card scam"><h3>One caution</h3>
      <p>Parts of this letter look unusual. Before paying or replying, check through the organisation's
      official website or a number you already trust - not the contact details in the letter.</p></section>`);
  }
  if (data.unclear_points?.length) {
    rows.push(`<section class="card"><h3>Not clear from the letter</h3><ul>${
      data.unclear_points.map((u) => `<li>${escapeHtml(u)}</li>`).join('')
    }</ul></section>`);
  }
  rows.push(`<section class="card calm"><p>${escapeHtml(data.reassurance)}</p></section>`);
  rows.push(`<p class="path-note">${
    path === 'on-device'
      ? 'Explained entirely on your device. Nothing you pasted or photographed was sent anywhere.'
      : 'Explained in the cloud with your agreement. The letter content was sent to Google\'s Gemini API for this one explanation; it is not stored by PlainPost (there is no PlainPost server).'
  }</p>`);
  resultZone.innerHTML = rows.join('');
  resultZone.hidden = false;
}

function showConsent() {
  return new Promise((resolve) => {
    consentZone.innerHTML = `<div class="consent">
      <h3>On-device AI isn't available here</h3>
      <p>Your browser can't run the on-device model (it needs desktop Chrome 139+ with the built-in
      Gemini Nano model). PlainPost can instead send this letter to Google's Gemini API for a
      one-off explanation.</p>
      <p><strong>Nothing is sent unless you agree.</strong> PlainPost has no server of its own and
      stores nothing.</p>
      <div class="row">
        <button id="consentYes" class="primary">I agree - explain in the cloud</button>
        <button id="consentNo">No thanks</button>
      </div>
    </div>`;
    consentZone.hidden = false;
    $('consentYes').onclick = () => { consentZone.hidden = true; resolve(true); };
    $('consentNo').onclick = () => { consentZone.hidden = true; resolve(false); };
  });
}

async function onExplain() {
  const text = letterText.value.trim();
  if (!text && !photo) {
    setStatus('Paste the letter text first (or add a photo of it).', 'warn');
    return;
  }
  resultZone.hidden = true;
  resultZone.innerHTML = '';
  explainBtn.disabled = true;
  try {
    const { data, path } = await explainLetter(
      { text: text || undefined, image: photo || undefined },
      { onStatus: (m) => setStatus(m), shouldUseCloud: showConsent }
    );
    setStatus('');
    renderResult(data, path);
  } catch (e) {
    if (e.code === 'cloud-declined') {
      setStatus('No problem - nothing was sent anywhere. You can try again in desktop Chrome 139+ to use the on-device option.', 'info');
    } else {
      console.error(e);
      setStatus('Sorry - the explanation failed (' + (e.message || e) + '). If this keeps happening, the free daily quota may be used up; try again later.', 'bad');
    }
  } finally {
    explainBtn.disabled = false;
  }
}

function onClear() {
  letterText.value = '';
  photo = null;
  photoInput.value = '';
  photoName.textContent = '';
  resultZone.hidden = true;
  resultZone.innerHTML = '';
  setStatus('');
}

function loadExample(key) {
  const ex = EXAMPLES[key];
  if (!ex) return;
  photo = null;
  photoInput.value = '';
  photoName.textContent = '';
  letterText.value = ex.text;
  setStatus(`Loaded a synthetic example: "${ex.label}". It is made up for demonstration.`, 'info');
}

function onPhoto() {
  const file = photoInput.files?.[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png'].includes(file.type)) {
    setStatus('Photos must be JPEG or PNG.', 'warn');
    photoInput.value = '';
    return;
  }
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const max = 1280;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const mime = 'image/jpeg';
    photo = { dataUrl: canvas.toDataURL(mime, 0.85), mimeType: mime, name: file.name };
    photoName.textContent = `Photo attached: ${file.name} (resized to ${canvas.width}x${canvas.height})`;
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

explainBtn.addEventListener('click', onExplain);
clearBtn.addEventListener('click', onClear);
photoInput.addEventListener('change', onPhoto);
examples.forEach((b) => b.addEventListener('click', () => loadExample(b.dataset.example)));

// On load: quietly report which path this browser can use. No content goes anywhere.
(async () => {
  try {
    const probe = await probeOnDevice();
    if (probe === 'ready') {
      setStatus('On-device AI is ready in this browser - letters can be explained without anything leaving your device.', 'ok');
    } else if (probe === 'needs-download') {
      setStatus('On-device AI is available but needs a one-time model download (it will start when you explain your first letter).', 'info');
    } else {
      setStatus('This browser has no on-device AI. Desktop Chrome 139+ can explain letters entirely on-device; here, cloud explanation will be offered with your consent first.', 'info');
    }
  } catch {
    /* config not wired yet - status stays as the HTML default */
  }
})();
