// utils/emailService.js
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendEmail({ to, subject, templateId, dynamicTemplateData }) {
  try {
    // ✅ Normalize recipients (array or comma-separated string)
    const recipients = Array.isArray(to)
      ? to
      : to.split(",").map(email => email.trim()).filter(Boolean);

    // ✅ Build message using your dynamic template ID
    const msg = {
      to: recipients,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL,
        name: "Root Cause Analysis System", // Friendly sender
      },
      subject, // optional — SendGrid uses template subject if defined
      templateId:templateId, // ✅ your template ID
      dynamicTemplateData: dynamicTemplateData,
      trackingSettings: {
        clickTracking: { enable: false },
        openTracking: { enable: true },
      },
      headers: {
        "X-Mailer": "RCA-System-Mailer",
      },
    };

    const result = await sgMail.sendMultiple(msg);
    console.log("✅ Email sent successfully to:", recipients);
    return result;

  } catch (error) {
    console.error("❌ Error sending email:", error.response?.body || error.message);
    throw error;
  }
}

module.exports = { sendEmail };
