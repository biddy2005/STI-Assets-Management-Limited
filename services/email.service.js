const transporter =
  require('../config/mailer');

async function sendContactNotification({
  name,
  email,
  phone,
  subject,
  message
}) {
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: process.env.NOTIFY_EMAIL,
    replyTo: email,
    subject:
      subject ||
      'New website contact message',
    text: [
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone || 'Not provided'}`,
      '',
      message
    ].join('\n')
  });
}

module.exports = {
  sendContactNotification
};