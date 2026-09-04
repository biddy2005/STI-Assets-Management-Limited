const env =
  require('../config/env');


/*
 * Keep webhook calls short.
 *
 * A Microsoft 365 issue must never leave the public Contact
 * form waiting indefinitely.
 */
const WEBHOOK_TIMEOUT_MS =
  5_000;


/**
 * Send one Contact submission to the Microsoft 365
 * Power Automate workflow.
 *
 * PostgreSQL remains the application's source of truth.
 *
 * When the webhook has not been configured, the integration
 * is deliberately skipped so local development and tests can
 * continue normally.
 */
async function sendContactToPowerAutomate({
  submissionId,
  name,
  email,
  phone,
  subject,
  message,
  submittedAt
}) {
  if (!env.powerAutomateContactUrl) {
    return {
      sent: false,
      skipped: true,
      statusCode: null
    };
  }


  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      WEBHOOK_TIMEOUT_MS
    );


  try {
    const response =
      await fetch(
        env.powerAutomateContactUrl,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
              schemaVersion:
                1,

              submissionId,

              name,

              email,

              /*
               * Our Power Automate schema expects strings.
               * Prisma permits these fields to be null.
               */
              phone:
                phone || '',

              subject:
                subject || '',

              message,

              submittedAt:
                submittedAt instanceof Date
                  ? submittedAt.toISOString()
                  : String(
                      submittedAt
                    )
            }),

          signal:
            controller.signal
        }
      );


    if (!response.ok) {
      const error =
        new Error(
          `Power Automate webhook returned HTTP ${response.status}.`
        );

      error.statusCode =
        response.status;

      throw error;
    }


    return {
      sent: true,
      skipped: false,
      statusCode:
        response.status
    };
  } finally {
    clearTimeout(
      timeout
    );
  }
}

/**
 * Send one job application event to the Microsoft 365
 * Power Automate workflow.
 *
 * PostgreSQL and private résumé storage remain the
 * application's source of truth.
 *
 * The résumé itself is deliberately not sent to Power Automate.
 * Administrators can access it through the authenticated
 * application-management area.
 */
async function sendCareerApplicationToPowerAutomate({
  applicationId,
  applicantName,
  email,
  phone,
  coverNote,
  jobId,
  jobTitle,
  submittedAt,
  resumeOriginalName,
  resumeMimeType,
  resumeContentBase64
}) {
  if (!env.powerAutomateCareersUrl) {
    return {
      sent: false,
      skipped: true,
      statusCode: null
    };
  }


  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      WEBHOOK_TIMEOUT_MS
    );


  try {
    const response =
      await fetch(
        env.powerAutomateCareersUrl,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
              schemaVersion:
                1,

              applicationId,

              applicantName,

              email,

              phone:
                phone || '',

              coverNote:
                coverNote || '',

              jobId,

              jobTitle,

                submittedAt:
                  submittedAt instanceof Date
                    ? submittedAt.toISOString()
                    : String(
                        submittedAt
                      ),

                resume: {
                  name:
                    resumeOriginalName,

                  contentType:
                    resumeMimeType,

                  contentBytes:
                    resumeContentBase64
                }
            }),

          signal:
            controller.signal
        }
      );


    if (!response.ok) {
      const error =
        new Error(
          `Power Automate webhook returned HTTP ${response.status}.`
        );

      error.statusCode =
        response.status;

      throw error;
    }


    return {
      sent: true,
      skipped: false,
      statusCode:
        response.status
    };
  } finally {
    clearTimeout(
      timeout
    );
  }
}

/**
 * Send one newsletter subscription event to the Microsoft 365
 * Power Automate workflow.
 */
async function sendNewsletterToPowerAutomate({
  subscriberId,
  email,
  subscribedAt,
  unsubscribeUrl
}) {
  if (
    !env.powerAutomateNewsletterUrl
  ) {
    return {
      sent: false,
      skipped: true,
      statusCode: null
    };
  }


  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      WEBHOOK_TIMEOUT_MS
    );


  try {
    const response =
      await fetch(
        env.powerAutomateNewsletterUrl,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
              schemaVersion:
                1,

              subscriberId,

              email,

              subscribedAt:
                subscribedAt instanceof Date
                  ? subscribedAt.toISOString()
                  : String(
                      subscribedAt
                    ),

                    unsubscribeUrl
            }),

          signal:
            controller.signal
        }
      );


    if (!response.ok) {
      const error =
        new Error(
          `Power Automate webhook returned HTTP ${response.status}.`
        );

      error.statusCode =
        response.status;

      throw error;
    }


    return {
      sent: true,
      skipped: false,
      statusCode:
        response.status
    };
  } finally {
    clearTimeout(
      timeout
    );
  }
}

/**
 * Requests an unsubscribe operation from the Microsoft 365
 * newsletter workflow.
 *
 * This call must receive a successful final response before
 * the website tells the subscriber they were unsubscribed.
 */
async function sendNewsletterUnsubscribeToPowerAutomate({
  subscriberId
}) {
  if (
    !env
      .powerAutomateNewsletterUnsubscribeUrl
  ) {
    const error =
      new Error(
        'Newsletter unsubscribe webhook is not configured.'
      );

    error.code =
      'POWER_AUTOMATE_NOT_CONFIGURED';

    throw error;
  }


  const controller =
    new AbortController();


  /*
   * Unlike subscription notifications, this operation affects
   * the subscriber's preference. Give the synchronous flow a
   * little longer to complete the SharePoint update.
   */
  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      10_000
    );


  try {
    const response =
      await fetch(
        env
          .powerAutomateNewsletterUnsubscribeUrl,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
              schemaVersion:
                1,

              subscriberId
            }),

          signal:
            controller.signal
        }
      );


    if (!response.ok) {
      const error =
        new Error(
          `Power Automate unsubscribe webhook returned HTTP ${response.status}.`
        );

      error.statusCode =
        response.status;

      throw error;
    }


    return {
      sent:
        true,

      statusCode:
        response.status
    };
  } finally {
    clearTimeout(
      timeout
    );
  }
}

/*
 * KYC documents are larger than a resume and there are three
 * of them, so this flow gets its own timeout. Five seconds is
 * enough for a contact form but not for a 13MB body on a slow
 * connection.
 */
const SUBSCRIPTION_WEBHOOK_TIMEOUT_MS =
  20_000;


/**
 * Send one subscription application to the Microsoft 365
 * Power Automate workflow.
 *
 * PostgreSQL and private KYC storage remain the application's
 * source of truth. The webhook exists so operations staff can
 * work the application inside SharePoint or Teams.
 *
 * BVN and NIN are deliberately excluded from this payload.
 * They are regulated identifiers, and forwarding them would
 * copy them into a third system where this application can no
 * longer control retention or access. Staff read them in the
 * authenticated admin view instead, where each disclosure is
 * written to the audit log.
 */
async function sendSubscriptionToPowerAutomate({
  subscriptionId,
  reference,
  product,
  fullName,
  email,
  phone,
  principalAmount,
  fixedDepositTenor,
  riskAcceptance,
  maturityMandate,
  bankName,
  accountName,
  accountNumber,
  submittedAt,
  documents
}) {
  if (
    !env.powerAutomateSubscriptionsUrl
  ) {
    return {
      sent: false,
      skipped: true,
      statusCode: null
    };
  }


  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },

      SUBSCRIPTION_WEBHOOK_TIMEOUT_MS
    );


  try {
    const response =
      await fetch(
        env.powerAutomateSubscriptionsUrl,

        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify({
              schemaVersion:
                1,

              subscriptionId,

              reference,

              product,

              fullName,

              email,

              /*
               * The Power Automate schema expects strings.
               * Prisma permits some of these to be null.
               */
              phone:
                phone || '',

              principalAmount:
                principalAmount || '',

              fixedDepositTenor:
                fixedDepositTenor || '',

              riskAcceptance,

              maturityMandate:
                maturityMandate || '',

              bankName:
                bankName || '',

              accountName:
                accountName || '',

              accountNumber:
                accountNumber || '',

              submittedAt:
                submittedAt instanceof Date
                  ? submittedAt.toISOString()
                  : String(
                      submittedAt
                    ),

              /*
               * Each document is inlined so the Flow can write
               * it straight into SharePoint without calling
               * back into this application.
               */
              documents:
                (documents || []).map(
                  (document) => ({
                    kind:
                      document.kind,

                    originalName:
                      document.originalName,

                    mimeType:
                      document.mimeType,

                    fileSize:
                      document.fileSize,

                    contentBase64:
                      document.contentBase64
                  })
                )
            }),

          signal:
            controller.signal
        }
      );


    if (!response.ok) {
      const error =
        new Error(
          `Power Automate webhook returned HTTP ${response.status}.`
        );

      error.statusCode =
        response.status;

      throw error;
    }


    return {
      sent: true,
      skipped: false,
      statusCode:
        response.status
    };
  } finally {
    clearTimeout(
      timeout
    );
  }
}
module.exports = {
  sendContactToPowerAutomate,
  sendCareerApplicationToPowerAutomate,
  sendNewsletterToPowerAutomate,
  sendNewsletterUnsubscribeToPowerAutomate,
  sendSubscriptionToPowerAutomate
};