const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateRootCause({ description, documents, images }) {
  const docList = documents.map(d => d.originalname).join(', ');
  const imgList = images.map(i => i.originalname).join(', ');

  const systemPrompt = `
You are an expert in manufacturing Root Cause Analysis (RCA) following DFMEA, PFMEA, and IATF 16949 standards.

Your task:
Analyze the provided defect description, inspection data, SPC data, images, and all attached reference documents (not just PFMEA). 
Synthesize information across all sources to determine the most probable root cause(s) using logical, probabilistic reasoning.

Consider:
- PFMEA and DFMEA failure modes and controls
- Process data, SPC charts, and trends
- Inspection and measurement results
- Operator or environmental factors
- Historical or document-based evidence

Output **only valid JSON** in this format:

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

Guidelines:
- Use technical manufacturing terminology.
- Use probabilistic reasoning based on evidence from all provided data.
- Avoid repeating PFMEA data unless it is directly relevant.
- Return JSON only (no markdown or comments).
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
