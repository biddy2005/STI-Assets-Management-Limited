(() => {
  'use strict';

  /* ============================================================
     RATE CALCULATOR
     ------------------------------------------------------------
     Indicative only. The figures shown are gross of withholding
     tax, which is stated in the markup rather than assumed to be
     understood.

     Progressive enhancement: if the rate feed fails, the panel
     explains itself and points at the contact page rather than
     showing a broken control.
  ============================================================ */

  const root = document.querySelector('[data-rate-calculator]');

  if (!root) return;

  const productField = root.querySelector('[data-calc-product]');
  const amountField = root.querySelector('[data-calc-amount]');
  const tenorField = root.querySelector('[data-calc-tenor]');
  const resultPanel = root.querySelector('[data-calc-result]');
  const statusNode = root.querySelector('[data-calc-status]');

  const outRate = root.querySelector('[data-calc-out-rate]');
  const outInterest = root.querySelector('[data-calc-out-interest]');
  const outTotal = root.querySelector('[data-calc-out-total]');
  const outTenor = root.querySelector('[data-calc-out-tenor]');

  let rates = [];

  /*
    Currency is a property of the product, not of the rate, so
    it lives here rather than coming down with the feed.
  */
  const CURRENCY = {
    MONEY_MARKET_NOTE: { symbol: '₦', locale: 'en-NG' },
    FIXED_INCOME_NOTE: { symbol: '₦', locale: 'en-NG' },
    FIXED_INCOME_DOLLAR_NOTE: { symbol: '$', locale: 'en-US' }
  };


  function currencyFor(product) {
    return CURRENCY[product] || CURRENCY.MONEY_MARKET_NOTE;
  }


  function formatMoney(value, product) {
    const { symbol, locale } = currencyFor(product);

    return symbol + value.toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }


  function parseAmount(raw) {
    const digits = String(raw || '').replace(/[^\d.]/g, '');

    if (digits === '') return null;

    const amount = Number(digits);

    return Number.isFinite(amount) && amount > 0 ? amount : null;
  }


  function setStatus(message, isError) {
    if (!statusNode) return;

    statusNode.textContent = message || '';
    statusNode.classList.toggle('is-error', Boolean(isError));
  }


  function showResult(show) {
    if (!resultPanel) return;
    resultPanel.hidden = !show;
  }


  /**
   * Find the applicable rate.
   *
   * The feed is ordered with the highest amount tier first, so
   * the first row that satisfies both bands is the best tier
   * the investor qualifies for.
   */
  function findRate(product, amount, days) {
    return rates.find((rate) => (
      rate.product === product &&
      days >= rate.tenorMinDays &&
      days <= rate.tenorMaxDays &&
      amount >= rate.minAmount &&
      (rate.maxAmount === null || amount <= rate.maxAmount)
    )) || null;
  }


  function calculate() {
    const product = productField.value;
    const amount = parseAmount(amountField.value);
    const days = Number(tenorField.value);

    if (!amount) {
      showResult(false);
      setStatus('Enter an amount to see an indicative return.');
      return;
    }

    if (!Number.isFinite(days) || days <= 0) {
      showResult(false);
      setStatus('Select a tenor.');
      return;
    }

    const match = findRate(product, amount, days);

    if (!match) {
      showResult(false);

      setStatus(
        'No published rate covers that combination. ' +
        'Speak with an advisor for a quote.',
        true
      );

      return;
    }

    /*
      Simple interest on an actual/365 basis, which is the
      convention for Nigerian money market and short-tenor
      fixed income instruments. Not compounded: these notes pay
      at maturity.
    */
    const interest = amount * (match.ratePercent / 100) * (days / 365);
    const total = amount + interest;

    outRate.textContent = match.ratePercent.toFixed(2) + '%';
    outInterest.textContent = formatMoney(interest, product);
    outTotal.textContent = formatMoney(total, product);
    outTenor.textContent = days + ' days';

    setStatus('');
    showResult(true);
  }


  /**
   * Rebuild the tenor options for the selected product.
   *
   * Offering a tenor the product does not support would
   * produce a "no rate found" message for a combination we
   * already know is invalid.
   */
  function refreshTenorOptions() {
    const product = productField.value;

    const available = rates
      .filter((rate) => rate.product === product)
      .map((rate) => rate.tenorMaxDays);

    const unique = [...new Set(available)].sort((a, b) => a - b);

    const previous = tenorField.value;

    tenorField.innerHTML = '';

    if (!unique.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No rates published';
      tenorField.appendChild(option);
      tenorField.disabled = true;
      return;
    }

    tenorField.disabled = false;

    unique.forEach((days) => {
      const option = document.createElement('option');
      option.value = String(days);
      option.textContent = days + ' days';
      tenorField.appendChild(option);
    });

    if (unique.includes(Number(previous))) {
      tenorField.value = previous;
    }
  }


  /* ---------------------------------------------------------
     Amount formatting
     Format on blur only: reformatting mid-entry fights the
     caret and makes the field feel broken.
  --------------------------------------------------------- */

  amountField.addEventListener('blur', () => {
    const amount = parseAmount(amountField.value);
    if (amount === null) return;

    const { locale } = currencyFor(productField.value);
    amountField.value = amount.toLocaleString(locale);
    calculate();
  });

  amountField.addEventListener('focus', () => {
    amountField.value = amountField.value.replace(/,/g, '');
  });

  amountField.addEventListener('input', calculate);
  tenorField.addEventListener('change', calculate);

  productField.addEventListener('change', () => {
    refreshTenorOptions();
    calculate();
  });

  

  /* ---------------------------------------------------------
     Load rates
  --------------------------------------------------------- */

  setStatus('Loading current rates…');

  fetch('/api/rates', { headers: { Accept: 'application/json' } })
    .then((response) => response.json())
    .then((payload) => {
      if (!payload || !payload.ok || !payload.rates.length) {
        throw new Error('No rates available');
      }

      rates = payload.rates;

      root.classList.add('is-ready');
      refreshTenorOptions();

      setStatus('Enter an amount to see an indicative return.');
    })
    .catch(() => {
      setStatus(
        'Rates are unavailable right now. ' +
        'Please contact us for current rates.',
        true
      );

      productField.disabled = true;
      amountField.disabled = true;
      tenorField.disabled = true;
    });
})();
