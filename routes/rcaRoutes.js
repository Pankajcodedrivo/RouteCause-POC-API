const express = require('express');
const rcaController = require('../controllers/rcaController');
const multer = require('multer');
const { S3Client } = require('@aws-sdk/client-s3');
const multerS3 = require('multer-s3');

const router = express.Router();

const s3 = new S3Client({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
});


// ✅ Multer S3 setup
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_S3_BUCKET,
    acl: 'private', // or 'public-read' if you want to allow viewing
    key: (req, file, cb) => {
      cb(null, `uploads/${Date.now()}_${file.originalname}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
});

// --- Routes ---
router.post(
  '/analyze',
  upload.fields([
    { name: 'documents', maxCount: 5 },
    { name: 'images', maxCount: 5 },
  ]),
  rcaController.generateRootCauseAnalysis
);

router.post('/sendEmail', rcaController.sendEmailReport);
router.post('/sendFeedback', rcaController.sendFeedback);

module.exports = router;