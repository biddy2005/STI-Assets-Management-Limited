const express =
  require('express');

const crypto =
  require('crypto');

const router =
  express.Router();

const prisma =
  require('../config/db');

const env =
  require('../config/env');

const {
  asyncHandler
} = require(
  '../utils/asyncHandler'
);

const {
  writeAuditLog
} = require(
  '../services/audit.service'
);

const logger =
  require('../config/logger');


/*
 * Callback endpoint for the Microsoft 365 approval workflow.
 *
 * Power Automate POSTs here when an approver accepts or
 * rejects a subscription, so PostgreSQL stays the source of
 * truth rather than drifting out of step with SharePoint.
 *
 * This route deliberately does NOT use CSRF protection. CSRF
 * defends browser sessions against cross-site form posts;
 * this is a server-to-server call with no session and no
 * cookie, so a shared secret is the appropriate control.
 */


/*
 * Outcomes the Flow is permitted to report, mapped to the
 * SubscriptionStatus values in the Prisma schema.
 *
 * A whitelist rather than a passthrough: the Flow must never
 * be able to write an arbitrary status into the database.
 */
const OUTCOME_TO_STATUS = {
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  KYC_INCOMPLETE: 'KYC_INCOMPLETE',
  UNDER_REVIEW: 'UNDER_REVIEW'
};


/**
 * Compare two secrets without leaking their contents through
 * response timing.
 *
 * A plain === exits at the first differing character, which
 * over many attempts reveals the secret one character at a
 * time. timingSafeEqual always reads both buffers fully.
 */
function secretMatches(
  provided,
  expected
) {
  if (
    typeof provided !== 'string' ||
    typeof expected !== 'string' ||
    provided.length === 0 ||
    expected.length === 0
  ) {
    return false;
  }


  const providedBuffer =
    Buffer.from(provided);

  const expectedBuffer =
    Buffer.from(expected);


  /*
   * timingSafeEqual throws on length mismatch, which would
   * itself leak the expected length. Hash both sides first so
   * the compared buffers are always 32 bytes.
   */
  const providedHash =
    crypto
      .createHash('sha256')
      .update(providedBuffer)
      .digest();

  const expectedHash =
    crypto
      .createHash('sha256')
      .update(expectedBuffer)
      .digest();


  return crypto.timingSafeEqual(
    providedHash,
    expectedHash
  );
}


/**
 * Authenticate the callback.
 */
function requireCallbackSecret(
  req,
  res,
  next
) {
  const expected =
    env.subscriptionCallbackSecret;


  if (!expected) {
    logger.error(
      'SUBSCRIPTION_CALLBACK_SECRET is not configured. ' +
      'Rejecting callback.'
    );


    return res.status(503).json({
      ok: false,
      message:
        'Callback endpoint is not configured.'
    });
  }


  const provided =
    req.get('x-sti-callback-secret');


  if (
    !secretMatches(
      provided,
      expected
    )
  ) {
    logger.warn(
      {
        ip: req.ip
      },

      'Rejected subscription callback with an invalid secret.'
    );


    /*
     * Deliberately vague. A caller without the secret learns
     * nothing about whether the reference existed.
     */
    return res.status(401).json({
      ok: false,
      message:
        'Unauthorised.'
    });
  }


  return next();
}


router.post(
  '/subscriptions/callback',
  requireCallbackSecret,

  asyncHandler(async (
    req,
    res
  ) => {
    const reference =
      typeof req.body.reference === 'string'
        ? req.body.reference.trim().slice(0, 32)
        : '';


    const rawOutcome =
      typeof req.body.outcome === 'string'
        ? req.body.outcome.trim().toUpperCase()
        : '';


    const nextStatus =
      OUTCOME_TO_STATUS[
        rawOutcome
      ];


    if (!reference) {
      return res.status(400).json({
        ok: false,
        message:
          'A subscription reference is required.'
      });
    }


    if (!nextStatus) {
      return res.status(400).json({
        ok: false,
        message:
          'Unsupported outcome value.'
      });
    }


    const approver =
      typeof req.body.approver === 'string'
        ? req.body.approver.trim().slice(0, 254)
        : null;


    const comments =
      typeof req.body.comments === 'string'
        ? req.body.comments.trim().slice(0, 2000)
        : null;


    const stage =
      typeof req.body.stage === 'string'
        ? req.body.stage.trim().slice(0, 60)
        : null;


    const subscription =
      await prisma.subscription.findUnique({
        where: {
          reference
        },

        select: {
          id: true,
          reference: true,
          status: true
        }
      });


    if (!subscription) {
      return res.status(404).json({
        ok: false,
        message:
          'No subscription matches that reference.'
      });
    }


    /*
     * Power Automate retries failed HTTP actions, so the same
     * outcome may arrive more than once. Treat a repeat as a
     * success without writing a duplicate audit entry.
     */
    if (
      subscription.status === nextStatus
    ) {
      return res.json({
        ok: true,
        reference:
          subscription.reference,
        status:
          subscription.status,
        message:
          'Already recorded.'
      });
    }


    /*
     * Build a readable review note from whatever the approver
     * supplied, so the admin detail page shows who decided
     * and why without needing to open SharePoint.
     */
    const noteParts =
      [];

    if (stage) {
      noteParts.push(
        `Stage: ${stage}.`
      );
    }

    if (approver) {
      noteParts.push(
        `Decided by ${approver}.`
      );
    }

    if (comments) {
      noteParts.push(
        comments
      );
    }


    const reviewNote =
      noteParts.length
        ? noteParts.join(' ')
        : null;


    await prisma.$transaction(
      async (tx) => {
        await tx.subscription.update({
          where: {
            id:
              subscription.id
          },

          data: {
            status:
              nextStatus,

            reviewNote,

            reviewedAt:
              new Date()

            /*
             * reviewedById is left untouched: the decision was
             * made in Microsoft 365, not by a logged-in admin
             * in this application. The approver's identity is
             * captured in reviewNote and the audit metadata.
             */
          }
        });


        await writeAuditLog({
          client: tx,

          req,

          /*
           * No session exists on this request, so the audit
           * entry is attributed to the system rather than to
           * an administrator.
           */
          adminId: null,

          action:
            'SUBSCRIPTION_OUTCOME_RECEIVED',

          entityType:
            'Subscription',

          entityId:
            subscription.id,

          metadata: {
            reference:
              subscription.reference,

            from:
              subscription.status,

            to:
              nextStatus,

            approver,

            stage,

            source:
              'power-automate'
          }
        });
      }
    );


    logger.info(
      {
        reference:
          subscription.reference,

        from:
          subscription.status,

        to:
          nextStatus
      },

      'Subscription outcome recorded from Power Automate.'
    );


    return res.json({
      ok: true,
      reference:
        subscription.reference,
      status:
        nextStatus
    });
  })
);


module.exports = router;