const OpenAI = require('openai');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- AWS S3 Setup ---
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * ✅ Get a readable stream from S3
 */
async function getFileStreamFromS3(bucket, key) {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await s3.send(command);
  return response.Body; // returns a readable stream
}

/**
 * ✅ Get a presigned S3 URL (for image readability)
 */
async function getSignedS3Url(bucket, key) {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return await getSignedUrl(s3, command, { expiresIn: 300 }); // valid 5 minutes
}

/**
 * 🧠 Core RCA Generation Logic
 */
async function generateRootCause({ description, documents = [], images = [], deep = true }) {
  try {
    console.log('🟢 Starting RCA generation...');
    const openAiDocs = [];

    // --- 1️⃣ Upload documents to OpenAI for deep reading ---
    for (const doc of documents) {
      const bucket = process.env.AWS_S3_BUCKET;
      const key = doc.key;
      const filename = doc.originalname || 'document';

      if (!bucket || !key) {
        console.warn(`⚠️ Skipping invalid document: ${filename}`);
        continue;
      }

      console.log(`📄 Uploading document from S3 → OpenAI: ${filename}`);
      const stream = await getFileStreamFromS3(bucket, key);

      const uploadedFile = await client.files.create({
        file: stream,
        purpose: 'assistants',
        filename,
      });

      openAiDocs.push({
        id: uploadedFile.id,
        name: filename,
      });
    }

    // --- 2️⃣ Generate signed URLs for images ---
    const signedImages = await Promise.all(
      images.map(async (img) => {
        const bucket = process.env.AWS_S3_BUCKET;
        const key = img.key;
        const url = await getSignedS3Url(bucket, key);
        console.log(`🖼️ Image presigned URL: ${img.originalname} → ${url}`);
        return { name: img.originalname, url };
      })
    );

    // --- 3️⃣ Build readable lists for the model ---
    const docList = openAiDocs.map(d => d.name).join('\n') || 'none';
    const imgList = signedImages.map(i => i.name).join('\n') || 'none';

    // --- 4️⃣ Define system prompt ---
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

    // --- 5️⃣ Build user message ---
    const modeNote = deep
      ? `You are in **Deep Analysis Mode** — interpret file content from uploaded documents.`
      : `You are in **Quick Analysis Mode** — use only file names and descriptions.`;

    const userPrompt = `
${modeNote}

Defect Description:
${description || '(none provided)'}

Documents Uploaded:
${docList}

Images Uploaded:
${imgList}
`;

    // --- 6️⃣ Prepare image inputs ---
    const imageInputs = signedImages
      .filter(i => i.url)
      .map(i => ({
        type: 'image_url',
        image_url: i.url,
      }));

    // --- 7️⃣ Final messages for GPT ---
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: [{ type: 'text', text: userPrompt }, ...imageInputs, ...openAiDocs.map(doc => ({ type: 'file', file_id: doc.id }))] },
    ];

    console.log('🤖 Sending to GPT...');
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.4,
    });

    const text = response.choices?.[0]?.message?.content?.trim();

    // --- 8️⃣ Try to parse JSON result ---
    let result;
    try {
      const result = JSON.parse(text);
      console.log('✅ RCA generated successfully.');
    } catch (err) {
      console.error('❌ Invalid JSON from GPT:', text);
      throw new Error('Invalid JSON response from AI');
    }
    // --- 🔟 Cleanup: Delete OpenAI files ---
    for (const doc of openAiDocs) {
      try {
        await client.files.del(doc.id);
        console.log(`🧹 Deleted temporary OpenAI file: ${doc.name}`);
      } catch (delErr) {
        console.warn(`⚠️ Failed to delete file ${doc.name}: ${delErr.message}`);
      }
    }

    return result;
  } catch (err) {
    console.error('❌ RCA generation failed:', err);
    throw err;
  }
}

module.exports = { generateRootCause };