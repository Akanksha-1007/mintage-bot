(function () {
  'use strict';

  /*
   * ============================================================
   * MINTAGE BOTFLOW - WIDGET LAUNCHER
   * ============================================================
   *
   * Supports:
   * - Bot ID
   * - Custom launcher color
   * - Custom launcher logo
   * - Launcher position
   * - Launcher shape
   * - Chat iframe
   * - Bot designConfig from /api/bots/:id
   * - Responsive mobile layout
   * - External websites
   *
   * IMPORTANT:
   * The API / iframe URL is built from the widget.js server,
   * NOT from the website where the widget is embedded.
   * ============================================================
   */

  /* ------------------------------------------------------------
   * 1. FIND THE SCRIPT
   * ------------------------------------------------------------ */

  var script =
    document.currentScript ||
    document.querySelector('script[data-bot-id]');

  if (!script) {
    console.error(
      '[BotFlow] Widget script was not found.'
    );
    return;
  }

  /* ------------------------------------------------------------
   * 2. READ EMBED CONFIGURATION
   * ------------------------------------------------------------ */

  var botId =
    script.getAttribute('data-bot-id') || '';

  var embedColor =
    script.getAttribute('data-color') || '';

  var embedPosition =
    script.getAttribute('data-position') ||
    'bottom-right';

  var embedLogo =
    script.getAttribute('data-logo') || '';

  /* ------------------------------------------------------------
   * 3. FIND WIDGET SERVER ORIGIN
   * ------------------------------------------------------------
   *
   * Example:
   *
   * https://chatbot.mintagemarkcomm.com/widget.js
   *
   * becomes:
   *
   * https://chatbot.mintagemarkcomm.com
   *
   * We must use this origin for:
   *
   * /api/bots/:id
   * /widget/:id
   *
   * instead of:
   *
   * window.location.origin
   *
   * because the widget can be embedded on another website.
   * ------------------------------------------------------------ */

  var widgetOrigin = '';

  try {
    var scriptSrc = script.src;

    if (scriptSrc) {
      widgetOrigin =
        new URL(scriptSrc, window.location.href).origin;
    }
  } catch (error) {
    console.warn(
      '[BotFlow] Could not determine widget origin.',
      error
    );
  }

  if (!widgetOrigin) {
    widgetOrigin =
      window.location.origin;
  }

  /* ------------------------------------------------------------
   * 4. DECODE EMBED VALUES
   * ------------------------------------------------------------ */

  function decodeValue(value) {
    if (!value) return '';

    try {
      return decodeURIComponent(value);
    } catch (error) {
      return value;
    }
  }

  embedColor =
    decodeValue(embedColor);

  embedLogo =
    decodeValue(embedLogo);

  /* ------------------------------------------------------------
   * 5. VALIDATE BOT ID
   * ------------------------------------------------------------ */

  if (!botId) {
    console.error(
      '[BotFlow] data-bot-id is missing.'
    );
    return;
  }

  /* ------------------------------------------------------------
   * 6. DEFAULT DESIGN VALUES
   * ------------------------------------------------------------ */

  var designConfig = {};

  var launcherColor =
    embedColor ||
    '#5B3DF5';

  var launcherLogo =
    embedLogo ||
    '';

  var launcherPosition =
    embedPosition ||
    'bottom-right';

  var launcherShape =
    'circle';

  var launcherIcon =
    'chat';

  var launcherText =
    'Chat with us! 👋';

  var showTeaser =
    false;

  /* ------------------------------------------------------------
   * 7. CREATE MAIN LAUNCHER
   * ------------------------------------------------------------ */

  var launcher =
    document.createElement('button');

  launcher.type =
    'button';

  launcher.setAttribute(
    'aria-label',
    'Open chat'
  );

  launcher.setAttribute(
    'aria-expanded',
    'false'
  );

  launcher.style.position =
    'fixed';

  launcher.style.width =
    '60px';

  launcher.style.height =
    '60px';

  launcher.style.border =
    'none';

  launcher.style.padding =
    '0';

  launcher.style.margin =
    '0';

  launcher.style.cursor =
    'pointer';

  launcher.style.zIndex =
    '2147483647';

  launcher.style.display =
    'flex';

  launcher.style.alignItems =
    'center';

  launcher.style.justifyContent =
    'center';

  launcher.style.boxSizing =
    'border-box';

  launcher.style.overflow =
    'hidden';

  launcher.style.backgroundColor =
    launcherColor;

  launcher.style.boxShadow =
    '0 4px 18px rgba(0,0,0,0.25)';

  launcher.style.transition =
    'transform 0.2s ease, box-shadow 0.2s ease';

  /* ------------------------------------------------------------
   * 8. CREATE TEASER
   * ------------------------------------------------------------ */

  var teaser =
    document.createElement('div');

  teaser.style.position =
    'fixed';

  teaser.style.zIndex =
    '2147483646';

  teaser.style.padding =
    '10px 16px';

  teaser.style.background =
    '#ffffff';

  teaser.style.color =
    '#222222';

  teaser.style.borderRadius =
    '12px';

  teaser.style.fontFamily =
    'Arial, sans-serif';

  teaser.style.fontSize =
    '14px';

  teaser.style.fontWeight =
    '500';

  teaser.style.boxShadow =
    '0 4px 18px rgba(0,0,0,0.15)';

  teaser.style.whiteSpace =
    'nowrap';

  teaser.style.display =
    'none';

  teaser.textContent =
    launcherText;

  document.body.appendChild(
    teaser
  );

  /* ------------------------------------------------------------
   * 9. LAUNCHER ICON
   * ------------------------------------------------------------ */

  function getFallbackIcon() {

    if (launcherIcon === 'robot') {
      return '🤖';
    }

    if (launcherIcon === 'sparkles') {
      return '✨';
    }

    if (launcherIcon === 'message') {
      return '✉';
    }

    if (launcherIcon === 'help') {
      return '❔';
    }

    return '💬';
  }

  /* ------------------------------------------------------------
   * 10. RENDER LAUNCHER CONTENT
   * ------------------------------------------------------------ */

  function renderLauncher() {

    launcher.innerHTML = '';

    /*
     * ----------------------------------------------------------
     * CUSTOM LOGO
     * ----------------------------------------------------------
     */

    if (
      launcherLogo &&
      typeof launcherLogo === 'string' &&
      launcherLogo.trim() !== ''
    ) {

      var logoImage =
        document.createElement('img');

      logoImage.src =
        launcherLogo;

      logoImage.alt =
        'Chat';

      logoImage.style.width =
        '38px';

      logoImage.style.height =
        '38px';

      logoImage.style.maxWidth =
        '70%';

      logoImage.style.maxHeight =
        '70%';

      logoImage.style.objectFit =
        'contain';

      logoImage.style.display =
        'block';

      logoImage.style.pointerEvents =
        'none';

      logoImage.onerror =
        function () {

          console.warn(
            '[BotFlow] Launcher logo could not be loaded.'
          );

          launcherLogo = '';

          renderLauncher();
        };

      launcher.appendChild(
        logoImage
      );

      return;
    }

    /*
     * ----------------------------------------------------------
     * DEFAULT ICON
     * ----------------------------------------------------------
     */

    var icon =
      document.createElement('span');

    icon.textContent =
      getFallbackIcon();

    icon.style.fontSize =
      '28px';

    icon.style.lineHeight =
      '1';

    icon.style.display =
      'flex';

    icon.style.alignItems =
      'center';

    icon.style.justifyContent =
      'center';

    icon.style.pointerEvents =
      'none';

    launcher.appendChild(
      icon
    );
  }

  /* ------------------------------------------------------------
   * 11. APPLY POSITION
   * ------------------------------------------------------------ */

  function applyPosition() {

    /*
     * Clear previous position
     */

    launcher.style.left =
      'auto';

    launcher.style.right =
      'auto';

    launcher.style.top =
      'auto';

    launcher.style.bottom =
      'auto';

    teaser.style.left =
      'auto';

    teaser.style.right =
      'auto';

    teaser.style.top =
      'auto';

    teaser.style.bottom =
      'auto';

    /*
     * Bottom Left
     */

    if (
      launcherPosition ===
      'bottom-left'
    ) {

      launcher.style.left =
        '20px';

      launcher.style.bottom =
        '20px';

      teaser.style.left =
        '20px';

      teaser.style.bottom =
        '90px';

      teaser.style.transform =
        'none';

      return;
    }

    /*
     * Top Right
     */

    if (
      launcherPosition ===
      'top-right'
    ) {

      launcher.style.right =
        '20px';

      launcher.style.top =
        '20px';

      teaser.style.right =
        '20px';

      teaser.style.top =
        '90px';

      return;
    }

    /*
     * Top Left
     */

    if (
      launcherPosition ===
      'top-left'
    ) {

      launcher.style.left =
        '20px';

      launcher.style.top =
        '20px';

      teaser.style.left =
        '20px';

      teaser.style.top =
        '90px';

      return;
    }

    /*
     * Default Bottom Right
     */

    launcher.style.right =
      '20px';

    launcher.style.bottom =
      '20px';

    teaser.style.right =
      '20px';

    teaser.style.bottom =
      '90px';
  }

  /* ------------------------------------------------------------
   * 12. APPLY SHAPE
   * ------------------------------------------------------------ */

  function applyShape() {

    if (
      launcherShape ===
      'pill'
    ) {

      launcher.style.width =
        '70px';

      launcher.style.borderRadius =
        '30px';

    } else if (
      launcherShape ===
      'square'
    ) {

      launcher.style.borderRadius =
        '14px';

    } else if (
      launcherShape ===
      'rounded'
    ) {

      launcher.style.borderRadius =
        '16px';

    } else {

      /*
       * Circle
       */

      launcher.style.width =
        '60px';

      launcher.style.height =
        '60px';

      launcher.style.borderRadius =
        '50%';
    }
  }

  /* ------------------------------------------------------------
   * 13. CREATE CHAT IFRAME
   * ------------------------------------------------------------ */

  var iframe =
    document.createElement('iframe');

  /*
   * VERY IMPORTANT:
   *
   * Do NOT use:
   *
   * window.location.origin
   *
   * Use widgetOrigin.
   */

  iframe.src =
    widgetOrigin +
    '/widget/' +
    encodeURIComponent(botId);

  iframe.title =
    'Chatbot';

  iframe.setAttribute(
    'allow',
    'clipboard-write'
  );

  iframe.style.position =
    'fixed';

  iframe.style.width =
    '380px';

  iframe.style.height =
    '650px';

  iframe.style.maxWidth =
    'calc(100vw - 30px)';

  iframe.style.maxHeight =
    'calc(100vh - 100px)';

  iframe.style.border =
    'none';

  iframe.style.borderRadius =
    '16px';

  iframe.style.background =
    '#ffffff';

  iframe.style.boxShadow =
    '0 10px 40px rgba(0,0,0,0.20)';

  iframe.style.zIndex =
    '2147483646';

  iframe.style.display =
    'none';

  iframe.style.opacity =
    '0';

  iframe.style.transition =
    'opacity 0.2s ease';

  /* ------------------------------------------------------------
   * 14. APPLY IFRAME POSITION
   * ------------------------------------------------------------ */

  function applyIframePosition() {

    iframe.style.left =
      'auto';

    iframe.style.right =
      'auto';

    iframe.style.top =
      'auto';

    iframe.style.bottom =
      'auto';

    if (
      launcherPosition ===
      'bottom-left'
    ) {

      iframe.style.left =
        '20px';

      iframe.style.bottom =
        '90px';

    } else if (
      launcherPosition ===
      'top-right'
    ) {

      iframe.style.right =
        '20px';

      iframe.style.top =
        '90px';

    } else if (
      launcherPosition ===
      'top-left'
    ) {

      iframe.style.left =
        '20px';

      iframe.style.top =
        '90px';

    } else {

      iframe.style.right =
        '20px';

      iframe.style.bottom =
        '90px';
    }
  }

  /* ------------------------------------------------------------
   * 15. MOBILE STYLES
   * ------------------------------------------------------------ */

  function updateMobileStyles() {

    if (
      window.innerWidth <=
      600
    ) {

      /*
       * Launcher
       */

      launcher.style.width =
        '56px';

      launcher.style.height =
        '56px';

      /*
       * Iframe
       */

      iframe.style.width =
        'calc(100vw - 20px)';

      iframe.style.height =
        'calc(100vh - 90px)';

      iframe.style.maxWidth =
        'none';

      iframe.style.maxHeight =
        'none';

      /*
       * Position
       */

      if (
        launcherPosition ===
        'bottom-left'
      ) {

        launcher.style.left =
          '10px';

        launcher.style.bottom =
          '10px';

        iframe.style.left =
          '10px';

        iframe.style.bottom =
          '76px';

      } else if (
        launcherPosition ===
        'top-left'
      ) {

        launcher.style.left =
          '10px';

        launcher.style.top =
          '10px';

        iframe.style.left =
          '10px';

        iframe.style.top =
          '76px';

      } else if (
        launcherPosition ===
        'top-right'
      ) {

        launcher.style.right =
          '10px';

        launcher.style.top =
          '10px';

        iframe.style.right =
          '10px';

        iframe.style.top =
          '76px';

      } else {

        launcher.style.right =
          '10px';

        launcher.style.bottom =
          '10px';

        iframe.style.right =
          '10px';

        iframe.style.bottom =
          '76px';
      }

      /*
       * Teaser
       */

      teaser.style.maxWidth =
        'calc(100vw - 100px)';

      teaser.style.whiteSpace =
        'normal';

    } else {

      /*
       * Desktop
       */

      launcher.style.width =
        launcherShape === 'pill'
          ? '70px'
          : '60px';

      launcher.style.height =
        '60px';

      iframe.style.width =
        '380px';

      iframe.style.height =
        '650px';

      iframe.style.maxWidth =
        'calc(100vw - 30px)';

      iframe.style.maxHeight =
        'calc(100vh - 100px)';
    }
  }

  /* ------------------------------------------------------------
   * 16. APPLY DESIGN CONFIG
   * ------------------------------------------------------------ */

  function applyDesignConfig(cfg) {

    if (!cfg) {
      return;
    }

    designConfig =
      cfg || {};

    /*
     * ----------------------------------------------------------
     * COLOR
     * ----------------------------------------------------------
     */

    if (
      cfg.accentColor &&
      typeof cfg.accentColor === 'string'
    ) {

      launcherColor =
        cfg.accentColor;
    }

    /*
     * ----------------------------------------------------------
     * LOGO
     * ----------------------------------------------------------
     *
     * THIS IS THE IMPORTANT PART.
     */

    if (
      typeof cfg.launcherLogoUrl ===
      'string'
    ) {

      launcherLogo =
        cfg.launcherLogoUrl.trim();
    }

    /*
     * ----------------------------------------------------------
     * POSITION
     * ----------------------------------------------------------
     */

    if (
      cfg.launcherPosition
    ) {

      launcherPosition =
        cfg.launcherPosition;
    }

    /*
     * ----------------------------------------------------------
     * SHAPE
     * ----------------------------------------------------------
     */

    if (
      cfg.launcherShape
    ) {

      launcherShape =
        cfg.launcherShape;
    }

    /*
     * ----------------------------------------------------------
     * ICON
     * ----------------------------------------------------------
     */

    if (
      cfg.launcherIcon
    ) {

      launcherIcon =
        cfg.launcherIcon;
    }

    /*
     * ----------------------------------------------------------
     * TEASER
     * ----------------------------------------------------------
     */

    if (
      typeof cfg.showTeaser ===
      'boolean'
    ) {

      showTeaser =
        cfg.showTeaser;
    }

    if (
      typeof cfg.launcherText ===
      'string'
    ) {

      launcherText =
        cfg.launcherText;

      teaser.textContent =
        launcherText;
    }

    /*
     * ----------------------------------------------------------
     * APPLY EVERYTHING
     * ----------------------------------------------------------
     */

    launcher.style.backgroundColor =
      launcherColor;

    applyShape();

    applyPosition();

    applyIframePosition();

    renderLauncher();

    updateMobileStyles();

    /*
     * Teaser visibility
     */

    if (
      showTeaser &&
      !isOpen
    ) {

      teaser.style.display =
        'block';

    } else {

      teaser.style.display =
        'none';
    }
  }

  /* ------------------------------------------------------------
   * 17. LOAD BOT DESIGN FROM SERVER
   * ------------------------------------------------------------ */

  function loadBotConfiguration() {

    var apiUrl =
      widgetOrigin +
      '/api/bots/' +
      encodeURIComponent(botId);

    fetch(apiUrl, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store'
    })
      .then(function (response) {

        if (!response.ok) {
          throw new Error(
            'HTTP ' +
            response.status
          );
        }

        return response.json();
      })
      .then(function (data) {

        if (
          !data ||
          !data.success
        ) {

          console.warn(
            '[BotFlow] Bot configuration was not returned.'
          );

          return;
        }

        var bot =
          data.bot || {};

        /*
         * Read designConfig saved by Builder
         */

        var cfg =
          bot.designConfig ||
          {};

        /*
         * Apply the saved custom design
         */

        applyDesignConfig(cfg);

        console.log(
          '[BotFlow] Design loaded.',
          {
            botId: botId,
            color: launcherColor,
            logo: launcherLogo
              ? 'custom logo'
              : 'default icon',
            position: launcherPosition
          }
        );
      })
      .catch(function (error) {

        console.warn(
          '[BotFlow] Could not load bot design configuration.',
          error
        );

        /*
         * Even if API fails, use values supplied
         * directly in the embed code.
         */

        applyDesignConfig({
          accentColor:
            embedColor ||
            '#5B3DF5',

          launcherLogoUrl:
            embedLogo || '',

          launcherPosition:
            embedPosition ||
            'bottom-right'
        });
      });
  }

  /* ------------------------------------------------------------
   * 18. OPEN / CLOSE CHAT
   * ------------------------------------------------------------ */

  var isOpen =
    false;

  function openChat() {

    isOpen =
      true;

    iframe.style.display =
      'block';

    /*
     * Force browser to recognize display change
     * before opacity transition.
     */

    setTimeout(function () {

      iframe.style.opacity =
        '1';

    }, 10);

    launcher.setAttribute(
      'aria-label',
      'Close chat'
    );

    launcher.setAttribute(
      'aria-expanded',
      'true'
    );

    teaser.style.display =
      'none';
  }

  function closeChat() {

    isOpen =
      false;

    iframe.style.opacity =
      '0';

    setTimeout(function () {

      if (!isOpen) {

        iframe.style.display =
          'none';
      }

    }, 200);

    launcher.setAttribute(
      'aria-label',
      'Open chat'
    );

    launcher.setAttribute(
      'aria-expanded',
      'false'
    );

    if (
      showTeaser
    ) {

      teaser.style.display =
        'block';
    }
  }

  launcher.addEventListener(
    'click',
    function () {

      if (isOpen) {

        closeChat();

      } else {

        openChat();
      }
    }
  );

  /* ------------------------------------------------------------
   * 19. HOVER EFFECT
   * ------------------------------------------------------------ */

  launcher.addEventListener(
    'mouseenter',
    function () {

      launcher.style.transform =
        'scale(1.05)';

      launcher.style.boxShadow =
        '0 6px 22px rgba(0,0,0,0.30)';
    }
  );

  launcher.addEventListener(
    'mouseleave',
    function () {

      launcher.style.transform =
        'scale(1)';

      launcher.style.boxShadow =
        '0 4px 18px rgba(0,0,0,0.25)';
    }
  );

  /* ------------------------------------------------------------
   * 20. ESCAPE KEY
   * ------------------------------------------------------------ */

  document.addEventListener(
    'keydown',
    function (event) {

      if (
        event.key ===
        'Escape' &&
        isOpen
      ) {

        closeChat();
      }
    }
  );

  /* ------------------------------------------------------------
   * 21. ADD ELEMENTS TO PAGE
   * ------------------------------------------------------------ */

  document.body.appendChild(
    launcher
  );

  document.body.appendChild(
    iframe
  );

  /* ------------------------------------------------------------
   * 22. INITIAL DESIGN
   * ------------------------------------------------------------ */

  launcher.style.backgroundColor =
    launcherColor;

  renderLauncher();

  applyShape();

  applyPosition();

  applyIframePosition();

  updateMobileStyles();

  /* ------------------------------------------------------------
   * 23. WINDOW RESIZE
   * ------------------------------------------------------------ */

  window.addEventListener(
    'resize',
    function () {

      applyPosition();

      applyIframePosition();

      updateMobileStyles();
    }
  );

  /* ------------------------------------------------------------
   * 24. LOAD SAVED BOT DESIGN
   * ------------------------------------------------------------ */

  loadBotConfiguration();

  /* ------------------------------------------------------------
   * 25. DEBUG INFORMATION
   * ------------------------------------------------------------ */

  console.log(
    '[BotFlow] Widget initialized.',
    {
      botId: botId,
      widgetOrigin: widgetOrigin,
      embedColor: embedColor,
      embedLogo:
        embedLogo
          ? 'provided'
          : 'not provided',
      position:
        embedPosition
    }
  );

})();