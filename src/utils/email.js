const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const htmlTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap');
        body { margin: 0; padding: 0; background-color: #f4f6f8; font-family: 'Poppins', sans-serif; }
        .container { width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.08); }
        .header { background: linear-gradient(135deg, #ff4b6e 0%, #ff8fa3 100%); padding: 40px 20px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 1px; }
        .content { padding: 40px 30px; text-align: center; }
        .otp-box { background-color: #f8f9fa; border: 2px dashed #ff4b6e; border-radius: 12px; padding: 20px; margin: 30px 0; display: inline-block; }
        .otp-code { font-size: 32px; font-weight: 800; color: #333; letter-spacing: 5px; margin: 0; font-family: 'Courier New', monospace; }
        .footer { background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #eeeeee; font-size: 12px; color: #888888; }
        .social-icons a { color: #ff4b6e; margin: 0 10px; font-size: 18px; text-decoration: none; }
      </style>
    </head>
    <body>
      <div style="padding: 40px 0;">
        <div class="container">
          <div class="header">
            <h1><i class="fa-solid fa-heart" style="margin-right: 10px;"></i>W Apps</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 14px;">Dating & Chat Securely</p>
          </div>
          
          <div class="content">
            <h2 style="color: #333; margin-bottom: 10px;">Reset Password Code</h2>
            <p style="color: #666; line-height: 1.6;">Halo, kami menerima permintaan untuk mereset password akun Anda. Gunakan kode OTP 10 digit di bawah ini untuk melanjutkan:</p>
            
            <div class="otp-box">
              <p class="otp-code">${options.otp}</p>
            </div>

            <p style="color: #999; font-size: 13px;">Kode ini hanya berlaku selama 10 menit. Jangan berikan kode ini kepada siapapun.</p>
          </div>

          <div class="footer">
            <div class="social-icons" style="margin-bottom: 15px;">
              <a href="#"><i class="fa-brands fa-instagram"></i></a>
              <a href="#"><i class="fa-brands fa-twitter"></i></a>
              <a href="#"><i class="fa-brands fa-facebook"></i></a>
            </div>
            <p>&copy; ${new Date().getFullYear()} W Apps Inc. All rights reserved.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: options.email,
    subject: `🔐 ${options.otp} adalah kode verifikasi Anda`,
    html: htmlTemplate,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;