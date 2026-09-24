const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const router = express.Router();

const {
  csrfSynchronisedProtection
} = require(
  '../middleware/csrf.middleware'
);

const {
  asyncHandler
} = require(
  '../utils/asyncHandler'
);

const {
  sendSubscriptionToPowerAutomate
} = require(
  '../services/powerAutomate.service'
);

const prisma = require('../config/db');

const {
  savePrivateFile,
  deletePrivateFile
} = require(
  '../services/storage.service'
);

const {
  isHoneypotTriggered,
  validateSchema
} = require(
  '../middleware/validation.middleware'
);

const {
  subscriptionSchema
} = require(
  '../schemas/subscription.schema'
);

const {
  encryptField
} = require(
  '../services/fieldCrypto.service'
);

const logger =
  require('../config/logger');


/*
 * Bump this whenever the subscription privacy notice changes
 * so each stored record names the version the client agreed to.
 */
const PRIVACY_NOTICE_VERSION =
  'subscription-2026-09';


/*
 * The three KYC documents from the paper form.
 *
 * Passport photographs are almost always camera images, so
 * this flow accepts JPEG and PNG alongside PDF. Each field
 * carries its own size ceiling: a passport photograph has no
 * business being four megabytes.
 */
const DOCUMENT_FIELDS = [
  {
    field: 'passportPhoto',
    label: 'passport photograph',
    maxBytes: 2 * 1024 * 1024
  },
  {
    field: 'idDocument',
    label: 'means of identification',
    maxBytes: 4 * 1024 * 1024
  },
  {
    field: 'utilityBill',
    label: 'utility bill',
    maxBytes: 4 * 1024 * 1024
  }
];


const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png'
]);


const EXTENSION_BY_MIME = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png'
};


/*
 * Magic bytes for each accepted type.
 *
 * A browser-reported MIME type is trivially forged, so the
 * declared type is only a first filter. These signatures are
 * checked against the buffer that multer actually received.
 */
const SIGNATURES = {
  'application/pdf': (buffer) => (
    buffer.length > 4 &&
    buffer.subarray(0, 5).toString('latin1') === '%PDF-'
  ),

  'image/jpeg': (buffer) => (
    buffer.length > 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ),

  'image/png': (buffer) => (
    buffer.length > 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  )
};


/*
 * Files are held in memory so nothing untrusted is written to
 * disk before it has been validated. The global ceiling is the
 * largest single permitted file; per-field limits are enforced
 * after multer has parsed the request.
 */
const upload =
  multer({
    storage:
      multer.memoryStorage(),

    limits: {
      fileSize:
        4 * 1024 * 1024,

      files: 3,

      fields: 60,

      fieldArrayIndexLimit: 20
    },

    fileFilter: (
      req,
      file,
      callback
    ) => {
      if (
        !ALLOWED_MIME_TYPES.has(
          file.mimetype
        )
      ) {
        const error =
          new Error(
            'Documents must be PDF, JPG or PNG files.'
          );

        error.statusCode = 400;

        return callback(error);
      }


      return callback(null, true);
    }
  });


/**
 * Build a short client-facing reference.
 *
 * Example: STI-2026-4F9K2A
 *
 * Ambiguous characters are excluded so the code survives being
 * read aloud over the phone.
 */
function buildReference() {
  const alphabet =
    '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';


  const bytes =
    crypto.randomBytes(6);


  let suffix = '';

  for (const byte of bytes) {
    suffix +=
      alphabet[byte % alphabet.length];
  }


  return `STI-${new Date().getFullYear()}-${suffix}`;
}


/**
 * Hash the submitting IP rather than storing it.
 *
 * This still supports abuse investigation while keeping the
 * stored value non-identifying on its own.
 */
function hashIp(
  ip
) {
  if (!ip) {
    return null;
  }


  return crypto
    .createHash('sha256')
    .update(
      String(ip)
    )
    .digest('hex');
}


/**
 * Validate one uploaded document and return its metadata.
 */
function inspectDocument({
  file,
  label,
  maxBytes
}) {
  if (!file) {
    const error =
      new Error(
        `Please upload your ${label}.`
      );

    error.statusCode = 400;

    throw error;
  }


  if (
    file.size > maxBytes
  ) {
    const error =
      new Error(
        `Your ${label} must be smaller than ` +
        `${Math.round(maxBytes / (1024 * 1024))}MB.`
      );

    error.statusCode = 400;

    throw error;
  }


  const verify =
    SIGNATURES[file.mimetype];


  if (
    !verify ||
    !verify(file.buffer)
  ) {
    const error =
      new Error(
        `Your ${label} does not appear to be a valid ` +
        'PDF, JPG or PNG file.'
      );

    error.statusCode = 400;

    throw error;
  }


  return {
    buffer:
      file.buffer,

    mimeType:
      file.mimetype,

    size:
      file.size,

    /*
     * Keep the client's filename for display only, stripped of
     * any path component so it can never influence a write.
     */
    originalName:
      path.basename(
        file.originalname || 'document'
      ).slice(0, 180),

    storageKey:
      `${Date.now()}-${crypto.randomUUID()}` +
      `${EXTENSION_BY_MIME[file.mimetype]}`
  };
}


router.post(
  '/subscriptions',

  upload.fields(
    DOCUMENT_FIELDS.map(
      (entry) => ({
        name: entry.field,
        maxCount: 1
      })
    )
  ),

  /*
   * Multer has now populated req.body, including _csrf, so the
   * token can be verified before any further work happens.
   */
  csrfSynchronisedProtection,

  asyncHandler(
    async (req, res) => {
      if (
        isHoneypotTriggered(req)
      ) {
        /*
         * Answer as though the submission succeeded so a bot
         * gains no signal from the response.
         */
        return res.status(202).json({
          ok: true,
          reference: buildReference()
        });
      }


      const parsed =
        validateSchema(
          subscriptionSchema,
          req.body
        );


      if (!parsed.success) {
        /*
         * validateSchema returns an array of { field, message }.
         * The client renders errors keyed by field name, and the
         * Multer handler below already uses that shape, so
         * reshape here rather than in the browser.
         */
        const errors = {};

        parsed.errors.forEach((issue) => {
          if (!errors[issue.field]) {
            errors[issue.field] = issue.message;
          }
        });

        return res.status(400).json({
          ok: false,
          errors
        });
      }


      const data =
        parsed.data;


      /*
       * Validate every document before writing any of them, so a
       * bad third file does not leave two orphans in storage.
       */
      const documents =
        DOCUMENT_FIELDS.map(
          (entry) => inspectDocument({
            file:
              req.files?.[entry.field]?.[0],

            label:
              entry.label,

            maxBytes:
              entry.maxBytes
          })
        );


      const written = [];


      try {
        for (const document of documents) {
          await savePrivateFile({
            storageKey:
              document.storageKey,

            body:
              document.buffer,

            contentType:
              document.mimeType,

            category: 'kyc'
          });


          written.push(
            document.storageKey
          );
        }


        const submittedAt =
          new Date();


        const [
          passport,
          idDocument,
          utilityBill
        ] = documents;


        /*
         * Only create the database record once every object is
         * safely in storage.
         */
        const subscription =
          await prisma.subscription.create({
            data: {
              reference:
                buildReference(),

              product:
                data.product,

              firstName:
                data.firstName,

              middleName:
                data.middleName || null,

              surname:
                data.surname,

              maidenName:
                data.maidenName || null,

              gender:
                data.gender,

              dateOfBirth:
                new Date(
                  data.dateOfBirth
                ),

              maritalStatus:
                data.maritalStatus,

              stateOfOrigin:
                data.stateOfOrigin,

              lga:
                data.lga,

              residentialAddress:
                data.residentialAddress,

              phone:
                data.phone,

              email:
                data.email,

              occupation:
                data.occupation,

              employmentStatus:
                data.employmentStatus,

              meansOfIdentification:
                data.meansOfIdentification,

              idNumber:
                data.idNumber,

              nationality:
                data.nationality,

              nextOfKinName:
                data.nextOfKinName,

              nextOfKinRelationship:
                data.nextOfKinRelationship,

              nextOfKinPhone:
                data.nextOfKinPhone,

              nextOfKinAddress:
                data.nextOfKinAddress,

              natureOfBusiness:
                data.natureOfBusiness || null,

              estimatedAnnualIncome:
                data.estimatedAnnualIncome ?? null,

              principalAmount:
                data.principalAmount,

              fixedDepositTenor:
                data.fixedDepositTenor,

              riskAcceptance:
                data.riskAcceptance,

              maturityMandate:
                data.maturityMandate,

              bankName:
                data.bankName,

              accountName:
                data.accountName,

              accountNumber:
                data.accountNumber,

              /*
               * Encrypted before it touches the database. The
               * plaintext exists only inside this request.
               */
              bvnEncrypted:
                encryptField(
                  data.bvn
                ),

              bvnLast4:
                data.bvn.slice(-4),

              ninEncrypted:
                data.nin
                  ? encryptField(data.nin)
                  : null,

              ninLast4:
                data.nin
                  ? data.nin.slice(-4)
                  : null,

              passportStorageKey:
                passport.storageKey,

              passportOriginalName:
                passport.originalName,

              passportMimeType:
                passport.mimeType,

              passportFileSize:
                passport.size,

              idDocStorageKey:
                idDocument.storageKey,

              idDocOriginalName:
                idDocument.originalName,

              idDocMimeType:
                idDocument.mimeType,

              idDocFileSize:
                idDocument.size,

              utilityBillStorageKey:
                utilityBill.storageKey,

              utilityBillOriginalName:
                utilityBill.originalName,

              utilityBillMimeType:
                utilityBill.mimeType,

              utilityBillFileSize:
                utilityBill.size,

              attestationAccepted:
                true,

              attestationAcceptedAt:
                submittedAt,

              privacyAcknowledged:
                true,

              privacyAcknowledgedAt:
                submittedAt,

              privacyNoticeVersion:
                PRIVACY_NOTICE_VERSION,

              submittedIpHash:
                hashIp(req.ip)
            }
          });


        /*
         * Respond before the webhook so a slow Microsoft 365
         * tenant never holds up the client's browser.
         */
        res.status(201).json({
          ok: true,
          reference:
            subscription.reference
        });


        /*
         * Forward to Power Automate without awaiting. Failures
         * are recorded on the row so they can be retried from
         * the admin area rather than silently lost.
         *
         * Note what is deliberately absent from the payload:
         * BVN and NIN are never forwarded. Staff read those in
         * the authenticated admin view, where access is audited.
         */
        sendSubscriptionToPowerAutomate({
          subscriptionId:
            subscription.id,

          reference:
            subscription.reference,

          product:
            subscription.product,

          fullName:
            [
              subscription.firstName,
              subscription.middleName,
              subscription.surname
            ]
              .filter(Boolean)
              .join(' '),

          email:
            subscription.email,

          phone:
            subscription.phone,

          principalAmount:
            String(
              subscription.principalAmount
            ),

          fixedDepositTenor:
            subscription.fixedDepositTenor,

          riskAcceptance:
            subscription.riskAcceptance,

          maturityMandate:
            subscription.maturityMandate,

          bankName:
            subscription.bankName,

          accountName:
            subscription.accountName,

          accountNumber:
            subscription.accountNumber,

          submittedAt,

          documents:
            documents.map(
              (document, index) => ({
                kind:
                  DOCUMENT_FIELDS[index].field,

                originalName:
                  document.originalName,

                mimeType:
                  document.mimeType,

                fileSize:
                  document.size,

                contentBase64:
                  document.buffer.toString(
                    'base64'
                  )
              })
            )
        })
          .then(
            async (result) => {
              if (result.skipped) {
                return;
              }


              await prisma.subscription.update({
                where: {
                  id: subscription.id
                },

                data: {
                  forwardedToPowerAutomate:
                    true,

                  forwardedAt:
                    new Date(),

                  forwardingError:
                    null
                }
              });
            }
          )
          .catch(
            async (error) => {
              logger.error(
                {
                  err: error,
                  subscriptionId:
                    subscription.id
                },

                'Power Automate subscription forwarding failed.'
              );


              await prisma.subscription
                .update({
                  where: {
                    id: subscription.id
                  },

                  data: {
                    forwardingError:
                      String(
                        error.message
                      ).slice(0, 500)
                  }
                })
                .catch(() => {
                  /* Nothing further can be done here. */
                });
            }
          );


        return undefined;
      } catch (error) {
        /*
         * Roll back any objects already written so a failed
         * submission does not leave KYC documents stranded in
         * storage with no database row pointing at them.
         */
        await Promise.all(
          written.map(
            (storageKey) => deletePrivateFile({
              storageKey,
              category: 'kyc'
            }).catch(() => {
              /* Best effort. */
            })
          )
        );


        throw error;
      }
    }
  )
);


/*
 * Translate multer's own errors into the same response shape
 * the rest of the form uses.
 */
router.use(
  (
    error,
    req,
    res,
    next
  ) => {
    if (
      error instanceof multer.MulterError
    ) {
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? 'One of your documents is too large.'
          : error.code === 'LIMIT_FILE_COUNT'
            ? 'Please upload only one file per document.'
            : error.code === 'LIMIT_UNEXPECTED_FILE'
              ? 'An unrecognised upload field was received.'
              : 'Your documents could not be processed.';


      return res.status(400).json({
        ok: false,
        errors: {
          _form: message
        }
      });
    }


    return next(error);
  }
);


module.exports = router;