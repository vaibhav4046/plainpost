import { SYSTEM_INSTRUCTION, RESPONSE_SCHEMA } from './prompts.mjs';
export const SDK_VERSION = '13.4.0';
export const CLOUD_MODEL = 'gemini-3.5-flash-lite';
export function deviceOptions(image = false) {
  return {
    expectedInputs: [{ type: 'text', languages: ['en'] }, ...(image ? [{ type: 'image' }] : [])],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
    initialPrompts: [{ role: 'system', content: [{ type: 'text', value: SYSTEM_INSTRUCTION }] }]
  };
}
export function modelConfig(mode, image = false) {
  return {
    mode,
    inCloudParams: {
      model: CLOUD_MODEL,
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA }
    },
    onDeviceParams: {
      createOptions: deviceOptions(image),
      promptOptions: { responseConstraint: RESPONSE_SCHEMA }
    }
  };
}
export function parseResult(result) {
  const data = JSON.parse(result.response.text());
  if (!data || typeof data !== 'object') throw new Error('The model returned an unreadable explanation.');
  for (const key of ['letter_type', 'who_from', 'plain_summary', 'reassurance']) {
    if (typeof data[key] !== 'string') throw new Error('The model omitted a required explanation field.');
  }
  if (!Array.isArray(data.actions) || data.actions.some(x => !x || typeof x.action !== 'string' || typeof x.by_when !== 'string')) throw new Error('The model returned incomplete actions.');
  if (!Array.isArray(data.amounts) || data.amounts.some(x => !x || typeof x.label !== 'string' || typeof x.amount !== 'string')) throw new Error('The model returned incomplete amounts.');
  if (typeof data.possible_scam !== 'boolean' || !['routine','needs action','urgent'].includes(data.urgency)) throw new Error('The model returned an incomplete explanation.');
  if (data.unclear_points !== undefined && (!Array.isArray(data.unclear_points) || data.unclear_points.some(x => typeof x !== 'string'))) throw new Error('The model returned unreadable uncertainty notes.');
  return data;
}
