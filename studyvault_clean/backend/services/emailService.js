const https = require('https');

const sendBrevoEmail = (toEmail, toName, subject, htmlContent) => {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      sender: { name: 'StudyVault', email: 'sindhuturkio20@gmail.com' },
      to: [{ email: toEmail, name: toName || 'Student' }],
      subject: subject,
      htmlContent: htmlContent
    });
    const options = {
      hostname: 'api.brevo.com',
      path: '/v3/smtp/email',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY
      }
    };
    const req = https.request(options, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve());
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
};

const sendOTPEmail = async (toEmail, name, otp) => {
  await sendBrevoEmail(toEmail, name, 'StudyVault — Verify Your Email', `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;background:#0d0f14;color:#f0eee8;padding:30px;border-radius:12px">
      <h2 style="color:#f0c93a;font-size:24px;margin-bottom:8px">StudyVault</h2>
      <p style="color:#7a8099;margin-bottom:24px">Student Resource Platform</p>
      <h3 style="color:#f0eee8">Hi ${name}, verify your email</h3>
      <p style="color:#7a8099">Your one-time verification code is:</p>
      <div style="background:#1c2030;border:2px solid #f0c93a;border-radius:12px;padding:20px;text-align:center;margin:20px 0">
        <span style="font-size:36px;font-weight:900;letter-spacing:8px;color:#f0c93a">${otp}</span>
      </div>
      <p style="color:#7a8099;font-size:13px">This code expires in <strong style="color:#f0eee8">10 minutes</strong>.</p>
    </div>
  `);
};

const sendWelcomeEmail = async (toEmail, name) => {
  await sendBrevoEmail(toEmail, name, 'Welcome to StudyVault 🎉', `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;background:#0d0f14;color:#f0eee8;padding:30px;border-radius:12px">
      <h2 style="color:#f0c93a">Welcome to StudyVault, ${name}!</h2>
      <p style="color:#7a8099">Your account has been verified. You now have access to all student resources.</p>
    </div>
  `);
};

const notifyAdmin = async (subject, details) => {
  const time = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
  const rows = Object.entries(details).map(([k,v]) => `<tr><td style="color:#7a8099;padding:6px">${k}</td><td style="color:#f0eee8;padding:6px">${v}</td></tr>`).join('');
  await sendBrevoEmail(process.env.ADMIN_EMAIL, 'Admin', `[StudyVault] ${subject}`, `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;background:#0d0f14;color:#f0eee8;padding:30px;border-radius:12px">
      <h2 style="color:#f0c93a">StudyVault — Admin Alert</h2>
      <table style="width:100%">${rows}<tr><td style="color:#7a8099;padding:6px">TIME</td><td style="color:#f0eee8;padding:6px">${time} PKT</td></tr></table>
    </div>
  `);
};

const sendPasswordResetEmail = async (toEmail, name, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password.html?token=${resetToken}`;
  await sendBrevoEmail(toEmail, name, 'StudyVault — Reset Your Password', `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;background:#0d0f14;color:#f0eee8;padding:30px;border-radius:12px">
      <h2 style="color:#f0c93a">Reset Your Password</h2>
      <p style="color:#7a8099">Hi ${name}, click below to reset your password.</p>
      <a href="${resetUrl}" style="display:inline-block;background:#f0c93a;color:#0d0f14;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin:20px 0">Reset Password</a>
    </div>
  `);
};

module.exports = { sendOTPEmail, sendWelcomeEmail, notifyAdmin, sendPasswordResetEmail };