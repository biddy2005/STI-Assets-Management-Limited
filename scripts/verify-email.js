require('dotenv').config();


const env =
  require('../config/env');


const {
  transporter,
  isMailerConfigured
} = require(
  '../config/mailer'
);


async function main() {

  if (
    !isMailerConfigured() ||
    !transporter
  ) {
    throw new Error(
      'Email is not configured. Check the SMTP environment variables.'
    );
  }


  console.log(
    'Checking Gmail SMTP connection...'
  );


  /*
   * Verify authentication and SMTP connectivity without
   * printing credentials.
   */
  await transporter.verify();


  console.log(
    'Gmail SMTP authentication successful.'
  );


  console.log(
    'Sending test notification...'
  );


  const result =
    await transporter.sendMail({
      from:
        `STI Assets Management Website <${env.smtpUser}>`,

      to:
        env.notifyEmail,

      subject:
        'STI Website Email Integration Test',

      text: [
        'This is a test notification from the STI Assets Management website.',
        '',
        'If you received this email, Gmail SMTP integration is working correctly.',
        '',
        `Sender: ${env.smtpUser}`,
        `Notification mailbox: ${env.notifyEmail}`
      ].join('\n')
    });


  console.log(
    'Test email sent successfully.'
  );


  console.log(
    'Message ID:',
    result.messageId
  );
}


main()
  .catch(
    (error) => {
      console.error(
        'Email test failed:',
        error.message
      );

      process.exitCode =
        1;
    }
  );