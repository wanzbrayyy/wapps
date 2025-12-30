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
        @media screen and (max-width: 600px) {
          .container { width: 100% !important; }
          .btn { display: block; width: 100%; text-align: center; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f6f8; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="center" style="padding: 40px 0;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" class="container" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); overflow: hidden;">
              <tr>
                <td align="center" style="background-color: #ff4b6e; padding: 30px 0;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 1px;">
                    <i class="fa-solid fa-heart" style="margin-right: 10px;"></i>w dating apps
                  </h1>
                </td>
              </tr>
              <tr>
                <td style="padding: 40px 30px;">
                  <h2 style="color: #333333; font-size: 20px; margin-top: 0; margin-bottom: 20px;">Halo!</h2>
                  <div style="color: #555555; font-size: 16px; line-height: 24px; margin-bottom: 30px;">
                    ${options.message}
                  </div>
                </td>
              </tr>
              <tr>
                <td align="center" style="background-color: #f9fafb; padding: 20px; border-top: 1px solid #eeeeee;">
                  <p style="margin: 0; color: #888888; font-size: 12px;">
                    &copy; ${new Date().getFullYear()} w dating apps.
                  </p>
                  <div style="margin-top: 10px;">
                    <a href="#" style="color: #ff4b6e; text-decoration: none; margin: 0 5px;"><i class="fa-brands fa-facebook"></i></a>
                    <a href="#" style="color: #ff4b6e; text-decoration: none; margin: 0 5px;"><i class="fa-brands fa-twitter"></i></a>
                    <a href="#" style="color: #ff4b6e; text-decoration: none; margin: 0 5px;"><i class="fa-brands fa-instagram"></i></a>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: options.email,
    subject: options.subject,
    html: htmlTemplate,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;