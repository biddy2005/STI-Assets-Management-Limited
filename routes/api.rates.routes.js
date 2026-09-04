const express = require('express');

const router = express.Router();

const prisma = require('../config/db');

const {
  asyncHandler
} = require(
  '../utils/asyncHandler'
);


/*
 * Public rate feed for the products page calculator.
 *
 * Read-only and unauthenticated: these are the same
 * indicative rates already published in the weekly rate guide
 * image, so there is nothing here a visitor cannot already
 * see. No client data is accepted or returned.
 */


/**
 * Serialise a rate row for the browser.
 *
 * Prisma returns Decimal objects, which do not survive
 * JSON.stringify in a usable form, so each is converted
 * explicitly.
 */
function serialiseRate(
  rate
) {
  return {
    product:
      rate.product,

    tenorMinDays:
      rate.tenorMinDays,

    tenorMaxDays:
      rate.tenorMaxDays,

    minAmount:
      Number(rate.minAmount),

    maxAmount:
      rate.maxAmount === null
        ? null
        : Number(rate.maxAmount),

    ratePercent:
      Number(rate.ratePercent),

    note:
      rate.note
  };
}


router.get(
  '/rates',

  asyncHandler(async (
    req,
    res
  ) => {
    const rates =
      await prisma.productRate.findMany({
        where: {
          isActive: true
        },

        orderBy: [
          { product: 'asc' },
          { tenorMinDays: 'asc' },

          /*
           * Highest amount tier first, so the matching logic
           * on the client can take the first row that fits
           * and get the best applicable tier.
           */
          { minAmount: 'desc' }
        ]
      });


    /*
     * Rates change weekly at most. A short cache keeps the
     * products page responsive without serving a stale rate
     * for long.
     */
    res.setHeader(
      'Cache-Control',
      'public, max-age=300'
    );


    const mostRecent =
      rates.reduce(
        (latest, rate) => (
          !latest || rate.effectiveFrom > latest
            ? rate.effectiveFrom
            : latest
        ),

        null
      );


    return res.json({
      ok: true,

      effectiveFrom:
        mostRecent
          ? mostRecent.toISOString()
          : null,

      rates:
        rates.map(serialiseRate)
    });
  })
);


module.exports = router;
