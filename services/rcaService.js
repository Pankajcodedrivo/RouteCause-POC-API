const OpenAI = require('openai');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// ✅ Efficient presigner: works with both "key" and "location"
async function getPresignedUrl(file) {
  try {
    let bucket = process.env.AWS_S3_BUCKET;
    let key;
    
    if (file.key) {
      key = file.key;
    } else if (file.location) {
      // Parse location only if key not provided
      const match = file.location.match(/^https:\/\/([^.]*)\.s3[.-][^.]+\.amazonaws\.com\/(.+)$/);
      if (match) {
        bucket = match[1];
        key = match[2];
      }
    }
    console.log(bucket);
     console.log(key);
    if (!key) throw new Error('Missing S3 key or location');

    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return await getSignedUrl(s3, command, { expiresIn: 300 });
  } catch (err) {
    console.error('Presign failed:', err.message);
    return null;
  }
}

// ✅ Core RCA generation logic
async function generateRootCause({ description, documents, images, deep = true }) {
  // Generate signed URLs for docs/images
  console.log(documents);
  const signedDocuments = await Promise.all(
    documents.map(async (d) => ({
      name: d.originalname,
      url: await getPresignedUrl(d),
    }))
  );

  const signedImages = await Promise.all(
    images.map(async (i) => ({
      name: i.originalname,
      url: await getPresignedUrl(i),
    }))
  );

  // Build readable doc + image lists
  const docList = signedDocuments
    .map((d) => `${d.name} (${d.url ? d.url : 'unavailable'})`)
    .join('\n');
  const imgList = signedImages
    .map((i) => `${i.name} (${i.url ? i.url : 'unavailable'})`)
    .join('\n');

  // ------------------- AI PROMPT -------------------
  const systemPrompt = `
You are an expert in manufacturing Root Cause Analysis (RCA) following DFMEA, PFMEA, and IATF 16949 standards.

Your task:
Analyze the defect description, inspection data, SPC data, LPA audits, and uploaded reference files (documents + images).
Use these inputs to determine the **top 3 most probable root causes**, ranked by probability.

Return only **valid JSON** in this structure:
{
  "rootCauses": [
    {
      "rank": "1",
      "cause": "string",
      "probability": "High",
      "factors": "string",
      "explanation": "string",
      "keyInsightForRCA": "string"
    },
    {
      "rank": "2",
      "cause": "string",
      "probability": "Medium",
      "factors": "string",
      "explanation": "string",
      "keyInsightForRCA": "string"
    },
    {
      "rank": "3",
      "cause": "string",
      "probability": "Low",
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
- Integrate DFMEA, PFMEA, SPC, and LPA data logically.
- Provide evidence-backed reasoning (Who, What, When, Where, How).
- Mention which document or image supports each finding.
- Quantify SPC or process variations when possible.
- Keep manufacturing terminology accurate and concise.
`;

  // 🧠 If deep mode enabled, let model know to prioritize document interpretation
  const modeNote = deep
    ? `You are in **Deep Analysis Mode** — interpret file content from uploaded documents.`
    : `You are in **Quick Analysis Mode** — use only file names and descriptions.`;

  const userPrompt = `
${modeNote}

Defect Description:
${description || '(none provided)'}

Documents Uploaded:
${docList || 'none'}

Images Uploaded:
${imgList || 'none'}
`;
console.log(userPrompt);
  // Pass images to model for multimodal input
  const imageInputs = signedImages
    .filter((i) => i.url)
    .map((i) => ({
      type: 'image_url',
      image_url: i.url,
    }));

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: [{ type: 'text', text: userPrompt }, ...imageInputs] },
  ];

  // ------------------- AI CALL -------------------
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.4,
  });

  const text = response.choices?.[0]?.message?.content?.trim();

  try {
    return JSON.parse(text);
  } catch (err) {
    console.error('❌ Invalid JSON:', text);
    throw new Error('Invalid JSON response from AI');
  }
}

module.exports = { generateRootCause };
