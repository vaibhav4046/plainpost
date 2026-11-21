import { explainLetter, probeOnDevice } from './src/engine.mjs';

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

let busy = false;
let photo = null; // { dataUrl, mimeType, name }

const EXAMPLES = {
  council: {
    label: 'Council tax reminder',
    text: `Example Borough Council - Council Tax Reminder
Account reference: 4582 1190 33
Date: 12 November 2026

Dear Mr A Rahman,

Our records show that GBP 412.00 of your 2026/27 council tax is still unpaid.
You must pay the full amount within 14 days of the date of this letter.
If payment is not received we may apply to the magistrates' court for a
liability order, which adds GBP 95.00 in costs.

Ways to pay: online at council.example.invalid/pay, by phone on (not a real telephone number),
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
your overdraft, call us on (not a real telephone number) or visit any branch by
18 December 2026.

If you regularly use your overdraft and are finding it hard to repay,
independent debt advice may be available. This example does not contain real contact details.`
  },
  nhs: {
    label: 'Hospital appointment letter',
    text: `Example Teaching Hospital
Outpatient Appointments, Example Street, Example Town

Dear Mrs Ellis,

You have been given an appointment at the Cardiology Clinic.
Date: Tuesday 1 December 2026   Time: 09:40
Location: Clinic 4, Lower Ground Floor, Example Hospital
Reference: EXAMPLE-784512

Please arrive 15 minutes early and bring a list of your current
medicines. If you cannot attend, call (not a real telephone number) as soon as
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
  $('emptyState').hidden = true;
}

function showConsent() {
  setStatus('');
  return new Promise((resolve) => {
    consentZone.innerHTML = `<div class="consent">
      <h3>Choose what happens next.</h3>
      <p>The on-device explanation could not run here. You can stop, or send this letter or photo to Google's Gemini API for an explanation. A compatible desktop Chrome setup with Gemini Nano is needed for local processing.</p>
      <p><strong>Your letter is sent only if you agree.</strong> Google processes the cloud request under its own terms. Do not send sensitive personal information. PlainPost does not save the letter.</p>
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
  if (busy) return;
  const text = letterText.value.trim();
  if (!text && !photo) {
    setStatus('Paste the letter text first (or add a photo of it).', 'warn');
    return;
  }
  resultZone.hidden = true;
  resultZone.innerHTML = '';
  busy = true;
  [explainBtn, clearBtn, photoInput, letterText, ...examples].forEach(el => el.disabled = true);
  $('emptyState').hidden = true;
  try {
    const { data, path } = await explainLetter(
      { text: text || undefined, image: photo || undefined },
      { onStatus: (m) => setStatus(m), shouldUseCloud: showConsent }
    );
    setStatus('');
    renderResult(data, path);
  } catch (e) {
    if (e.code === 'cloud-declined') {
      setStatus('Your letter was not sent to the cloud. You can try a compatible desktop Chrome setup for on-device processing.', 'info');
    } else {
      console.error(e);
      const message = /429|quota/i.test(e.message || '') ? 'The free cloud quota is unavailable. Try later or use a compatible on-device setup.' : /401|403|app.check/i.test(e.message || '') ? 'The service could not verify this request. Nothing was explained. Try reloading the page.' : 'The explanation could not finish. No result has been shown. Try again later, or check the letter directly.';
      setStatus(message, 'bad');
    }
  } finally {
    busy = false;
    [explainBtn, clearBtn, photoInput, letterText, ...examples].forEach(el => el.disabled = false);
  }
}

function onClear() {
  if (busy) return;
  $('emptyState').hidden = false;
  letterText.value = '';
  photo = null;
  photoInput.value = '';
  photoName.textContent = '';
  photoName.hidden = true;
  resultZone.hidden = true;
  resultZone.innerHTML = '';
  setStatus('');
}

function loadExample(key) {
  if (busy) return;
  resultZone.hidden = true;
  $('emptyState').hidden = false;
  const ex = EXAMPLES[key];
  if (!ex) return;
  photo = null;
  photoInput.value = '';
  photoName.textContent = '';
  photoName.hidden = true;
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
  if (file.size > 10 * 1024 * 1024) { setStatus('Choose a photo under 10 MB.', 'warn'); photoInput.value = ''; return; }
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
    photoName.hidden = false;
    photoName.textContent = `Photo attached: ${file.name} (resized to ${canvas.width}x${canvas.height})`;
    URL.revokeObjectURL(url);
  };
  img.onerror = () => { URL.revokeObjectURL(url); photo = null; setStatus('This image could not be read. Try a JPG or PNG.', 'warn'); };
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
      $('deviceStatus').textContent = 'On-device AI is available. Letter processing will be attempted locally first.';
    } else if (probe === 'needs-download') {
      $('deviceStatus').textContent = 'On-device AI needs a one-time model download. It can take several minutes.';
    } else {
      $('deviceStatus').textContent = 'On-device AI is unavailable in this setup. Cloud processing will ask for your permission.';
    }
  } catch {
    /* config not wired yet - status stays as the HTML default */
  }
})();
