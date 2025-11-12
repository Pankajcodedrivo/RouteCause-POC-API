// utils/emailService.js
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendEmail({ to, subject, html }) {
  try {
    // ✅ Normalize recipients (array or comma-separated string)
    const recipients = Array.isArray(to)
      ? to
      : to.split(",").map(email => email.trim()).filter(Boolean);

    // ✅ Generate a plain text version for spam filters
    const text = html
      .replace(/<\/?[^>]+(>|$)/g, "") // remove HTML tags
      .replace(/\s{2,}/g, " ")        // collapse extra spaces
      .trim();

    // ✅ Construct safe and authenticated email
    const msg = {
      to: recipients,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL,
        name: "Root Cause Analysis System", // ✅ Friendly, consistent sender name
      },
      subject: subject.trim(),
      text, // ✅ Plain text fallback
      html,
      trackingSettings: {
        clickTracking: { enable: false }, // ✅ Avoids "tracking link" spam signals
        openTracking: { enable: true },
      },
      mailSettings: {
        bypassSpamManagement: { enable: false },
        sandboxMode: { enable: process.env.NODE_ENV === "development" },
      },
      headers: {
        "X-Mailer": "RCA-System-Mailer", // ✅ Identifiable mailer header
      },
    };

    // ✅ Send the email using SendGrid’s multi-recipient method
    const result = await sgMail.sendMultiple(msg);
    console.log("✅ Email sent successfully to:", recipients);
    return result;

  } catch (error) {
    console.error("❌ Error sending email:", error.response?.body || error.message);
    throw error;
  }
}

module.exports = { sendEmail };
