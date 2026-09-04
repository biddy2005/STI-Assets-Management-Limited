const express =
  require('express');

const router =
  express.Router();

const path =
  require('path');

const prisma =
  require('../config/db');

const {
  requireRole
} = require(
  '../middleware/auth.middleware'
);

const {
  asyncHandler
} = require(
  '../utils/asyncHandler'
);

const {
  csrfSynchronisedProtection
} = require(
  '../middleware/csrf.middleware'
);

const {
  getPrivateFile,
  deletePrivateFile
} = require(
  '../services/storage.service'
);

const {
  writeAuditLog
} = require(
  '../services/audit.service'
);

const {
  decryptField
} = require(
  '../services/fieldCrypto.service'
);


const superAdminOnly =
  requireRole(
    'SUPERADMIN'
  );


const allowedSubscriptionStatuses =
  new Set([
    'NEW',
    'UNDER_REVIEW',
    'KYC_INCOMPLETE',
    'APPROVED',
    'REJECTED'
  ]);


/*
 * The three KYC documents, mapped to their column names.
 *
 * Keeping this in one place means the download route cannot
 * be tricked into reading an arbitrary column by manipulating
 * the :kind parameter.
 */
const DOCUMENT_KINDS = {
  passport: {
    label: 'passport photograph',
    storageKeyField: 'passportStorageKey',
    originalNameField: 'passportOriginalName',
    mimeTypeField: 'passportMimeType'
  },

  identification: {
    label: 'means of identification',
    storageKeyField: 'idDocStorageKey',
    originalNameField: 'idDocOriginalName',
    mimeTypeField: 'idDocMimeType'
  },

  'utility-bill': {
    label: 'utility bill',
    storageKeyField: 'utilityBillStorageKey',
    originalNameField: 'utilityBillOriginalName',
    mimeTypeField: 'utilityBillMimeType'
  }
};


/*
 * Columns safe to load for the list view.
 *
 * bvnEncrypted and ninEncrypted are deliberately absent. A
 * list view has no reason to hold ciphertext for every client
 * in memory, and omitting them makes accidental exposure in a
 * template impossible rather than merely unlikely.
 */
const LIST_SELECT = {
  id: true,
  reference: true,
  product: true,
  firstName: true,
  middleName: true,
  surname: true,
  email: true,
  phone: true,
  principalAmount: true,
  fixedDepositTenor: true,
  status: true,
  bvnLast4: true,
  ninLast4: true,
  forwardedToPowerAutomate: true,
  forwardingError: true,
  createdAt: true
};


function parseId(
  value
) {
  const id =
    Number(value);


  if (
    !Number.isSafeInteger(id) ||
    id < 1
  ) {
    return null;
  }


  return id;
}


/**
 * List every subscription application.
 */
router.get(
  '/',
  superAdminOnly,

  asyncHandler(async (
    req,
    res
  ) => {
    const rawStatus =
      typeof req.query.status === 'string'
        ? req.query.status
        : '';


    const statusFilter =
      allowedSubscriptionStatuses.has(
        rawStatus
      )
        ? rawStatus
        : null;


    const subscriptions =
      await prisma.subscription.findMany({
        where:
          statusFilter
            ? {
                status:
                  statusFilter
              }
            : {},

        select:
          LIST_SELECT,

        orderBy: {
          createdAt:
            'desc'
        }
      });


    return res.render(
      'admin/subscriptions-manager',

      {
        subscriptions,
        statusFilter,
        statuses:
          Array.from(
            allowedSubscriptionStatuses
          )
      }
    );
  })
);


/**
 * View one subscription in full.
 *
 * BVN and NIN are NOT decrypted here. The page renders the
 * masked last four digits and offers a separate reveal action
 * so that merely opening a record does not disclose them.
 */
router.get(
  '/:id',
  superAdminOnly,

  asyncHandler(async (
    req,
    res
  ) => {
    const subscriptionId =
      parseId(
        req.params.id
      );


    if (!subscriptionId) {
      return res.status(400).send(
        'Invalid subscription ID.'
      );
    }


    const subscription =
      await prisma.subscription.findUnique({
        where: {
          id:
            subscriptionId
        }
      });


    if (!subscription) {
      return res.status(404).render(
        '404',
        {
          title:
            'Subscription Not Found'
        }
      );
    }


    /*
     * Strip the ciphertext before the record reaches the
     * template. The view never receives material it could
     * accidentally print.
     */
    const {
      bvnEncrypted,
      ninEncrypted,
      ...safeSubscription
    } = subscription;


    return res.render(
      'admin/subscription-detail',

      {
        subscription:
          safeSubscription,

        revealed:
          null,

        statuses:
          Array.from(
            allowedSubscriptionStatuses
          )
      }
    );
  })
);


/**
 * Reveal the BVN and NIN for one subscription.
 *
 * This is a POST rather than a GET on purpose: revealing
 * regulated identifiers is an action with a consequence, and
 * it must not be triggerable by a link, a prefetch or a
 * browser history entry.
 *
 * Every reveal is written to the audit log before the values
 * are returned.
 */
router.post(
  '/:id/reveal',
  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (
    req,
    res
  ) => {
    const subscriptionId =
      parseId(
        req.params.id
      );


    if (!subscriptionId) {
      return res.status(400).send(
        'Invalid subscription ID.'
      );
    }


    const subscription =
      await prisma.subscription.findUnique({
        where: {
          id:
            subscriptionId
        }
      });


    if (!subscription) {
      return res.status(404).render(
        '404',
        {
          title:
            'Subscription Not Found'
        }
      );
    }


    /*
     * Record the disclosure first. If the audit write fails,
     * nothing is revealed.
     */
    await writeAuditLog({
      req,

      action:
        'SUBSCRIPTION_IDENTIFIERS_REVEALED',

      entityType:
        'Subscription',

      entityId:
        subscription.id,

      metadata: {
        reference:
          subscription.reference
      }
    });


    let revealed;


    try {
      revealed = {
        bvn:
          decryptField(
            subscription.bvnEncrypted
          ),

        nin:
          subscription.ninEncrypted
            ? decryptField(
                subscription.ninEncrypted
              )
            : null
      };
    } catch (error) {
      /*
       * A decryption failure almost always means the
       * encryption key has changed. Say so plainly rather
       * than rendering an empty field that looks like
       * missing data.
       */
      revealed = {
        error:
          'These values could not be decrypted. ' +
          'The field encryption key may have changed.'
      };
    }


    const {
      bvnEncrypted,
      ninEncrypted,
      ...safeSubscription
    } = subscription;


    return res.render(
      'admin/subscription-detail',

      {
        subscription:
          safeSubscription,

        revealed,

        statuses:
          Array.from(
            allowedSubscriptionStatuses
          )
      }
    );
  })
);


/**
 * Download one KYC document.
 *
 * Files are streamed through this authenticated route. They
 * are never exposed at a public URL.
 */
router.get(
  '/:id/document/:kind',
  superAdminOnly,

  asyncHandler(async (
    req,
    res
  ) => {
    const subscriptionId =
      parseId(
        req.params.id
      );


    if (!subscriptionId) {
      return res.status(400).send(
        'Invalid subscription ID.'
      );
    }


    const documentKind =
      DOCUMENT_KINDS[
        req.params.kind
      ];


    if (!documentKind) {
      return res.status(400).send(
        'Unknown document type.'
      );
    }


    const subscription =
      await prisma.subscription.findUnique({
        where: {
          id:
            subscriptionId
        }
      });


    if (!subscription) {
      return res.status(404).render(
        '404',
        {
          title:
            'Subscription Not Found'
        }
      );
    }


    let storedDocument;


    try {
      storedDocument =
        await getPrivateFile({
          storageKey:
            subscription[
              documentKind
                .storageKeyField
            ],

          category:
            'kyc'
        });
    } catch (error) {
      if (
        error.code ===
          'STORAGE_FILE_NOT_FOUND'
      ) {
        return res.status(404).send(
          `The ${documentKind.label} could not be found.`
        );
      }


      throw error;
    }


    await writeAuditLog({
      req,

      action:
        'SUBSCRIPTION_DOCUMENT_DOWNLOADED',

      entityType:
        'Subscription',

      entityId:
        subscription.id,

      metadata: {
        reference:
          subscription.reference,

        document:
          req.params.kind
      }
    });


    /*
     * KYC documents contain photo identification and a home
     * address. They must not be cached anywhere.
     */
    res.setHeader(
      'Cache-Control',
      'private, no-store, max-age=0'
    );

    res.setHeader(
      'Pragma',
      'no-cache'
    );

    res.setHeader(
      'X-Content-Type-Options',
      'nosniff'
    );


    const downloadName =
      path.basename(
        subscription[
          documentKind
            .originalNameField
        ] || 'document'
      );


    res.attachment(
      downloadName
    );


    res.setHeader(
      'Content-Type',

      subscription[
        documentKind
          .mimeTypeField
      ] ||
      'application/octet-stream'
    );


    return res.send(
      storedDocument.body
    );
  })
);


/**
 * Update the workflow status of one subscription.
 */
router.post(
  '/:id/status',
  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (
    req,
    res
  ) => {
    const subscriptionId =
      parseId(
        req.params.id
      );


    if (!subscriptionId) {
      return res.status(400).send(
        'Invalid subscription ID.'
      );
    }


    const nextStatus =
      typeof req.body.status === 'string'
        ? req.body.status
        : '';


    if (
      !allowedSubscriptionStatuses.has(
        nextStatus
      )
    ) {
      return res.status(400).send(
        'Unsupported subscription status.'
      );
    }


    const reviewNote =
      typeof req.body.reviewNote === 'string'
        ? req.body.reviewNote.trim().slice(0, 2000)
        : null;


    const existing =
      await prisma.subscription.findUnique({
        where: {
          id:
            subscriptionId
        },

        select: {
          id: true,
          reference: true,
          status: true
        }
      });


    if (!existing) {
      return res.status(404).render(
        '404',
        {
          title:
            'Subscription Not Found'
        }
      );
    }


    /*
     * The update and its audit entry succeed or fail together.
     */
    await prisma.$transaction(
      async (tx) => {
        await tx.subscription.update({
          where: {
            id:
              subscriptionId
          },

          data: {
            status:
              nextStatus,

            reviewNote,

            reviewedById:
              req.session?.adminId ||
              null,

            reviewedAt:
              new Date()
          }
        });


        await writeAuditLog({
          client: tx,

          req,

          action:
            'SUBSCRIPTION_STATUS_UPDATED',

          entityType:
            'Subscription',

          entityId:
            subscriptionId,

          metadata: {
            reference:
              existing.reference,

            from:
              existing.status,

            to:
              nextStatus
          }
        });
      }
    );


    return res.redirect(
      `/admin/subscriptions/${subscriptionId}`
    );
  })
);


/**
 * Delete one subscription and its stored documents.
 */
router.post(
  '/:id/delete',
  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (
    req,
    res
  ) => {
    const subscriptionId =
      parseId(
        req.params.id
      );


    if (!subscriptionId) {
      return res.status(400).send(
        'Invalid subscription ID.'
      );
    }


    const subscription =
      await prisma.subscription.findUnique({
        where: {
          id:
            subscriptionId
        },

        select: {
          id: true,
          reference: true,
          passportStorageKey: true,
          idDocStorageKey: true,
          utilityBillStorageKey: true
        }
      });


    if (!subscription) {
      return res.status(404).render(
        '404',
        {
          title:
            'Subscription Not Found'
        }
      );
    }


    await prisma.$transaction(
      async (tx) => {
        await tx.subscription.delete({
          where: {
            id:
              subscriptionId
          }
        });


        await writeAuditLog({
          client: tx,

          req,

          action:
            'SUBSCRIPTION_DELETED',

          entityType:
            'Subscription',

          entityId:
            subscriptionId,

          metadata: {
            reference:
              subscription.reference
          }
        });
      }
    );


    /*
     * Remove the stored documents after the row is gone. A
     * storage failure here leaves an orphaned object, which is
     * recoverable; deleting files first and then failing the
     * transaction would leave a record pointing at nothing.
     */
    await Promise.all(
      [
        subscription.passportStorageKey,
        subscription.idDocStorageKey,
        subscription.utilityBillStorageKey
      ].map(
        (storageKey) => deletePrivateFile({
          storageKey,
          category: 'kyc'
        }).catch(() => {
          /* Best effort. */
        })
      )
    );


    return res.redirect(
      '/admin/subscriptions'
    );
  })
);


module.exports = router;