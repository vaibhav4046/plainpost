// PlainPost hybrid AI engine.
// Privacy-first routing: try on-device (Gemini Nano via Chrome Prompt API) FIRST.
// Cloud (Gemini Developer API free tier) is used ONLY after explicit user consent,
// or when the user asks for it directly. The result always says which path ran.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js';
import { initializeAppCheck, ReCaptchaV3Provider, ReCaptchaEnterpriseProvider } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app-check.js';
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-ai.js';
import { firebaseConfig, appCheckSiteKey } from './firebase-config.mjs';
import { buildPrompt } from './prompts.mjs';
import { modelConfig, deviceOptions, parseResult } from './model-config.mjs';



// Localhost development uses an App Check debug token (gitignored file, never deployed).
let debugToken = null;
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  try {
    const dbg = await import('./appcheck-debug.local.mjs');
    debugToken = dbg.appCheckDebugToken || null;
  } catch { /* no debug file: production build or fresh clone */ }
}

let app = null;
let ai = null;

export function initFirebase() {
  if (app) return app;
  app = initializeApp(firebaseConfig);
  if (debugToken) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider('localhost-debug'),
      isTokenAutoRefreshEnabled: true
    });
  } else if (appCheckSiteKey) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true
    });
  }
  ai = getAI(app, { backend: new GoogleAIBackend() });
  return app;
}

function makeModel(mode, image = false) {
  return getGenerativeModel(ai, modelConfig(mode, image), { timeout: 60000 });
}

// Probe on-device availability without sending any content anywhere.
// Returns 'ready' | 'needs-download' | 'unavailable'
export async function probeOnDevice(image = false) {
  initFirebase();
  if (!('LanguageModel' in self)) return 'unavailable';
  try {
    const availability = await LanguageModel.availability(deviceOptions(image));
    if (availability === 'available') return 'ready';
    if (availability === 'downloadable' || availability === 'downloading') return 'needs-download';
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

// Kick off / track the on-device model download. Must be called from a user gesture.
export async function warmOnDevice(onProgress) {
  initFirebase();
  const model = makeModel(InferenceMode.ONLY_ON_DEVICE);
  await model.initializeDeviceModel((v) => onProgress?.(Math.round(v * 100)));
}

// Run inference strictly on-device. Throws if unavailable.
async function runOnDevice(parts, image) {
  const model = makeModel(InferenceMode.ONLY_ON_DEVICE, image);
  await model.initializeDeviceModel(() => {});
  const result = await model.generateContent(parts);
  return result;
}

// Run inference in the cloud. Caller guarantees consent was given.
async function runInCloud(parts) {
  const model = makeModel(InferenceMode.ONLY_IN_CLOUD);
  return model.generateContent(parts);
}

// Main entry.
// input: { text?: string, image?: { dataUrl: string, mimeType: string } }
// callbacks: { onStatus(msg), shouldUseCloud() -> Promise<boolean> }
// shouldUseCloud is the consent gate: called only when the cloud path is needed.
// Resolves { data, path: 'on-device' | 'cloud' } or throws { code: 'cloud-declined' } etc.
export async function explainLetter(input, { onStatus = () => {}, shouldUseCloud } = {}) {
  initFirebase();
  const parts = [];
  if (input.text) parts.push(buildPrompt(input.text));
  if (input.image) {
    parts.push('This is a photo of an official letter. Read it and explain it following your instructions.');
    parts.push({ inlineData: { data: input.image.dataUrl.split(',')[1], mimeType: input.image.mimeType } });
  }
  if (!parts.length) throw new Error('Nothing to explain.');

  // 1) On-device first - nothing leaves the device.
  const probe = await probeOnDevice(!!input.image);
  if (probe !== 'unavailable') {
    onStatus(probe === 'needs-download'
      ? 'Preparing the on-device model (first use downloads it - this can take a few minutes)...'
      : 'Explaining on your device - nothing is being sent anywhere...');
    try {
      const result = await runOnDevice(parts, !!input.image);
      return { data: parseResult(result), path: 'on-device' };
    } catch (e) {
      console.warn('on-device failed, will offer cloud', e);
    }
  }

  // 2) Cloud path - only with explicit consent.
  if (!shouldUseCloud) throw Object.assign(new Error('Cloud needed but no consent gate provided.'), { code: 'cloud-needed' });
  const agreed = await shouldUseCloud();
  if (!agreed) throw Object.assign(new Error('You chose not to use the cloud.'), { code: 'cloud-declined' });
  onStatus('Explaining in the cloud (you agreed)...');
  const result = await runInCloud(parts);
  return { data: parseResult(result), path: 'cloud' };
}
