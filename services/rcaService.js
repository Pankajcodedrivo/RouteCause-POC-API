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

/** ✅ Get a readable stream from S3 */
async function getFileStreamFromS3(bucket, key) {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await s3.send(command);
  return response.Body;
}

/** ✅ Generate presigned URL for image readability */
async function getSignedS3Url(bucket, key) {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return await getSignedUrl(s3, command, { expiresIn: 300 });
}

/** 🧠 Core RCA Generation Logic using Assistants API */
async function generateRootCause({ description, documents = [], images = [], deep = true }) {
  console.log('🟢 Starting RCA generation via Assistants API...');

  const uploadedDocs = [];
  try {
    // --- 1️⃣ Upload S3 documents to OpenAI ---
    for (const doc of documents) {
      const bucket = process.env.AWS_S3_BUCKET;
      const key = doc.key;
      const filename = doc.originalname || 'document';

      if (!bucket || !key) {
        console.warn(`⚠️ Skipping invalid document: ${filename}`);
        continue;
      }

      console.log(`📄 Uploading ${filename} from S3 to OpenAI...`);
      const fileStream = await getFileStreamFromS3(bucket, key);

      const uploadedFile = await client.files.create({
        file: fileStream,
        purpose: 'assistants',
      });

      uploadedDocs.push({ id: uploadedFile.id, name: filename });
    }

    // --- 2️⃣ Generate signed URLs for images ---
    const signedImages = await Promise.all(
      images.map(async (img) => {
        const bucket = process.env.AWS_S3_BUCKET;
        const key = img.key;
        const url = await getSignedS3Url(bucket, key);
        return { name: img.originalname, url };
      })
    );

    // --- 3️⃣ Build context lists ---
    const docList = uploadedDocs.map(d => d.name).join('\n') || 'none';
    const imgList = signedImages.map(i => i.name).join('\n') || 'none';

    // --- 4️⃣ Define system (assistant) prompt ---
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

    // --- 6️⃣ Create Assistant (with file_search tool) ---
    const assistant = await client.beta.assistants.create({
      name: "RCA Root Cause Assistant",
      instructions: systemPrompt,
      model: "gpt-4o-mini",
      tools: [{ type: "file_search" }], // ✅ REQUIRED for reading attachments
    });

    // --- 7️⃣ Create Thread ---
    const thread = await client.beta.threads.create();

    // --- 8️⃣ Add message with file attachments ---
    await client.beta.threads.messages.create(thread.id, {
      role: "user",
      content: [
        { type: "text", text: userPrompt },
        ...signedImages.map(img => ({
          type: "image_url",
          image_url: img.url,
        })),
      ],
      attachments: uploadedDocs.map(f => ({
        file_id: f.id,
        tools: [{ type: "file_search" }], // ✅ REQUIRED — fixes your 400 error
      })),
    });

    // --- 9️⃣ Run Assistant ---
    const run = await client.beta.threads.runs.create(thread.id, {
      assistant_id: assistant.id,
    });

    // Wait for completion
    let completedRun;
    while (true) {
      completedRun = await client.beta.threads.runs.retrieve(thread.id, run.id);
      if (completedRun.status === 'completed') break;
      if (completedRun.status === 'failed') throw new Error('Assistant run failed');
      await new Promise(r => setTimeout(r, 1000));
    }

    // --- 🔟 Fetch final message ---
    const messages = await client.beta.threads.messages.list(thread.id);
    const latest = messages.data[0]?.content?.[0]?.text?.value?.trim();

    let parsed;
    try {
      parsed = JSON.parse(latest);
      console.log('✅ RCA JSON parsed successfully.');
    } catch (err) {
      console.error('❌ Invalid JSON:', latest);
      throw new Error('Invalid JSON response from assistant');
    }

    // --- 🧹 Cleanup ---
    for (const doc of uploadedDocs) {
      try {
        await client.files.del(doc.id);
        console.log(`🧹 Deleted file: ${doc.name}`);
      } catch (err) {
        console.warn(`⚠️ Failed to delete ${doc.name}: ${err.message}`);
      }
    }

    return parsed;
  } catch (err) {
    console.error('❌ RCA generation failed:', err);
    throw err;
  }
}

module.exports = { generateRootCause };