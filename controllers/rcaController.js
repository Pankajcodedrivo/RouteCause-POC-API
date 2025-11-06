const { generateRootCause } = require('../services/rcaService');
const { sendEmail } = require('../utils/emailService');

const generateRootCauseAnalysis = async (req, res) => {
  try {
    const { description } = req.body;
    const documents = (req.files?.documents || []).map(f => ({
      originalname: f.originalname,
      location: f.location, // S3 URL
    }));
    const images = (req.files?.images || []).map(f => ({
      originalname: f.originalname,
      location: f.location,
    }));

    const result = await generateRootCause({ description, documents, images });

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('❌ RCA generation failed:', err);
    res.status(500).json({ success: false, message: err.message || 'RCA generation failed' });
  }
};

const sendEmailReport = async (req, res) => {
  try {
    const { email, data } = req.body;
    if (!email || !data) {
      return res.status(400).json({ success: false, message: 'Email and data required' });
    }

    await sendEmail({
      to: email,
      subject: 'Root Cause Analysis Report',
      html: `<h2>Root Cause Analysis Report</h2><pre>${JSON.stringify(JSON.parse(data), null, 2)}</pre>`,
    });

    res.json({ success: true, message: 'Email sent successfully' });
  } catch (err) {
    console.error('❌ Email send failed:', err);
    res.status(500).json({ success: false, message: 'Failed to send email' });
  }
};

module.exports = { generateRootCauseAnalysis, sendEmailReport };