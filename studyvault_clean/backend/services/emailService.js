const nodemailer = require('nodemailer');

// Create reusable transporter using Gmail SMTP with port 465
const createTransporter = () => {
  return nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};// ── Send OTP Email to student ──
const sendOTPEmail = async (toEmail, name, otp) => {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"StudyVault" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'StudyVault — Verify Your Email',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;background:#0d0f14;color:#f0eee8;padding:30px;border-radius:12px">
        <h2 style="color:#f0c93a;font-size:24px;margin-bottom:8px">StudyVault</h2>
        <p style="color:#7a8099;margin-bottom:24px">Student Resource Platform</p>
        <h3 style="color:#f0eee8">Hi ${name}, verify your email</h3>
        <p style="color:#7a8099">Your one-time verification code is:</p>
        <div style="background:#1c2030;border:2px solid #f0c93a;border-radius:12px;padding:20px;text-align:center;margin:20px 0">
          <span style="font-size:36px;font-weight:900;letter-spacing:8px;color:#f0c93a">${otp}</span>
        </div>
        <p style="color:#7a8099;font-size:13px">This code expires in <strong style="color:#f0eee8">10 minutes</strong>.</p>
        <p style="color:#7a8099;font-size:13px">If you didn't request this, ignore this email.</p>
      </div>
    `
  });
};

// ── Send Welcome Email to new student ──
const sendWelcomeEmail = async (toEmail, name) => {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"StudyVault" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Welcome to StudyVault 🎉',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;background:#0d0f14;color:#f0eee8;padding:30px;border-radius:12px">
        <h2 style="color:#f0c93a">Welcome to StudyVault, ${name}!</h2>
        <p style="color:#7a8099">Your account has been verified. You now have access to all student resources.</p>
        <ul style="color:#7a8099;line-height:2">
          <li>Browse and download notes, past papers & assignments</li>
          <li>Upload your own resources and earn points</li>
          <li>Rate and comment on resources</li>
        </ul>
        <p style="color:#7a8099;font-size:13px;margin-top:20px">Happy studying! 📚</p>
      </div>
    `
  });
};

// ── Notify Admin on every important action ──
const notifyAdmin = async (subject, details) => {
  const transporter = createTransporter();
  const time = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
  await transporter.sendMail({
    from: `"StudyVault Admin Alert" <${process.env.EMAIL_USER}>`,
    to: process.env.ADMIN_EMAIL,
    subject: `[StudyVault] ${subject}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;background:#0d0f14;color:#f0eee8;padding:30px;border-radius:12px">
        <h2 style="color:#f0c93a">StudyVault — Admin Alert</h2>
        <div style="background:#1c2030;border-left:4px solid #f0c93a;padding:16px;border-radius:8px;margin:16px 0">
          <p style="color:#f0eee8;font-size:15px;margin:0"><strong>${subject}</strong></p>
        </div>
        <table style="width:100%;color:#7a8099;font-size:13px">
          ${Object.entries(details).map(([k,v]) => `
            <tr>
              <td style="padding:6px 0;color:#7a8099;text-transform:uppercase;font-size:11px">${k}</td>
              <td style="padding:6px 0;color:#f0eee8">${v}</td>
            </tr>
          `).join('')}
          <tr>
            <td style="padding:6px 0;color:#7a8099;text-transform:uppercase;font-size:11px">TIME</td>
            <td style="padding:6px 0;color:#f0eee8">${time} (PKT)</td>
          </tr>
        </table>
      </div>
    `
  });
};

// ── Password Reset Email ──
const sendPasswordResetEmail = async (toEmail, name, resetToken) => {
  const transporter = createTransporter();
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password.html?token=${resetToken}`;
  await transporter.sendMail({
    from: `"StudyVault" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'StudyVault — Reset Your Password',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;background:#0d0f14;color:#f0eee8;padding:30px;border-radius:12px">
        <h2 style="color:#f0c93a">Reset Your Password</h2>
        <p style="color:#7a8099">Hi ${name}, click the button below to reset your password.</p>
        <a href="${resetUrl}" style="display:inline-block;background:#f0c93a;color:#0d0f14;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin:20px 0">Reset Password</a>
        <p style="color:#7a8099;font-size:12px">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
      </div>
    `
  });
};

module.exports = { sendOTPEmail, sendWelcomeEmail, notifyAdmin, sendPasswordResetEmail };