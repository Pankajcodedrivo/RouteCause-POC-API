const { generateRootCause } = require('../services/rcaService');
const { sendEmail } = require('../utils/emailService');
const fs = require('fs');
const path = require('path')

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

    const { rootCauses, recommendations, references } = JSON.parse(data);
    const logoUrl = `${process.env.BASE_URL}/uploads/logo.png`;
    // Load template file
    const templatePath = path.join(process.cwd(), 'templates', 'emailReport.html');
    let html = fs.readFileSync(templatePath, 'utf8');

    // Build HTML fragments
    const rootCausesHTML = rootCauses
      .map(
        rc => `
          <tr>
            <td>${rc.cause || '-'}</td>
            <td>${rc.probability || '-'}</td>
            <td>${rc.factors || '-'}</td>
            <td>${rc.explanation || '-'}</td>
          </tr>
        `
      )
      .join('');

    const referencesHTML = references
      .map(ref => `<li><strong>${ref.title}</strong> ${ref.description}</li>`)
      .join('');

    // Replace placeholders
    html = html
      .replace('{{rootCauses}}', rootCausesHTML)
      .replace('{{shortTerm}}', recommendations.shortTerm || '-')
      .replace('{{longTerm}}', recommendations.longTerm || '-')
      .replace('{{references}}', referencesHTML);

    // Send email
    await sendEmail({
      to: email,
      subject: 'Root Cause Analysis Report',
      html,
    });

    res.json({ success: true, message: 'Email sent successfully' });
  } catch (err) {
    console.error('❌ Email send failed:', err);
    res.status(500).json({ success: false, message: 'Failed to send email' });
  }
};

module.exports = { generateRootCauseAnalysis, sendEmailReport };