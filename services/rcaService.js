const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateRootCause({ description, documents, images }) {
  const docList = documents.map(d => d.originalname).join(', ');
  const imgList = images.map(i => i.originalname).join(', ');
  const systemPrompt = `
    You are an expert in manufacturing Root Cause Analysis (RCA) following DFMEA, PFMEA, and IATF 16949 standards.

    Your task:
    Analyze the provided defect description, inspection data, SPC data, LPA audits, process logs, images, and all attached reference documents.
    Synthesize information across all sources to determine the most probable root cause(s) using logical and probabilistic reasoning.

    Consider:
    - DFMEA and PFMEA failure modes and current controls
    - SPC trends, process parameter variations, and timestamps
    - LPA findings and audit results
    - Operator, shift, and environmental influences
    - Historical maintenance or calibration records

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
    - Use precise manufacturing and quality terminology (SPC, LPA, DFMEA, PFMEA, etc.).
    - Include **specific details** whenever possible:
      - Operator name or ID and shift (Who)
      - The exact failure or variation observed (What)
      - Time/date ranges and duration (When)
      - Process station, machine, or environment (Where)
      - Mechanism or reason explaining the linkage (How)
    - Quantify findings where available (e.g., “40% non-conformance rate,” “12 of 30 samples out of spec,” “deviation began 2024-09-14”).
    - Correlate SPC anomalies, LPA results, and process parameter data to identify causal chains.
    - The **"keyInsightForRCA"** field must summarize the integrated Who–What–When–Where–How explanation with supporting numeric data if available.
    - Distinguish between systemic and special cause variation.
    - Use evidence-backed probabilistic reasoning.
    - Return JSON only (no markdown, no comments, no extra text).
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
