const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateRootCause({ description, documents, images }) {
  const docList = documents.map(d => d.originalname).join(', ');
  const imgList = images.map(i => i.originalname).join(', ');
  const systemPrompt = `
  You are an expert in manufacturing Root Cause Analysis (RCA) following DFMEA, PFMEA, and IATF 16949 standards.
  Your task:
  Analyze the provided defect description, inspection data, SPC data, images, and all attached reference documents (PFMEA, LPA results, process logs, etc.). 
  Synthesize information across all sources to determine the most probable root cause(s) using logical, probabilistic reasoning.

  Consider:
  - DFMEA and PFMEA failure modes and existing controls
  - SPC trends, process parameter variations, and timestamps
  - LPA findings and audit trails
  - Operator, shift, and environmental influences
  - Historical or maintenance evidence

  Output **only valid JSON** in the following format:

  {
    "rootCauses": [
      {
        "cause": "string",
        "probability": "string",
        "factors": "string",
        "explanation": "string",
        "keyInsightForRCA": "string"
      }
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
  - Use technical manufacturing and quality terminology (SPC, LPA, DFMEA, PFMEA, etc.).
  - Incorporate **specific data details**: operator shift, date/time ranges, and affected process parameters where possible.
  - Correlate findings across SPC trends, LPA audits, and process data.
  - Clearly identify systemic vs. special cause variations.
  - The "keyInsightForRCA" field should summarize the most critical evidence-driven conclusion linking multiple data sources.
  - Use probabilistic reasoning and evidence-backed logic.
  - Return JSON only (no markdown, comments, or formatting).
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
