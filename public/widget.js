(function () {
  'use strict';

  // ============================================================
  // PREVENT DOUBLE INITIALIZATION
  // ============================================================

  if (window.BotFlowWidgetLoaded) {
    return;
  }

  window.BotFlowWidgetLoaded = true;

  // ============================================================
  // FIND CURRENT SCRIPT
  // ============================================================

  var scriptTag =
    document.currentScript ||
    (function () {
      var scripts =
        document.getElementsByTagName('script');

      for (var i = scripts.length - 1; i >= 0; i--) {
        if (
          scripts[i].src &&
          scripts[i].src.indexOf('widget.js') !== -1
        ) {
          return scripts[i];
        }
      }

      return scripts[scripts.length - 1];
    })();

  if (!scriptTag) {
    console.error(
      'BotFlow Widget: widget.js script was not found.'
    );
    return;
  }

  // ============================================================
  // BASE URL
  // ============================================================

  var customHost =
    scriptTag.getAttribute('data-host');

  var baseUrl =
    customHost || '';

  if (
    !baseUrl &&
    scriptTag.src
  ) {
    try {
      var urlObj =
        new URL(scriptTag.src);

      if (
        urlObj.origin &&
        urlObj.origin.indexOf('file:') === -1
      ) {
        var scriptPath =
          urlObj.pathname.replace(
            /\/widget\.js$/,
            ''
          );

        baseUrl =
          urlObj.origin +
          scriptPath;
      }
    } catch (e) {
      console.warn(
        'BotFlow Widget: unable to determine script URL.'
      );
    }
  }

  // ============================================================
  // ENVIRONMENT CORRECTION
  // ============================================================

  if (
    baseUrl &&
    baseUrl.indexOf('ais-dev-') !== -1
  ) {
    baseUrl =
      baseUrl.replace(
        'ais-dev-',
        'ais-pre-'
      );
  }

  // ============================================================
  // GITHUB PAGES CORRECTION
  // ============================================================

  if (
    baseUrl &&
    baseUrl.indexOf(
      'akanksha-1007.github.io'
    ) !== -1 &&
    baseUrl.indexOf(
      '/mintage-bot'
    ) === -1
  ) {
    baseUrl =
      baseUrl.replace(
        /\/$/,
        ''
      ) +
      '/mintage-bot';
  }

  // ============================================================
  // FALLBACK
  // ============================================================

  if (
    !baseUrl ||
    baseUrl.indexOf('file:') !== -1
  ) {
    baseUrl =
      window.location.origin;
  }

  // Remove trailing slash
  baseUrl =
    baseUrl.replace(/\/$/, '');

  // ============================================================
  // BOT ID
  // ============================================================

  var botId =
    scriptTag.getAttribute(
      'data-bot-id'
    ) ||
    scriptTag.getAttribute(
      'data-id'
    ) ||
    '';

  botId =
    String(botId).trim();

  // ============================================================
  // POSITION
  // ============================================================

  var position =
    scriptTag.getAttribute(
      'data-position'
    ) || 'right';

  // ============================================================
  // EMBED COLOR
  // ============================================================

  var rawColor =
    scriptTag.getAttribute(
      'data-color'
    ) || '#5B3DF5';

  var initialColor =
    rawColor;

  try {
    initialColor =
      decodeURIComponent(
        rawColor
      );
  } catch (e) { }

  // ============================================================
  // EXISTING ICON
  // ============================================================

  var rawIcon =
    scriptTag.getAttribute(
      'data-icon'
    ) ||
    scriptTag.getAttribute(
      'data-launcher-icon'
    ) ||
    null;

  // ============================================================
  // NEW: LAUNCHER LOGO
  // ============================================================

  var rawLogo =
    scriptTag.getAttribute(
      'data-logo'
    ) || '';

  var launcherLogoUrl =
    rawLogo;

  if (
    launcherLogoUrl
  ) {
    try {
      launcherLogoUrl =
        decodeURIComponent(
          launcherLogoUrl
        );
    } catch (e) { }
  }

  // ============================================================
  // MODE
  // ============================================================

  var mode =
    scriptTag.getAttribute(
      'data-mode'
    ) || 'iframe';

  // ============================================================
  // DEBUG INFORMATION
  // ============================================================

  console.log(
    '[BotFlow] Bot ID:',
    botId
  );

  console.log(
    '[BotFlow] Base URL:',
    baseUrl
  );

  console.log(
    '[BotFlow] Initial launcher color:',
    initialColor
  );

  console.log(
    '[BotFlow] Launcher logo:',
    launcherLogoUrl
      ? 'Loaded'
      : 'None'
  );

  // ============================================================
  // STOP IF BOT ID IS MISSING
  // ============================================================

  if (
    !botId ||
    botId === 'SAVE_FIRST' ||
    botId === 'default'
  ) {
    console.error(
      '[BotFlow] Missing or invalid bot ID.'
    );

    return;
  }

  // ============================================================
  // TARGET WIDGET URL
  // ============================================================

  var iconParam =
    rawIcon
      ? '&icon=' +
      encodeURIComponent(
        rawIcon
      )
      : '';

  var targetUrl =
    baseUrl +
    '/widget/' +
    encodeURIComponent(
      botId
    ) +
    '?color=' +
    encodeURIComponent(
      initialColor
    ) +
    iconParam;

  console.log(
    '[BotFlow] Widget URL:',
    targetUrl
  );

  // ============================================================
  // ICONS
  // ============================================================

  var icons = {

    chat:
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>' +
      '</svg>',

    bot:
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="3" y="11" width="18" height="10" rx="2"></rect>' +
      '<circle cx="12" cy="5" r="2"></circle>' +
      '<path d="M12 7v4"></path>' +
      '<line x1="8" y1="16" x2="8.01" y2="16"></line>' +
      '<line x1="16" y1="16" x2="16.01" y2="16"></line>' +
      '</svg>',

    sparkles:
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3z"></path>' +
      '</svg>',

    message:
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect width="20" height="16" x="2" y="4" rx="2"></rect>' +
      '<path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>' +
      '</svg>',

    help:
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="10"></circle>' +
      '<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>' +
      '<path d="M12 17h.01"></path>' +
      '</svg>',

    close:
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="18" y1="6" x2="6" y2="18"></line>' +
      '<line x1="6" y1="6" x2="18" y2="18"></line>' +
      '</svg>'
  };

  var currentIcon =
    rawIcon &&
      icons[rawIcon]
      ? icons[rawIcon]
      : icons.chat;

  // ============================================================
  // CONTAINER
  // ============================================================

  var container =
    document.createElement(
      'div'
    );

  container.id =
    'botflow-widget-container';

  container.style.cssText =
    'position:fixed;' +
    'bottom:20px;' +
    (
      position === 'left'
        ? 'left:20px;'
        : 'right:20px;'
    ) +
    'z-index:2147483647;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
    'display:flex;' +
    'flex-direction:column;' +
    'align-items:' +
    (
      position === 'left'
        ? 'flex-start'
        : 'flex-end'
    ) +
    ';' +
    'gap:10px;';

  // ============================================================
  // TEASER
  // ============================================================

  var teaser =
    document.createElement(
      'div'
    );

  teaser.id =
    'botflow-widget-teaser';

  teaser.style.cssText =
    'display:none;' +
    'background:white;' +
    'color:#1e293b;' +
    'padding:8px 14px;' +
    'border-radius:14px;' +
    'box-shadow:0 8px 24px rgba(0,0,0,0.15);' +
    'font-size:13px;' +
    'font-weight:600;' +
    'cursor:pointer;' +
    'border:1px solid rgba(0,0,0,0.08);' +
    'white-space:nowrap;';

  teaser.innerHTML =
    'Chat with us! 👋';

  container.appendChild(
    teaser
  );

  // ============================================================
  // LAUNCHER BUTTON
  // ============================================================

  var button =
    document.createElement(
      'button'
    );

  button.type =
    'button';

  button.id =
    'botflow-widget-button';

  button.setAttribute(
    'aria-label',
    'Open chat'
  );

  button.style.cssText =
    'width:56px;' +
    'height:56px;' +
    'border-radius:28px;' +
    'background:' +
    initialColor +
    ';' +
    'border:none;' +
    'color:white;' +
    'cursor:pointer;' +
    'box-shadow:0 6px 20px rgba(0,0,0,0.25);' +
    'transition:transform .2s,background-color .2s,border-radius .2s;' +
    'display:flex;' +
    'align-items:center;' +
    'justify-content:center;' +
    'padding:0;' +
    'margin:0;' +
    'outline:none;' +
    'overflow:hidden;' +
    '-webkit-tap-highlight-color:transparent;';

  // ============================================================
  // OPEN STATE
  // ============================================================

  var isOpen =
    false;

  // ============================================================
  // RENDER LAUNCHER
  // ============================================================

  function renderLauncher() {

    button.innerHTML =
      '';

    if (isOpen) {

      button.innerHTML =
        icons.close;

      button.setAttribute(
        'aria-label',
        'Close chat'
      );

      return;
    }

    // ----------------------------------------------------------
    // CUSTOM LOGO
    // ----------------------------------------------------------

    if (
      launcherLogoUrl &&
      launcherLogoUrl.trim() !== ''
    ) {

      var logoImage =
        document.createElement(
          'img'
        );

      logoImage.src =
        launcherLogoUrl;

      logoImage.alt =
        'Chat';

      logoImage.style.width =
        '36px';

      logoImage.style.height =
        '36px';

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

          launcherLogoUrl =
            '';

          renderLauncher();
        };

      button.appendChild(
        logoImage
      );

    } else {

      // --------------------------------------------------------
      // FALLBACK ICON
      // --------------------------------------------------------

      button.innerHTML =
        currentIcon;
    }

    button.setAttribute(
      'aria-label',
      'Open chat'
    );
  }

  renderLauncher();

  // ============================================================
  // HOVER
  // ============================================================

  button.onmouseover =
    function () {
      button.style.transform =
        'scale(1.08)';
    };

  button.onmouseout =
    function () {
      button.style.transform =
        'scale(1)';
    };

  // ============================================================
  // APPLY DESIGN CONFIG
  // ============================================================

  function applyDesignConfig(
    cfg
  ) {

    if (!cfg) {
      return;
    }

    console.log(
      '[BotFlow] Applying design configuration:',
      cfg
    );

    // ----------------------------------------------------------
    // LAUNCHER COLOR
    // ----------------------------------------------------------

    if (
      cfg.accentColor
    ) {

      button.style.backgroundColor =
        cfg.accentColor;

      console.log(
        '[BotFlow] Launcher color:',
        cfg.accentColor
      );
    }

    // ----------------------------------------------------------
    // LAUNCHER ICON
    // ----------------------------------------------------------

    if (
      cfg.launcherIcon &&
      icons[cfg.launcherIcon]
    ) {

      currentIcon =
        icons[
        cfg.launcherIcon
        ];
    }

    // ----------------------------------------------------------
    // LAUNCHER LOGO
    // ----------------------------------------------------------

    if (
      typeof cfg.launcherLogoUrl ===
      'string'
    ) {

      launcherLogoUrl =
        cfg.launcherLogoUrl.trim();

      console.log(
        '[BotFlow] Launcher logo:',
        launcherLogoUrl
          ? 'Available'
          : 'None'
      );
    }

    // ----------------------------------------------------------
    // SHAPE
    // ----------------------------------------------------------

    if (
      cfg.launcherShape ===
      'pill'
    ) {

      button.style.borderRadius =
        '18px';

      button.style.width =
        '70px';

    } else if (
      cfg.launcherShape ===
      'rounded'
    ) {

      button.style.borderRadius =
        '16px';

      button.style.width =
        '56px';

    } else {

      button.style.borderRadius =
        '50%';

      button.style.width =
        '56px';
    }

    // ----------------------------------------------------------
    // POSITION
    // ----------------------------------------------------------

    if (
      cfg.launcherPosition
    ) {

      var isLeft =
        cfg.launcherPosition ===
        'bottom-left';

      container.style.left =
        isLeft
          ? '20px'
          : 'auto';

      container.style.right =
        isLeft
          ? 'auto'
          : '20px';

      container.style.alignItems =
        isLeft
          ? 'flex-start'
          : 'flex-end';
    }

    // ----------------------------------------------------------
    // TEASER
    // ----------------------------------------------------------

    if (
      cfg.showTeaser &&
      cfg.launcherText
    ) {

      teaser.innerHTML =
        cfg.launcherText;

      teaser.style.display =
        isOpen
          ? 'none'
          : 'block';

    } else {

      teaser.style.display =
        'none';
    }

    // ----------------------------------------------------------
    // RENDER UPDATED LOGO / ICON
    // ----------------------------------------------------------

    if (!isOpen) {
      renderLauncher();
    }
  }

  // ============================================================
  // LOAD DESIGN CONFIGURATION FROM SERVER
  // ============================================================

  function loadDesignConfig() {

    if (
      !botId ||
      botId === 'default' ||
      botId === 'SAVE_FIRST'
    ) {
      return;
    }

    var apiUrl =
      baseUrl +
      '/api/bots/' +
      encodeURIComponent(
        botId
      );

    console.log(
      '[BotFlow] Loading design:',
      apiUrl
    );

    fetch(
      apiUrl,
      {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store'
      }
    )
      .then(
        function (response) {

          if (!response.ok) {
            throw new Error(
              'HTTP ' +
              response.status
            );
          }

          return response.json();
        }
      )
      .then(
        function (data) {

          console.log(
            '[BotFlow] Design API response:',
            data
          );

          if (
            data &&
            data.success &&
            data.bot &&
            data.bot.designConfig
          ) {

            applyDesignConfig(
              data.bot.designConfig
            );

          } else {

            console.warn(
              '[BotFlow] No designConfig returned for bot:',
              botId
            );
          }
        }
      )
      .catch(
        function (error) {

          console.error(
            '[BotFlow] Failed to load design configuration:',
            error
          );
        }
      );
  }

  // ============================================================
  // REAL-TIME DESIGN UPDATE
  // ============================================================

  window.addEventListener(
    'message',
    function (event) {

      if (
        !event.data
      ) {
        return;
      }

      if (
        event.data.type ===
        'MINTAGE_BOT_DESIGN_UPDATE'
      ) {

        applyDesignConfig(
          event.data.designConfig
        );
      }
    }
  );

  // ============================================================
  // IFRAME
  // ============================================================

  var wrapper =
    document.createElement(
      'div'
    );

  wrapper.id =
    'botflow-widget-wrapper';

  wrapper.style.cssText =
    'display:none;' +
    'position:absolute;' +
    'bottom:72px;' +
    (
      position === 'left'
        ? 'left:0;'
        : 'right:0;'
    ) +
    'width:380px;' +
    'height:620px;' +
    'max-width:calc(100vw - 32px);' +
    'max-height:calc(100vh - 96px);' +
    'border-radius:18px;' +
    'box-shadow:0 12px 40px rgba(0,0,0,.22);' +
    'background:#fff;' +
    'overflow:hidden;' +
    'opacity:0;' +
    'transform:translateY(12px);' +
    'transition:opacity .25s ease,transform .25s ease;' +
    'z-index:2147483647;';

  var iframe =
    document.createElement(
      'iframe'
    );

  iframe.id =
    'botflow-widget-iframe';

  iframe.src =
    targetUrl;

  iframe.title =
    'Chatbot';

  iframe.setAttribute(
    'allow',
    'autoplay; camera; microphone'
  );

  iframe.style.cssText =
    'width:100%;' +
    'height:100%;' +
    'border:none;' +
    'background:#fff;' +
    'color-scheme:normal;';

  wrapper.appendChild(
    iframe
  );

  // ============================================================
  // TOGGLE CHAT
  // ============================================================

  function toggleChat(
    event
  ) {

    if (event) {
      event.preventDefault();
    }

    isOpen =
      !isOpen;

    if (isOpen) {

      wrapper.style.display =
        'block';

      teaser.style.display =
        'none';

      setTimeout(
        function () {

          wrapper.style.opacity =
            '1';

          wrapper.style.transform =
            'translateY(0)';
        },
        10
      );

      renderLauncher();

    } else {

      wrapper.style.opacity =
        '0';

      wrapper.style.transform =
        'translateY(12px)';

      setTimeout(
        function () {

          wrapper.style.display =
            'none';

        },
        250
      );

      renderLauncher();
    }
  }

  button.onclick =
    toggleChat;

  teaser.onclick =
    toggleChat;

  // ============================================================
  // POPUP MODE
  // ============================================================

  if (
    mode === 'popup'
  ) {

    button.onclick =
      function (event) {

        if (event) {
          event.preventDefault();
        }

        var left =
          Math.max(
            0,
            (
              window.screen.width ||
              1200
            ) - 440
          );

        window.open(
          targetUrl,
          'BotFlowChat_' +
          botId,
          'width=420,height=680,left=' +
          left +
          ',top=100,resizable=yes,scrollbars=yes'
        );
      };

    container.appendChild(
      button
    );

  } else {

    container.appendChild(
      wrapper
    );

    container.appendChild(
      button
    );
  }

  // ============================================================
  // MOBILE RESPONSIVE
  // ============================================================

  function updateMobile() {

    if (
      window.innerWidth <=
      600
    ) {

      wrapper.style.width =
        'calc(100vw - 20px)';

      wrapper.style.height =
        'calc(100vh - 90px)';

      wrapper.style.maxWidth =
        'none';

      wrapper.style.maxHeight =
        'none';

      container.style.bottom =
        '10px';

      if (
        position ===
        'left'
      ) {

        container.style.left =
          '10px';

        container.style.right =
          'auto';

      } else {

        container.style.right =
          '10px';

        container.style.left =
          'auto';
      }

      button.style.width =
        '56px';

      button.style.height =
        '56px';

    } else {

      wrapper.style.width =
        '380px';

      wrapper.style.height =
        '620px';

      wrapper.style.maxWidth =
        'calc(100vw - 32px)';

      wrapper.style.maxHeight =
        'calc(100vh - 96px)';

      container.style.bottom =
        '20px';

      if (
        position ===
        'left'
      ) {

        container.style.left =
          '20px';

        container.style.right =
          'auto';

      } else {

        container.style.right =
          '20px';

        container.style.left =
          'auto';
      }
    }
  }

  updateMobile();

  window.addEventListener(
    'resize',
    updateMobile
  );

  // ============================================================
  // MOUNT
  // ============================================================

  function mountWidget() {

    if (
      document.body &&
      !document.getElementById(
        'botflow-widget-container'
      )
    ) {

      document.body.appendChild(
        container
      );
    }
  }

  if (
    document.readyState ===
    'interactive' ||
    document.readyState ===
    'complete'
  ) {

    mountWidget();

  } else {

    document.addEventListener(
      'DOMContentLoaded',
      mountWidget
    );

    window.addEventListener(
      'load',
      mountWidget
    );
  }

  // ============================================================
  // LOAD SAVED DESIGN
  // ============================================================

  loadDesignConfig();

})();