const { z } = require('zod');


/*
 * Mirrors the convention used by schemas/careers.schema.js:
 * every string is trimmed and hard-capped before validation
 * so an oversized field fails cleanly rather than reaching
 * the database.
 */
function cleanString(maxLength) {
  return z.preprocess(
    (value) => (
      typeof value === 'string'
        ? value.trim().slice(0, maxLength)
        : ''
    ),
    z.string()
  );
}


function requiredString(
  maxLength,
  message
) {
  return cleanString(maxLength)
    .pipe(
      z.string().min(
        1,
        message
      )
    );
}


/*
 * Money arrives from the form as a display string such as
 * "1,000,000" or "₦1,000,000.00". Strip the decoration
 * before the numeric check.
 */
function moneyField(
  message
) {
  return z.preprocess(
    (value) => {
      if (
        typeof value !== 'string'
      ) {
        return value;
      }


      const stripped =
        value
          .replace(/[₦$,\s]/g, '')
          .trim();


      if (stripped === '') {
        return undefined;
      }


      return Number(stripped);
    },

    z
      .number({
        invalid_type_error: message
      })
      .positive(message)
      .max(
        99_999_999_999.99,
        'Please contact us directly for amounts of this size.'
      )
  );
}


const PRODUCTS = [
  'MONEY_MARKET_NOTE',
  'FIXED_INCOME_NOTE',
  'FIXED_INCOME_DOLLAR_NOTE'
];


const EMPLOYMENT_STATUSES = [
  'UNEMPLOYED',
  'SELF_EMPLOYED',
  'EMPLOYED',
  'RETIRED'
];


const MATURITY_MANDATES = [
  'ROLLOVER_PRINCIPAL_AND_INTEREST',
  'ROLLOVER_PRINCIPAL_PAY_INTEREST',
  'PAY_PRINCIPAL_AND_INTEREST'
];


const TENORS = [
  'Less than 1 year',
  '1 - 3 years',
  '3 - 5 years',
  '5 - 10 years',
  'More than 10 years'
];


/*
 * BVN and NIN are both eleven digits. Validating the shape
 * here means a mistyped value is rejected before it is
 * encrypted and stored, where it would be far harder to
 * inspect and correct.
 */
const ELEVEN_DIGITS =
  /^\d{11}$/;


const subscriptionSchema = z.object({
  product:
    z.enum(
      PRODUCTS,
      {
        errorMap: () => ({
          message: 'Please select an investment product.'
        })
      }
    ),

  // ---- Personal information -----------------------------
  firstName:
    requiredString(
      80,
      'First name is required.'
    ),

  middleName:
    cleanString(80),

  surname:
    requiredString(
      80,
      'Surname is required.'
    ),

  maidenName:
    cleanString(80),

  gender:
    requiredString(
      30,
      'Gender is required.'
    ),

  dateOfBirth:
    cleanString(10)
      .pipe(
        z
          .string()
          .regex(
            /^\d{4}-\d{2}-\d{2}$/,
            'Enter your date of birth.'
          )
      )
      .refine(
        (value) => {
          const dob =
            new Date(value);

          if (
            Number.isNaN(
              dob.getTime()
            )
          ) {
            return false;
          }


          const eighteenYearsAgo =
            new Date();

          eighteenYearsAgo.setFullYear(
            eighteenYearsAgo.getFullYear() - 18
          );


          return dob <= eighteenYearsAgo;
        },

        {
          message:
            'You must be at least 18 years old to subscribe.'
        }
      ),

  maritalStatus:
    requiredString(
      30,
      'Marital status is required.'
    ),

  stateOfOrigin:
    requiredString(
      60,
      'State of origin is required.'
    ),

  lga:
    requiredString(
      60,
      'Local government area is required.'
    ),

  residentialAddress:
    requiredString(
      300,
      'Residential address is required.'
    ),

  phone:
    requiredString(
      30,
      'Phone number is required.'
    ),

  email:
    cleanString(254)
      .pipe(
        z
          .string()
          .toLowerCase()
          .email(
            'Please provide a valid email address.'
          )
      ),

  occupation:
    requiredString(
      100,
      'Occupation is required.'
    ),

  employmentStatus:
    z.enum(
      EMPLOYMENT_STATUSES,
      {
        errorMap: () => ({
          message: 'Please select your employment status.'
        })
      }
    ),

  meansOfIdentification:
    requiredString(
      60,
      'Please select a means of identification.'
    ),

  idNumber:
    requiredString(
      40,
      'Identification number is required.'
    ),

  nationality:
    requiredString(
      60,
      'Nationality is required.'
    ),

  // ---- Next of kin --------------------------------------
  nextOfKinName:
    requiredString(
      120,
      'Next of kin name is required.'
    ),

  nextOfKinRelationship:
    requiredString(
      60,
      'Next of kin relationship is required.'
    ),

  nextOfKinPhone:
    requiredString(
      30,
      'Next of kin phone number is required.'
    ),

  nextOfKinAddress:
    requiredString(
      300,
      'Next of kin address is required.'
    ),

  natureOfBusiness:
    cleanString(150),

  estimatedAnnualIncome:
    z.preprocess(
      (value) => {
        if (
          typeof value !== 'string'
        ) {
          return value;
        }


        const stripped =
          value
            .replace(/[₦$,\s]/g, '')
            .trim();


        if (stripped === '') {
          return undefined;
        }


        return Number(stripped);
      },

      z
        .number()
        .nonnegative()
        .optional()
    ),

  // ---- Investment information ---------------------------
  principalAmount:
    moneyField(
      'Enter the amount you intend to invest.'
    ),

  fixedDepositTenor:
    z.enum(
      TENORS,
      {
        errorMap: () => ({
          message: 'Please select an investment tenor.'
        })
      }
    ),

  riskAcceptance:
    z.preprocess(
      (value) => (
        typeof value === 'string' && value.trim() !== ''
          ? Number(value)
          : value
      ),

      z
        .number()
        .int()
        .min(1, 'Select a risk level from 1 to 5.')
        .max(5, 'Select a risk level from 1 to 5.')
    ),

  maturityMandate:
    z.enum(
      MATURITY_MANDATES,
      {
        errorMap: () => ({
          message: 'Please choose what happens at maturity.'
        })
      }
    ),

  // ---- Banking (settlement) details ----------------------
  bankName:
    requiredString(
      120,
      'Bank name is required.'
    ),

  accountName:
    requiredString(
      150,
      'Account name is required.'
    ),

  accountNumber:
    cleanString(20)
      .pipe(
        z
          .string()
          .regex(
            /^\d{10}$/,
            'Enter your 10-digit NUBAN account number.'
          )
      ),

  // ---- Regulated identifiers ----------------------------
  bvn:
    cleanString(11)
      .pipe(
        z
          .string()
          .regex(
            ELEVEN_DIGITS,
            'Your BVN must be exactly 11 digits.'
          )
      ),

  nin:
    z.preprocess(
      (value) => (
        typeof value === 'string'
          ? value.trim()
          : ''
      ),

      z
        .string()
        .regex(
          ELEVEN_DIGITS,
          'Your NIN must be exactly 11 digits.'
        )
        .or(
          z.literal('')
        )
    ),

  // ---- Attestation --------------------------------------
  attestationAccepted:
    z.preprocess(
      (value) => (
        value === 'on' ||
        value === 'true' ||
        value === true
      ),

      z.literal(
        true,
        {
          errorMap: () => ({
            message:
              'Please confirm that the information provided is accurate.'
          })
        }
      )
    ),

  privacyAcknowledged:
    z.preprocess(
      (value) => (
        value === 'on' ||
        value === 'true' ||
        value === true
      ),

      z.literal(
        true,
        {
          errorMap: () => ({
            message:
              'Please acknowledge the privacy notice.'
          })
        }
      )
    )
});


module.exports = {
  subscriptionSchema,
  PRODUCTS,
  EMPLOYMENT_STATUSES,
  MATURITY_MANDATES,
  TENORS
};