const express = require('express');
const router = express.Router();

const prisma = require('../config/db');

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
  writeAuditLog
} = require(
  '../services/audit.service'
);


const superAdminOnly =
  requireRole('SUPERADMIN');


/*
 * ============================================================
 * GRID SHAPE
 * ============================================================
 *
 * The published rate guide is a fixed grid of amount tiers
 * against tenors. Defining that shape here rather than making
 * it user-editable means the admin screen can be a simple
 * spreadsheet: staff type rates into cells and save, instead
 * of describing a tier from scratch every time.
 *
 * Changing the published grid means editing these two arrays
 * and running one migration-free deploy. That is rare enough
 * to be worth the simplicity everywhere else.
 */

const TENOR_COLUMNS = [
  { days: 30, label: '30D' },
  { days: 60, label: '60D' },
  { days: 90, label: '90D' },
  { days: 180, label: '180D' },
  { days: 365, label: '365D' }
];


const NAIRA_TIERS = [
  { min: 250000, max: 999999, label: '250k – 999k' },
  { min: 1000000, max: 4999999, label: '1m – 4.99m' },
  { min: 5000000, max: 9999999, label: '5m – 9.99m' },
  { min: 10000000, max: 19999999, label: '10m – 19.99m' },
  { min: 20000000, max: 49999999, label: '20m – 49.99m' },
  { min: 50000000, max: 99999999, label: '50m – 99.99m' },
  { min: 100000000, max: null, label: '100m & above' }
];


/*
 * The dollar note has its own entry points, so it cannot share
 * the naira tiers.
 */
const DOLLAR_TIERS = [
  { min: 10000, max: 49999, label: '$10k – $49.9k' },
  { min: 50000, max: 99999, label: '$50k – $99.9k' },
  { min: 100000, max: 249999, label: '$100k – $249.9k' },
  { min: 250000, max: null, label: '$250k & above' }
];


const PRODUCTS = [
  {
    key: 'MONEY_MARKET_NOTE',
    label: 'STIAM Money Market Note',
    currency: 'NGN',
    tiers: NAIRA_TIERS
  },
  {
    key: 'FIXED_INCOME_NOTE',
    label: 'STIAM Fixed Income Note',
    currency: 'NGN',
    tiers: NAIRA_TIERS
  },
  {
    key: 'FIXED_INCOME_DOLLAR_NOTE',
    label: 'STIAM Fixed Income Dollar Note',
    currency: 'USD',
    tiers: DOLLAR_TIERS
  }
];


function resolveProduct(
  key
) {
  return PRODUCTS.find(
    (product) => product.key === key
  ) || PRODUCTS[0];
}


/**
 * Build the cell name used in the form.
 *
 * Encoding the tier index and tenor days into the field name
 * means the POST handler can rebuild the grid without needing
 * hidden rows or a client-side payload.
 */
function cellName(
  tierIndex,
  tenorDays
) {
  return `rate_${tierIndex}_${tenorDays}`;
}


/**
 * Show the grid for one product.
 */
router.get(
  '/',
  superAdminOnly,

  asyncHandler(async (req, res) => {
    const product =
      resolveProduct(
        typeof req.query.product === 'string'
          ? req.query.product
          : ''
      );


    const existing =
      await prisma.productRate.findMany({
        where: {
          product: product.key,
          isActive: true
        }
      });


    /*
     * Index the stored rows so the template can look up each
     * cell in constant time rather than scanning the array
     * once per cell.
     */
    const lookup = {};

    existing.forEach((row) => {
      const key =
        `${Number(row.minAmount)}_${row.tenorMaxDays}`;

      lookup[key] = Number(row.ratePercent);
    });


    const grid =
      product.tiers.map((tier, tierIndex) => ({
        ...tier,

        tierIndex,

        cells: TENOR_COLUMNS.map((tenor) => ({
          days: tenor.days,
          label: tenor.label,
          name: cellName(tierIndex, tenor.days),
          value:
            lookup[`${tier.min}_${tenor.days}`] ?? ''
        }))
      }));


    const lastUpdated =
      existing.length
        ? existing.reduce(
            (latest, row) =>
              row.updatedAt > latest
                ? row.updatedAt
                : latest,
            existing[0].updatedAt
          )
        : null;


    return res.render(
      'admin/rates-manager',

      {
        products: PRODUCTS,
        product,
        tenors: TENOR_COLUMNS,
        grid,
        lastUpdated,
        saved: req.query.saved === '1'
      }
    );
  })
);


/**
 * Save the whole grid for one product.
 *
 * Every cell is rewritten in a single transaction. A partial
 * save would leave the published table inconsistent with
 * itself, which matters more here than saving a few writes.
 */
router.post(
  '/',
  superAdminOnly,
  csrfSynchronisedProtection,

  asyncHandler(async (req, res) => {
    const product =
      resolveProduct(req.body.product);


    const rows = [];

    const errors = [];


    product.tiers.forEach((tier, tierIndex) => {
      TENOR_COLUMNS.forEach((tenor) => {
        const raw =
          req.body[
            cellName(tierIndex, tenor.days)
          ];


        const value =
          typeof raw === 'string'
            ? raw.trim()
            : '';


        /*
         * An empty cell means "no published rate for this
         * combination", which is a legitimate state. It is
         * skipped rather than stored as zero.
         */
        if (value === '') {
          return;
        }


        const rate = Number(value);


        if (
          !Number.isFinite(rate) ||
          rate < 0 ||
          rate > 100
        ) {
          errors.push(
            `${tier.label} at ${tenor.label} must be a ` +
            'percentage between 0 and 100.'
          );

          return;
        }


        rows.push({
          product: product.key,
          tenorMinDays:
            tenor.days === 30
              ? 1
              : previousTenor(tenor.days) + 1,
          tenorMaxDays: tenor.days,
          minAmount: tier.min,
          maxAmount: tier.max,
          ratePercent: rate,
          isActive: true
        });
      });
    });


    if (errors.length) {
      return res.status(400).send(
        errors.join(' ')
      );
    }


    await prisma.$transaction(
      async (tx) => {
        /*
         * Replace rather than merge. The grid the admin sees
         * is the complete published set for this product, so
         * a cell cleared on screen must disappear from the
         * database too.
         */
        await tx.productRate.deleteMany({
          where: {
            product: product.key
          }
        });


        if (rows.length) {
          await tx.productRate.createMany({
            data: rows
          });
        }


        await writeAuditLog({
          client: tx,

          req,

          action:
            'PRODUCT_RATES_UPDATED',

          entityType:
            'ProductRate',

          entityId:
            null,

          metadata: {
            product: product.key,
            cellsSaved: rows.length
          }
        });
      }
    );


    return res.redirect(
      `/admin/rates?product=${product.key}&saved=1`
    );
  })
);


/**
 * The lower bound of a tenor band.
 *
 * Bands are contiguous, so each one starts the day after the
 * previous one ends.
 */
function previousTenor(
  days
) {
  const index =
    TENOR_COLUMNS.findIndex(
      (tenor) => tenor.days === days
    );

  return index <= 0
    ? 0
    : TENOR_COLUMNS[index - 1].days;
}


module.exports = router;