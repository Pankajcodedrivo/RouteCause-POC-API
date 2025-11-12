// utils/emailService.js
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendEmail({ to, subject, text, html }) {
  try {
    // ✅ Support comma-separated or array inputs
    const recipients = Array.isArray(to)
      ? to
      : to.split(",").map(email => email.trim()).filter(Boolean);

    const msg = {
      to: recipients,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject,
      text,
      html,
    };
    console.log(msg);
    const result = await sgMail.sendMultiple(msg); // ✅ use sendMultiple instead of send
    console.log("✅ Email sent successfully",recipients);
    return result;
  } catch (error) {
    console.error("❌ Error sending email:", error.response?.body || error.message);
    throw error;
  }
}

module.exports = { sendEmail };
