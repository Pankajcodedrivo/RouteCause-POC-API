const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateRootCause({ description, documents, images }) {
  const docList = documents.map(d => d.originalname).join(', ');
  const imgList = images.map(i => i.originalname).join(', ');

  const systemPrompt = `
You are an expert in manufacturing Root Cause Analysis (RCA).
Analyze the provided defect description, inspection data, and any reference files.
Return **only valid JSON** in this format:

{
  "rootCauses": [
    { "cause": "string", "probability": "string", "factors": "string", "explanation": "string" }
  ],
  "recommendations": {
    "shortTerm": "string",
    "longTerm": "string"
  },
  "references": [
    { "title": "string", "description": "string" }
  ]
}

Use manufacturing terms aligned with DFMEA / PFMEA / IATF standards.
Do not include markdown or comments.
`;

  const userPrompt = `
Defect Description: ${description || '(none provided)'}
Documents Uploaded: ${docList || 'none'}
Images Uploaded: ${imgList || 'none'}
`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.4,
  });

  const text = response.choices?.[0]?.message?.content?.trim();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Invalid JSON response from AI');
  }
}

module.exports = { generateRootCause };
