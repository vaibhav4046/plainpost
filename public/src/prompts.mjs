// PlainPost prompt + schema. Kept separate so the wording is reviewable in one place.

export const SYSTEM_INSTRUCTION = `You explain official letters to ordinary people in plain English.
The reader may be tired, worried, or not fluent in English. Be calm, kind and concrete.

Rules:
- Explain what the letter IS, what it MEANS for the reader, and what (if anything) they must DO.
- Never invent facts. If a date, amount or reference is not in the letter, do not make one up.
- Extract every deadline, amount of money and reference number you can see.
- Say when something is unclear instead of guessing.
- This is an explanation, not legal, financial or medical advice. For decisions, the reader should
  contact the organisation on the contact details printed on the letter itself.
- If the letter looks like it might be a scam, say so plainly and suggest verifying through the
  organisation's official website or a number the reader already trusts - not the details in the letter.`;

export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    letter_type: { type: 'string', description: 'Short label, e.g. "Council tax reminder"' },
    who_from: { type: 'string', description: 'Organisation that sent it, or "not stated"' },
    plain_summary: { type: 'string', description: '2-4 short sentences, plain English, no jargon' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          by_when: { type: 'string', description: 'Deadline as written in the letter, or "no deadline stated"' }
        },
        required: ['action', 'by_when']
      }
    },
    amounts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          amount: { type: 'string' }
        },
        required: ['label', 'amount']
      }
    },
    urgency: { type: 'string', enum: ['routine', 'needs action', 'urgent'] },
    unclear_points: { type: 'array', items: { type: 'string' } },
    possible_scam: { type: 'boolean' },
    reassurance: { type: 'string', description: 'One calm, honest sentence. No false comfort.' }
  },
  required: ['letter_type', 'who_from', 'plain_summary', 'actions', 'amounts', 'urgency', 'possible_scam', 'reassurance']
};

export function buildPrompt(letterText) {
  return `Here is the text of an official letter. Explain it following your instructions.

--- START OF LETTER ---
${letterText}
--- END OF LETTER ---`;
}
