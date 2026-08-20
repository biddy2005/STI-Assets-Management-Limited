(() => {
  window.__animationsFileLoaded = true;
  window.__animationsFileVersion =
  'site-animations-24';

  function initialiseAnimations() {
    if (window.__animationsInitialised) return;

    window.__animationsInitialised = true;

    // ============================================================
    // STICKY HEADER
    // ============================================================

    const header = document.querySelector('.site-header');

    if (header) {
      const updateHeader = () => {
        const hasScrolled = window.scrollY > 50;

        /*
          Keep both class names because the existing global
          stylesheet may use either one.
        */
        header.classList.toggle(
          'is-sticky',
          hasScrolled
        );

        header.classList.toggle(
          'is-scrolling',
          hasScrolled
        );
      };

      updateHeader();

      window.addEventListener(
        'scroll',
        updateHeader,
        { passive: true }
      );
    }
        // ============================================================
    // HOMEPAGE HERO MESSAGE ROTATOR
    // ============================================================

    const heroRotator =
      document.querySelector(
        '[data-hero-rotator]'
      );

    if (heroRotator) {

      const heroMessages = Array.from(
        heroRotator.querySelectorAll(
          '.hero-message'
        )
      );


      const heroReducedMotion =
        window.matchMedia(
          '(prefers-reduced-motion: reduce)'
        ).matches;


      const heroExitDuration = 420;

      let heroIndex = 0;
      let heroTimer = null;


      /*
        Read the amount of time each message
        should remain visible from data-duration.
      */
      const getHeroHoldDuration =
        (message) => {

          const duration =
            Number(
              message.dataset.duration
            );

          return (
            Number.isFinite(duration) &&
            duration > 0
          )
            ? duration
            : 2500;
        };


      /*
        Make only one message active at a time.
      */
      const showHeroMessage =
        (index) => {

          heroMessages.forEach(
            (message, messageIndex) => {

              const isActive =
                messageIndex === index;


              message.classList.toggle(
                'is-active',
                isActive
              );


              message.classList.remove(
                'is-leaving'
              );


              message.setAttribute(
                'aria-hidden',
                isActive
                  ? 'false'
                  : 'true'
              );


              /*
                The final CTA should only enter
                the keyboard tab order while visible.
              */
              if (
                message.matches('a')
              ) {
                message.tabIndex =
                  isActive
                    ? 0
                    : -1;
              }

            }
          );

        };


      /*
        Stop an existing timer safely.
      */
      const clearHeroTimer = () => {

        if (heroTimer === null) {
          return;
        }

        window.clearTimeout(
          heroTimer
        );

        heroTimer = null;

      };


      /*
        Queue the transition to the next message.
      */
      const queueNextHeroMessage = () => {

        clearHeroTimer();


        const currentMessage =
          heroMessages[heroIndex];


        const holdDuration =
          getHeroHoldDuration(
            currentMessage
          );


        heroTimer =
          window.setTimeout(
            () => {

              currentMessage.classList.add(
                'is-leaving'
              );


              heroTimer =
                window.setTimeout(
                  () => {

                    heroIndex =
                      (
                        heroIndex + 1
                      ) %
                      heroMessages.length;


                    showHeroMessage(
                      heroIndex
                    );


                    queueNextHeroMessage();

                  },
                  heroExitDuration
                );

            },
            holdDuration
          );

      };


      /*
        Establish the starting message.
      */
      if (heroMessages.length) {

        showHeroMessage(0);


        /*
          Users who request reduced motion
          receive the static CSS version
          instead of an automatic loop.
        */
        if (heroReducedMotion) {

          heroMessages.forEach(
            (message) => {

              message.setAttribute(
                'aria-hidden',
                'false'
              );


              if (
                message.matches('a')
              ) {
                message.tabIndex = 0;
              }

            }
          );

        } else if (
          heroMessages.length > 1
        ) {

          queueNextHeroMessage();

        }

      }


      /*
        Do not continue cycling invisibly
        while the browser tab is inactive.
      */
      document.addEventListener(
        'visibilitychange',
        () => {

          clearHeroTimer();


          if (
            !document.hidden &&
            !heroReducedMotion &&
            heroMessages.length > 1
          ) {

            showHeroMessage(
              heroIndex
            );

            queueNextHeroMessage();

          }

        }
      );

    }
    // ============================================================
    // EXISTING GENERAL REVEALS
    // ============================================================

    const generalRevealElements = Array.from(
      document.querySelectorAll('.reveal-on-scroll')
    );

    if (
      generalRevealElements.length &&
      'IntersectionObserver' in window
    ) {
      const generalObserver = new IntersectionObserver(
        (entries, observer) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;

            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          });
        },
        {
          threshold: 0.15
        }
      );

      generalRevealElements.forEach((element) => {
        generalObserver.observe(element);
      });
    } else {
      generalRevealElements.forEach((element) => {
        element.classList.add('is-visible');
      });
    }

    // ============================================================
    // PAGE-SPECIFIC REVEAL GROUPS
    // ============================================================

    const aboutRevealGroups = [

      // ==========================================================
      // WHO WE ARE
      // ==========================================================

      {
        selector: '.about-overview-eyebrow',
        effect: 'reveal-up',
        delay: 0,
        stagger: 0
      },

      {
        selector: '.about-overview-content h2',
        effect: 'reveal-heading',
        delay: 40,
        stagger: 0
      },

      {
        selector: '.about-overview-lead',
        effect: 'reveal-up',
        delay: 80,
        stagger: 0
      },

      {
        selector: '.about-overview-text',
        effect: 'reveal-up',
        delay: 110,
        stagger: 45
      },

      {
        selector: '.about-overview-facts',
        effect: 'reveal-up',
        delay: 150,
        stagger: 0
      },

      {
        selector: '.about-overview-visual',
        effect: 'reveal-right',
        delay: 70,
        stagger: 0
      },


      // ==========================================================
      // PURPOSE
      // ==========================================================

      {
        selector:
          '.about-purpose-header ' +
          '.values-eyebrow-row',
        effect: 'reveal-up',
        delay: 0,
        stagger: 0
      },

      {
        selector: '.about-purpose-header h2',
        effect: 'reveal-heading',
        delay: 40,
        stagger: 0
      },

      {
        selector: '.about-purpose-header p',
        effect: 'reveal-up',
        delay: 80,
        stagger: 0
      },

      {
        selector: '.about-purpose-card',
        effect: 'reveal-card',
        delay: 90,
        stagger: 70
      },


      // ==========================================================
      // VISION & MISSION
      // ==========================================================

      {
        selector:
          '.about-direction-header ' +
          '.values-eyebrow-row',
        effect: 'reveal-up',
        delay: 0,
        stagger: 0
      },

      {
        selector: '.about-direction-header h2',
        effect: 'reveal-heading',
        delay: 40,
        stagger: 0
      },

      {
        selector: '.about-direction-header p',
        effect: 'reveal-up',
        delay: 80,
        stagger: 0
      },

      {
        selector: '.about-direction-card',
        effect: 'reveal-card',
        delay: 90,
        stagger: 75
      },


      // ==========================================================
      // CORE VALUES
      // ==========================================================

      {
        selector:
          '.about-values-modern-header ' +
          '.values-eyebrow-row',
        effect: 'reveal-up',
        delay: 0,
        stagger: 0
      },

      {
        selector: '.about-values-modern-header h2',
        effect: 'reveal-heading',
        delay: 40,
        stagger: 0
      },

      {
        selector: '.about-values-modern-header p',
        effect: 'reveal-up',
        delay: 80,
        stagger: 0
      },

      {
        selector: '.about-value-card',
        effect: 'reveal-card',
        delay: 90,
        stagger: 60
      }

    ];

    const homeRevealGroups = [

      // ==========================================================
      // SERVICES
      // ==========================================================

      {
        selector:
          '.services-modern-section ' +
          '.values-eyebrow-row',
        effect: 'reveal-up',
        delay: 0,
        stagger: 0
      },

      {
        selector:
          '.services-modern-section ' +
          '.services-modern-heading',
        effect: 'reveal-heading',
        delay: 40,
        stagger: 0
      },

      {
        selector:
          '.services-modern-section ' +
          '.services-modern-subheading',
        effect: 'reveal-up',
        delay: 80,
        stagger: 0
      },

      {
        selector: '.services-modern-card',
        effect: 'reveal-card',
        delay: 80,
        stagger: 60
      },


      // ==========================================================
      // ABOUT / WHO WE ARE PREVIEW
      // ==========================================================

      {
        selector: '.home-about-visual',
        effect: 'reveal-left',
        delay: 0,
        stagger: 0
      },

      {
        selector: '.home-about-eyebrow-row',
        effect: 'reveal-up',
        delay: 20,
        stagger: 0
      },

      {
        selector: '.home-about-heading',
        effect: 'reveal-heading',
        delay: 50,
        stagger: 0
      },

      {
        selector: '.home-about-lead',
        effect: 'reveal-right',
        delay: 90,
        stagger: 0
      },

      {
        selector: '.home-about-description',
        effect: 'reveal-right',
        delay: 120,
        stagger: 0
      },

      {
        selector: '.home-about-link',
        effect: 'reveal-up',
        delay: 150,
        stagger: 0
      },


      // ==========================================================
      // PRODUCTS
      // ==========================================================

      {
        selector:
          '.products-modern-header ' +
          '.values-eyebrow-row',
        effect: 'reveal-up',
        delay: 0,
        stagger: 0
      },

      {
        selector:
          '.products-modern-header ' +
          '.services-modern-heading',
        effect: 'reveal-heading',
        delay: 40,
        stagger: 0
      },

      {
        selector: '.products-modern-subheading',
        effect: 'reveal-up',
        delay: 80,
        stagger: 0
      },

      {
        selector: '.products-modern-card',
        effect: 'reveal-card',
        delay: 80,
        stagger: 65
      },


      // ==========================================================
      // COMMUNITY & INSIGHTS
      // ==========================================================

      {
        selector:
          '.home-insights-header ' +
          '.values-eyebrow-row',
        effect: 'reveal-up',
        delay: 0,
        stagger: 0
      },

      {
        selector:
          '.home-insights-header ' +
          '.services-modern-heading',
        effect: 'reveal-heading',
        delay: 40,
        stagger: 0
      },

      {
        selector: '.home-insights-subheading',
        effect: 'reveal-up',
        delay: 80,
        stagger: 0
      },

      {
        selector:
          '.home-insights-carousel, ' +
          '.home-insights-empty',
        effect: 'reveal-scale',
        delay: 100,
        stagger: 0
      },

      {
        selector: '.home-insights-footer',
        effect: 'reveal-up',
        delay: 130,
        stagger: 0
      }

    ];

    const teamRevealGroups = [
  {
    selector: '.team-switch-pill',
    effect: 'reveal-up',
    stagger: 0
  },
  {
    selector:
      '#board-view .leadership-header, ' +
      '#management-view .leadership-header',
    effect: 'reveal-up',
    stagger: 0
  },
  {
    selector: '#board-view .leadership-card',
    effect: 'reveal-up',
    stagger: 80
  },
  {
    selector:
      '#management-view .leadership-card',
    effect: 'reveal-up',
    stagger: 90
  }
];

const servicesRevealGroups = [
  {
    selector:
      '.service-advisory-section .service-intro',
    effect: 'reveal-up',
    stagger: 0
  },
  {
    selector:
      '.service-advisory-section .service-feature',
    effect: 'reveal-up',
    stagger: 90
  },
  {
    selector:
      '.service-research-section ' +
      '.section-header-center',
    effect: 'reveal-up',
    stagger: 0
  },
  {
    selector:
      '.service-research-section .research-card',
    effect: 'reveal-up',
    stagger: 80
  },
  {
    selector:
      '.service-portfolio-section ' +
      '.section-header-center',
    effect: 'reveal-up',
    stagger: 0
  },
  {
    selector:
      '.service-portfolio-section ' +
      '.portfolio-service-card',
    effect: 'reveal-up',
    stagger: 90
  },
{
  selector:
    '.service-corporate-section ' +
    '.section-header-center',
  effect: 'reveal-up',
  stagger: 0
},
{
  selector:
    '.service-corporate-section ' +
    '.corporate-service-card',
  effect: 'reveal-up',
  stagger: 110
}
  
];

const productsRevealGroups = [
  {
    selector:
      '.product-money-market-section ' +
      '.money-market-copy, ' +
      '.product-money-market-section ' +
      '.money-market-facts',
    effect: 'reveal-up',
    stagger: 100
  },
  {
    selector:
      '.product-money-market-section ' +
      '.money-market-detail-grid > *',
    effect: 'reveal-up',
    stagger: 110
  },
  {
    selector:
  '.product-fixed-income-section ' +
  '.fixed-income-copy, ' +
  '.product-fixed-income-section ' +
  '.fixed-income-facts',
    effect: 'reveal-up',
    stagger: 100
  },
  {
    selector:
      '.product-fixed-income-section ' +
      '.fixed-income-detail-grid > *',
    effect: 'reveal-up',
    stagger: 110
  },
  {
  selector:
    '.product-fixed-income-dollar-section ' +
    '.fixed-income-dollar-copy, ' +
    '.product-fixed-income-dollar-section ' +
    '.fixed-income-dollar-facts',
  effect: 'reveal-up',
  stagger: 100
},
{
  selector:
    '.product-fixed-income-dollar-section ' +
    '.fixed-income-dollar-detail-grid > *',
  effect: 'reveal-up',
  stagger: 110
},
{
  selector:
    '.product-rate-section ' +
    '.rate-guide-header, ' +
    '.product-rate-section ' +
    '.rate-guide-table-scroll, ' +
    '.product-rate-section ' +
    '.rate-guide-note',
  effect: 'reveal-up',
  stagger: 90
}
];

const faqsRevealGroups = [
  {
    selector:
      '.faqs-section .faqs-tabs',
    effect: 'reveal-up',
    stagger: 0
  },
  {
    selector:
      '.faqs-section .faqs-panel',
    effect: 'reveal-up',
    stagger: 90
  }
];

const downloadsRevealGroups = [
  {
    selector:
      '.downloads-section .downloads-card',
    effect: 'reveal-up',
    stagger: 75
  }
];

const newsRevealGroups = [
  {
    selector:
      '.news-listing-section .news-card',
    effect: 'reveal-up',
    stagger: 90
  },
  {
    selector:
      '.news-listing-section .news-empty-state',
    effect: 'reveal-up',
    stagger: 0
  }
];
const newsArticleRevealGroups = [
  {
    selector:
      '.news-article-section .news-article-cover',
    effect: 'reveal-up',
    stagger: 0
  },
  {
    selector:
      '.news-article-section .news-article-content',
    effect: 'reveal-up',
    stagger: 0
  },
  {
    selector:
      '.news-article-section ' +
      '.news-article-gallery-header',
    effect: 'reveal-up',
    stagger: 0
  },
  {
    selector:
      '.news-article-section .news-gallery-item',
    effect: 'reveal-up',
    stagger: 80
  },
  {
    selector:
      '.news-article-section .news-article-back',
    effect: 'reveal-up',
    stagger: 0
  }
];
const contactRevealGroups = [
  {
    selector:
      '.contact-section .contact-success-banner',
    effect: 'reveal-up',
    stagger: 0
  },
  {
    selector:
      '.contact-section .contact-info-item',
    effect: 'reveal-up',
    stagger: 70
  },
  {
    selector:
      '.contact-section .contact-form-card',
    effect: 'reveal-up',
    stagger: 0
  },
  {
    selector:
      '.contact-map-section .contact-map-header',
    effect: 'reveal-up',
    stagger: 0
  },
  {
    selector:
      '.contact-map-section .contact-map-frame',
    effect: 'reveal-up',
    stagger: 0
  }
];

const careersRevealGroups = [
  {
    selector:
      '.careers-section .careers-success-banner',
    effect: 'reveal-up',
    stagger: 0
  },
  {
    selector:
      '.careers-section .careers-column-header',
    effect: 'reveal-up',
    stagger: 0
  },
  {
    selector:
      '.careers-section .job-card',
    effect: 'reveal-up',
    stagger: 85
  },
  {
    selector:
      '.careers-section .careers-empty',
    effect: 'reveal-up',
    stagger: 0
  },
  {
    selector:
      '.careers-section .careers-form-card',
    effect: 'reveal-up',
    stagger: 0
  }
];
const legalRevealGroups = [
  {
    selector:
      '.legal-section .legal-content > p:first-child',
    effect: 'reveal-up',
    stagger: 0
  },
  {
    selector:
      '.legal-section .legal-content > h2',
    effect: 'reveal-up',
    stagger: 0
  },
  {
    selector:
      '.legal-section .legal-content > ul',
    effect: 'reveal-up',
    stagger: 0
  }
];


    const revealElementSet = new Set();

    function registerRevealGroups(
      groups,
      baseClass
    ) {
      const pageElements = [];

      groups.forEach((group) => {
        const elements = Array.from(
          document.querySelectorAll(group.selector)
        );

        elements.forEach((element, index) => {
          element.classList.add(baseClass);

          if (
            group.effect &&
            group.effect !== 'reveal-up'
          ) {
            element.classList.add(group.effect);
          }

          const baseDelay =
            Number(group.delay || 0);

          const stagger =
            Number(group.stagger || 0);

          const delay = Math.min(
            baseDelay + (index * stagger),
            280
          );

          element.style.setProperty(
            '--reveal-delay',
            `${delay}ms`
          );

          pageElements.push(element);
          revealElementSet.add(element);
        });
      });

      return pageElements;
    }

    const aboutRevealElements =
  registerRevealGroups(
    aboutRevealGroups,
    'about-reveal'
  );

const homeRevealElements =
  registerRevealGroups(
    homeRevealGroups,
    'home-reveal'
  );

const teamRevealElements =
  registerRevealGroups(
    teamRevealGroups,
    'team-reveal'
  );

const servicesRevealElements =
  registerRevealGroups(
    servicesRevealGroups,
    'services-reveal'
  );

const productsRevealElements =
  registerRevealGroups(
    productsRevealGroups,
    'products-reveal'
  );

const faqsRevealElements =
  registerRevealGroups(
    faqsRevealGroups,
    'faqs-reveal'
  );

const downloadsRevealElements =
  registerRevealGroups(
    downloadsRevealGroups,
    'downloads-reveal'
  );

  const newsRevealElements =
  registerRevealGroups(
    newsRevealGroups,
    'news-reveal'
  );

  const newsArticleRevealElements =
  registerRevealGroups(
    newsArticleRevealGroups,
    'news-article-reveal'
  );
  const contactRevealElements =
  registerRevealGroups(
    contactRevealGroups,
    'contact-reveal'
  );
  const careersRevealElements =
  registerRevealGroups(
    careersRevealGroups,
    'careers-reveal'
  );
  const legalRevealElements =
  registerRevealGroups(
    legalRevealGroups,
    'legal-reveal'
  );


window.__aboutAnimationsCount =
  aboutRevealElements.length;

window.__homeAnimationsCount =
  homeRevealElements.length;

window.__teamAnimationsCount =
  teamRevealElements.length;

window.__servicesAnimationsCount =
  servicesRevealElements.length;

window.__productsAnimationsCount =
  productsRevealElements.length;

window.__faqsAnimationsCount =
  faqsRevealElements.length;

window.__downloadsAnimationsCount =
  downloadsRevealElements.length;

window.__newsAnimationsCount =
  newsRevealElements.length;

window.__newsArticleAnimationsCount =
  newsArticleRevealElements.length;

window.__contactAnimationsCount =
  contactRevealElements.length;

window.__careersAnimationsCount =
  careersRevealElements.length;

window.__legalAnimationsCount =
  legalRevealElements.length;

    const allRevealElements =
      Array.from(revealElementSet);

    window.__siteAnimationsCount =
      allRevealElements.length;

    if (!allRevealElements.length) return;

    const prefersReducedMotion =
      window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;

    if (
      prefersReducedMotion ||
      !('IntersectionObserver' in window)
    ) {
      allRevealElements.forEach((element) => {
        element.classList.add('is-visible');
      });

      return;
    }

    // ============================================================
    // SHARED ONE-TIME OBSERVER
    // ============================================================

    const pageObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      {
        threshold: 0.08,
        rootMargin: '0px 0px -3% 0px'
      }
    );

    allRevealElements.forEach((element) => {
      pageObserver.observe(element);
    });
  }

  /*
    Works whether the script is loaded in the header,
    footer, with defer, or after the DOM is ready.
  */

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      initialiseAnimations,
      { once: true }
    );
  } else {
    initialiseAnimations();
  }
})();