/**
 * Subscription form behaviour.
 *
 * The server is the authority on validation. Everything here
 * exists to catch mistakes earlier and to keep a long form
 * from feeling like a wall, not to decide what is acceptable.
 */

(function () {
  'use strict';

  var form =
    document.getElementById('subscriptionForm');

  if (!form) {
    return;
  }


  var submitButton =
    document.getElementById('subscriptionSubmit');

  var submitLabel =
    form.querySelector('[data-submit-label]');


  /* ---------------------------------------------------------
   * Error rendering
   * ------------------------------------------------------- */

  var summary =
    form.querySelector('[data-error-summary]');

  var summaryList =
    form.querySelector('[data-error-summary-list]');


  function clearErrors() {
    form
      .querySelectorAll('[data-error-for]')
      .forEach(function (node) {
        node.textContent = '';
      });

    form
      .querySelectorAll('[aria-invalid="true"]')
      .forEach(function (node) {
        node.removeAttribute('aria-invalid');
      });

    form
      .querySelectorAll('.has-error')
      .forEach(function (node) {
        node.classList.remove('has-error');
      });

    if (summary) {
      summary.hidden = true;
    }

    if (summaryList) {
      summaryList.innerHTML = '';
    }
  }


  /**
   * Find the human-readable label for a field, so the summary
   * says "Account number" rather than "accountNumber".
   */
  function labelFor(
    fieldName
  ) {
    var input =
      form.querySelector(
        '[name="' + fieldName + '"]'
      );

    if (!input) {
      return fieldName;
    }


    var wrapper =
      input.closest('.sub-field, .sub-upload');

    var labelNode =
      wrapper
        ? wrapper.querySelector('label, .sub-label')
        : null;

    if (!labelNode) {
      return fieldName;
    }


    return labelNode.textContent
      .replace('*', '')
      .trim();
  }


  function showError(
    fieldName,
    message
  ) {
    var target =
      form.querySelector(
        '[data-error-for="' + fieldName + '"]'
      );

    if (target) {
      target.textContent = message;
    }


    /*
     * Radio groups share a name, so mark every input in the
     * group rather than only the first one.
     */
    var inputs =
      form.querySelectorAll(
        '[name="' + fieldName + '"]'
      );

    inputs.forEach(function (input) {
      input.setAttribute(
        'aria-invalid',
        'true'
      );

      var wrapper =
        input.closest('.sub-field, .sub-upload, .sub-section');

      if (wrapper) {
        wrapper.classList.add('has-error');
      }
    });


    /*
     * Add to the summary so a long form does not require
     * hunting through six sections to find what failed.
     */
    if (summaryList && fieldName !== '_form') {
      var item =
        document.createElement('li');

      var link =
        document.createElement('a');

      link.href = '#';

      link.textContent =
        labelFor(fieldName) + ': ' + message;

      link.addEventListener('click', function (event) {
        event.preventDefault();

        var first =
          form.querySelector(
            '[name="' + fieldName + '"]'
          );

        if (first) {
          first.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });

          first.focus({
            preventScroll: true
          });
        }
      });

      item.appendChild(link);

      summaryList.appendChild(item);
    }
  }


  /**
   * Accept either shape the server might send: an object keyed
   * by field name, or an array of { field, message }.
   */
  function normaliseErrors(
    raw
  ) {
    var normalised = {};

    if (!raw) {
      return normalised;
    }


    if (Array.isArray(raw)) {
      raw.forEach(function (issue) {
        if (
          issue &&
          issue.field &&
          !normalised[issue.field]
        ) {
          normalised[issue.field] = issue.message;
        }
      });

      return normalised;
    }


    Object.keys(raw).forEach(function (field) {
      normalised[field] = raw[field];
    });

    return normalised;
  }

  /* ---------------------------------------------------------
   * Money formatting
   *
   * Format on blur rather than on every keystroke: reformatting
   * mid-entry fights the caret and makes the field feel broken.
   * ------------------------------------------------------- */

  form
    .querySelectorAll('[data-money]')
    .forEach(function (input) {
      input.addEventListener('blur', function () {
        var digits =
          input.value.replace(/[^\d.]/g, '');

        if (digits === '') {
          return;
        }


        var amount =
          Number(digits);

        if (!isFinite(amount)) {
          return;
        }


        input.value =
          amount.toLocaleString('en-NG');
      });


      input.addEventListener('focus', function () {
        input.value =
          input.value.replace(/,/g, '');
      });
    });


  /* ---------------------------------------------------------
   * Digit-only fields
   * ------------------------------------------------------- */

  ['accountNumber', 'bvn', 'nin'].forEach(
    function (name) {
      var input =
        form.querySelector('[name="' + name + '"]');

      if (!input) {
        return;
      }


      input.addEventListener('input', function () {
        input.value =
          input.value.replace(/\D/g, '');
      });
    }
  );


  /* ---------------------------------------------------------
   * File inputs: show the chosen name, check size client-side
   * ------------------------------------------------------- */

  form
    .querySelectorAll('[data-upload]')
    .forEach(function (wrapper) {
      var input =
        wrapper.querySelector('input[type="file"]');

      var nameTarget =
        wrapper.querySelector('[data-filename]');

      if (!input) {
        return;
      }


      input.addEventListener('change', function () {
        var file =
          input.files && input.files[0];

        var errorTarget =
          wrapper.querySelector('[data-error-for]');

        if (errorTarget) {
          errorTarget.textContent = '';
        }


        if (!file) {
          wrapper.classList.remove('is-filled');

          if (nameTarget) {
            nameTarget.textContent = '';
          }

          return;
        }


        var maxMb =
          Number(
            input.getAttribute('data-max-mb') || 4
          );


        if (
          file.size > maxMb * 1024 * 1024
        ) {
          input.value = '';

          wrapper.classList.remove('is-filled');

          if (nameTarget) {
            nameTarget.textContent = '';
          }

          if (errorTarget) {
            errorTarget.textContent =
              'That file is ' +
              (file.size / (1024 * 1024)).toFixed(1) +
              'MB. The limit is ' + maxMb + 'MB.';
          }

          return;
        }


        wrapper.classList.add('is-filled');

        if (nameTarget) {
          nameTarget.textContent =
            file.name +
            ' (' +
            (file.size / 1024).toFixed(0) +
            ' KB)';
        }
      });
    });


  /* ---------------------------------------------------------
   * Progress rail
   *
   * Highlights whichever section is nearest the top of the
   * viewport. Purely orientation; it does not gate anything.
   * ------------------------------------------------------- */

  (function initRail() {
    var sections =
      Array.prototype.slice.call(
        form.querySelectorAll('[data-step]')
      );

    var railItems =
      document.querySelectorAll('[data-rail]');

    if (
      !sections.length ||
      !railItems.length ||
      !('IntersectionObserver' in window)
    ) {
      return;
    }


    var observer =
      new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) {
              return;
            }


            var step =
              entry.target.getAttribute('data-step');


            railItems.forEach(function (item) {
              var itemStep =
                item.getAttribute('data-rail');

              item.classList.toggle(
                'is-active',
                itemStep === step
              );

              item.classList.toggle(
                'is-done',
                Number(itemStep) < Number(step)
              );
            });
          });
        },

        {
          rootMargin: '-20% 0px -70% 0px',
          threshold: 0
        }
      );


    sections.forEach(function (section) {
      observer.observe(section);
    });
  })();


  /* ---------------------------------------------------------
   * Warn before leaving with work in progress
   * ------------------------------------------------------- */

  var isDirty = false;

  var isSubmitting = false;


  form.addEventListener('input', function () {
    isDirty = true;
  });


  window.addEventListener('beforeunload', function (event) {
    if (!isDirty || isSubmitting) {
      return undefined;
    }


    event.preventDefault();

    /*
     * Browsers ignore custom text here and show their own
     * wording, but a value must still be returned.
     */
    event.returnValue = '';

    return '';
  });


  /* ---------------------------------------------------------
   * Submit
   * ------------------------------------------------------- */

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    clearErrors();


    /*
     * Let the browser surface its own required-field messages
     * first. They are localised and already accessible.
     */
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }


    isSubmitting = true;

    submitButton.disabled = true;

    if (submitLabel) {
      submitLabel.textContent = 'Submitting';
    }


    fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: {
        Accept: 'application/json'
      },
      credentials: 'same-origin'
    })
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            return {
              ok: false,
              errors: {
                _form:
                  'The server returned an unexpected response.'
              }
            };
          })
          .then(function (payload) {
            return {
              status: response.status,
              payload: payload
            };
          });
      })
      .then(function (result) {
        if (
          result.payload &&
          result.payload.ok
        ) {
          isDirty = false;

          window.location.href =
            '/subscribe/received?ref=' +
            encodeURIComponent(
              result.payload.reference || ''
            );

          return;
        }


        isSubmitting = false;

        var errors =
          normaliseErrors(
            result.payload && result.payload.errors
          );


        var firstField = null;

        Object.keys(errors).forEach(function (field) {
          showError(
            field,
            errors[field]
          );

          if (!firstField) {
            firstField = field;
          }
        });


        if (!Object.keys(errors).length) {
          showError(
            '_form',
            'Your application could not be submitted. Please try again.'
          );
        } else if (summary) {
          summary.hidden = false;

          summary.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });

          summary.focus({
            preventScroll: true
          });
        }


        /*
         * Move the user to the first problem rather than
         * leaving them to hunt through six sections.
         */
        var focusTarget =
          firstField
            ? form.querySelector(
                '[name="' + firstField + '"]'
              )
            : null;

        if (focusTarget) {
          focusTarget.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });

          focusTarget.focus({
            preventScroll: true
          });
        }
      })
      .catch(function () {
        isSubmitting = false;

        showError(
          '_form',
          'We could not reach the server. Check your connection and try again.'
        );
      })
      .finally(function () {
        submitButton.disabled = false;

        if (submitLabel) {
          submitLabel.textContent = 'Submit application';
        }
      });
  });
})();