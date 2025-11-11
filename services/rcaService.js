/**
 * Root Cause Analysis Generator
 * ----------------------------------------------
 * Reads documents directly from AWS S3,
 * extracts text (PDF, DOCX, XLSX, TXT),
 * builds a contextual RCA request,
 * and generates structured JSON via GPT-4o.
 */

const OpenAI = require("openai");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const XLSX = require("xlsx");

// --- Initialize OpenAI ---
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- AWS S3 Client ---
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/* -------------------------------------------------------------
   🧩 Utility Helpers
------------------------------------------------------------- */

/** Convert S3 stream to Buffer */
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/** Extract text from S3 object based on MIME type */
async function extractTextFromS3(bucket, key, mimeType) {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await s3.send(command);
  const buffer = await streamToBuffer(response.Body);

  switch (mimeType) {
    case "application/pdf": {
      const data = await pdfParse(buffer);
      return data.text;
    }
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      let text = "";
      workbook.SheetNames.forEach((sheetName) => {
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
        text += `\n--- Sheet: ${sheetName} ---\n${csv}`;
      });
      return text;
    }
    case "text/plain": {
      return buffer.toString("utf8");
    }
    default:
      return `⚠️ Unsupported file type: ${mimeType}`;
  }
}

/** Create presigned S3 URL for images (5-minute validity) */
async function getSignedS3Url(bucket, key) {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return await getSignedUrl(s3, command, { expiresIn: 300 });
}

/* -------------------------------------------------------------
   🧠 Root Cause Generator
------------------------------------------------------------- */

async function generateRootCause({ description, documents = [], images = [], deep = true }) {
  console.log("🟢 Starting deep RCA generation...");

  const bucket = process.env.AWS_S3_BUCKET;
  let combinedText = "";

  /* ------------------------------
     1️⃣ Extract text from S3 files
  ------------------------------ */
  for (const doc of documents) {
    if (!doc.key || !doc.mimetype) continue;

    console.log(`📄 Extracting: ${doc.originalname}`);
    try {
      const text = await extractTextFromS3(bucket, doc.key, doc.mimetype);
      combinedText += `\n\n===== ${doc.originalname} =====\n${text}`;
    } catch (err) {
      combinedText += `\n\n⚠️ Failed to read ${doc.originalname}: ${err.message}`;
    }
  }

  /* ------------------------------
     2️⃣ Generate signed image URLs
  ------------------------------ */
  const signedImages = [];
  for (const img of images) {
    if (!img.key) continue;
    try {
      const url = await getSignedS3Url(bucket, img.key);
      signedImages.push({ name: img.originalname, url });
    } catch (err) {
      console.warn(`⚠️ Failed to sign image ${img.originalname}: ${err.message}`);
    }
  }

  /* ------------------------------
     3️⃣ Build analysis prompts
  ------------------------------ */
  const systemPrompt = `
You are an expert in manufacturing Root Cause Analysis (RCA),
following DFMEA, PFMEA, and IATF 16949 standards.

Your mission:
Analyze the provided defect description and extracted file data
(PDF, Word, Excel, or text), along with optional images.
Identify the **top 3 most probable root causes**, ranked by likelihood.

Return strictly **valid JSON** in this structure:
{
  "rootCauses": [
    { "rank": "1", "cause": "string", "probability": "High", "factors": "string", "explanation": "string", "keyInsightForRCA": "string" },
    { "rank": "2", "cause": "string", "probability": "Medium", "factors": "string", "explanation": "string", "keyInsightForRCA": "string" },
    { "rank": "3", "cause": "string", "probability": "Low", "factors": "string", "explanation": "string", "keyInsightForRCA": "string" }
  ],
  "recommendations": { "shortTerm": "string", "longTerm": "string" },
  "references": [{ "title": "string", "description": "string" }]
}

Guidelines:
- Use DFMEA/PFMEA principles logically.
- Mention which document or data supports each cause.
- Quantify SPC or process variations when possible.
- Keep output concise, technical, and factual.
`;

  const modeNote = deep
    ? "🔍 Deep Analysis Mode: interpret document contents in detail."
    : "⚡ Quick Analysis Mode: summarize based on names and brief context.";

  const userPrompt = `
${modeNote}

🧾 Defect Description:
${description || "(none provided)"}

📚 Extracted Documents:
${combinedText || "(no document data)"}

🖼️ Image References:
${signedImages.map(i => `${i.name}: ${i.url}`).join("\n") || "(none)"}
`;
  console.log(userPrompt);
  /* ------------------------------
     4️⃣ Run GPT-4o Analysis
  ------------------------------ */
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini", // or "gpt-4-turbo" / "gpt-4o-mini"
    temperature: 0.4,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const text = response.choices[0].message.content.trim();

  /* ------------------------------
     5️⃣ Parse result safely
  ------------------------------ */
  try {
    const parsed = JSON.parse(text);
    console.log("✅ RCA JSON parsed successfully.");
    return parsed;
  } catch (err) {
    console.warn("⚠️ Invalid JSON returned, preserving raw text.");
    return { rawOutput: text };
  }
}

/* -------------------------------------------------------------
   Export for external use
------------------------------------------------------------- */
module.exports = { generateRootCause };
