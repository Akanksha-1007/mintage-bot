(function () {
  'use strict';

  var script = document.currentScript;

  if (!script) {
    return;
  }

  var botId = script.getAttribute('data-bot-id') || '';

  if (!botId) {
    return;
  }

  /*
   * Default values
   */
  var color = '#5B3DF5';
  var position = 'right';
  var logo = '';

  /*
   * Base URL
   *
   * Example:
   * https://chatbot.mintagemarkcomm.com/widget.js
   *
   * becomes:
   * https://chatbot.mintagemarkcomm.com
   */
  var baseUrl = script.src.split('/widget.js')[0];

  /*
   * Chat iframe URL
   */
  var iframeUrl =
    baseUrl +
    '/widget/' +
    encodeURIComponent(botId);

  /*
   * Main widget container
   */
  var container = document.createElement('div');

  container.id =
    'botflow-widget-container-' + botId;

  container.style.cssText = [
    'position:fixed',
    'bottom:20px',
    'right:20px',
    'z-index:2147483647',
    'font-family:Arial,sans-serif',
    'filter:none',
    '-webkit-filter:none',
    'mix-blend-mode:normal'
  ].join(';');

  /*
   * Launcher button
   */
  var button = document.createElement('button');

  button.type = 'button';

  button.setAttribute(
    'aria-label',
    'Open chat'
  );

  button.style.cssText = [
    'width:60px',
    'height:60px',
    'border-radius:50%',
    'background:' + color,
    'border:none',
    'color:#fff',
    'cursor:pointer',
    'box-shadow:0 4px 15px rgba(0,0,0,.18)',
    'transition:transform .2s ease,box-shadow .2s ease',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'padding:0',
    'margin:0',
    'outline:none',
    'overflow:hidden',
    'filter:none',
    '-webkit-filter:none',
    'mix-blend-mode:normal'
  ].join(';');

  /*
   * Chat iframe
   */
  var iframe = document.createElement('iframe');

  iframe.title = 'Chat';

  iframe.src = iframeUrl;

  iframe.setAttribute(
    'allow',
    'clipboard-write'
  );

  iframe.style.cssText = [
    'display:none',
    'position:absolute',
    'bottom:80px',
    'right:0',
    'width:400px',
    'height:600px',
    'border:none',
    'border-radius:20px',
    'box-shadow:0 10px 40px rgba(0,0,0,.15)',
    'background:#fff',
    'opacity:0',
    'transition:opacity .25s ease',
    'z-index:2147483647',
    'filter:none',
    '-webkit-filter:none',
    'mix-blend-mode:normal'
  ].join(';');

  /*
   * Mobile iframe sizing
   */
  function applyMobileSize() {
    if (window.innerWidth < 480) {
      iframe.style.width =
        'calc(100vw - 40px)';

      iframe.style.height =
        'calc(100vh - 120px)';

      iframe.style.bottom =
        '80px';

      iframe.style.right =
        position === 'right'
          ? '0'
          : 'auto';

      iframe.style.left =
        position === 'left'
          ? '0'
          : 'auto';
    } else {
      iframe.style.width = '400px';
      iframe.style.height = '600px';

      iframe.style.bottom = '80px';

      iframe.style.right =
        position === 'right'
          ? '0'
          : 'auto';

      iframe.style.left =
        position === 'left'
          ? '0'
          : 'auto';
    }
  }

  /*
   * Open / close state
   */
  var isOpen = false;

  /*
   * Set launcher logo / icon
   *
   * IMPORTANT:
   * No grayscale filter is applied.
   * Uploaded logos remain in their original colors.
   */
  function setLauncherContent(open) {
    button.innerHTML = '';

    /*
     * When chatbot is open
     */
    if (open) {
      button.textContent = '×';

      button.style.fontSize = '30px';
      button.style.lineHeight = '1';
      button.style.fontWeight = '300';

      button.style.filter = 'none';
      button.style.webkitFilter = 'none';

      return;
    }

    /*
     * Custom uploaded logo
     */
    if (logo) {
      var img = document.createElement('img');

      img.src = logo;

      img.alt = 'Chat';

      /*
       * Preserve ORIGINAL logo colors.
       */
      img.style.cssText = [
        'width:34px',
        'height:34px',
        'object-fit:contain',
        'object-position:center',
        'border-radius:8px',
        'background:transparent',
        'padding:0',
        'margin:0',
        'display:block',
        'filter:none',
        '-webkit-filter:none',
        'mix-blend-mode:normal',
        'color-scheme:normal'
      ].join(';');

      /*
       * If logo fails to load,
       * use chat icon.
       */
      img.onerror = function () {
        button.innerHTML = '💬';

        button.style.fontSize = '24px';

        button.style.filter = 'none';
        button.style.webkitFilter = 'none';
      };

      button.appendChild(img);

      return;
    }

    /*
     * Default chat icon
     */
    button.textContent = '💬';

    button.style.fontSize = '24px';

    button.style.filter = 'none';
    button.style.webkitFilter = 'none';
  }

  /*
   * Update launcher position
   */
  function applyPosition() {
    /*
     * Container
     */
    container.style.left = '';
    container.style.right = '';

    if (position === 'left') {
      container.style.left = '20px';
    } else {
      container.style.right = '20px';
    }

    /*
     * Iframe
     */
    iframe.style.left = '';
    iframe.style.right = '';

    if (position === 'left') {
      iframe.style.left = '0';
    } else {
      iframe.style.right = '0';
    }

    applyMobileSize();
  }

  /*
   * Load bot design configuration
   *
   * The embed code itself stays very small:
   *
   * <script
   *   src=".../widget.js"
   *   data-bot-id="..."
   * ></script>
   *
   * Design information is fetched from the bot.
   */
  function loadBotLauncherConfig() {
    var endpoint =
      baseUrl +
      '/api/bots/' +
      encodeURIComponent(botId);

    fetch(endpoint, {
      method: 'GET',
      credentials: 'omit',
      headers: {
        'Accept': 'application/json'
      }
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error(
            'Bot config request failed'
          );
        }

        return response.json();
      })
      .then(function (payload) {
        var bot =
          payload &&
            payload.bot
            ? payload.bot
            : null;

        if (!bot) {
          return;
        }

        var config =
          bot.designConfig
            ? bot.designConfig
            : null;

        if (!config) {
          return;
        }

        /*
         * Custom launcher color
         */
        if (
          config.accentColor &&
          typeof config.accentColor === 'string'
        ) {
          color =
            config.accentColor;

          button.style.background =
            color;
        }

        /*
         * Custom launcher position
         */
        if (config.launcherPosition) {
          position =
            config.launcherPosition ===
              'bottom-left'
              ? 'left'
              : 'right';

          applyPosition();
        }

        /*
         * Custom launcher logo
         *
         * IMPORTANT:
         * We use the URL/data URI exactly as saved.
         * No color conversion is performed.
         */
        if (
          config.launcherLogoUrl &&
          typeof config.launcherLogoUrl === 'string'
        ) {
          logo =
            config.launcherLogoUrl;
        }

        /*
         * Update launcher
         */
        setLauncherContent(isOpen);
      })
      .catch(function () {
        /*
         * Keep default launcher if
         * configuration cannot be loaded.
         */
      });
  }

  /*
   * Initial launcher
   */
  setLauncherContent(false);

  /*
   * Initial position
   */
  applyPosition();

  /*
   * Hover effect
   */
  button.onmouseover = function () {
    button.style.transform =
      'scale(1.08)';
  };

  button.onmouseout = function () {
    button.style.transform =
      'scale(1)';
  };

  /*
   * Click launcher
   */
  button.onclick = function () {
    isOpen = !isOpen;

    /*
     * Open
     */
    if (isOpen) {
      iframe.style.display =
        'block';

      setTimeout(function () {
        iframe.style.opacity =
          '1';
      }, 10);

      setLauncherContent(true);

      return;
    }

    /*
     * Close
     */
    iframe.style.opacity =
      '0';

    setTimeout(function () {
      if (!isOpen) {
        iframe.style.display =
          'none';
      }
    }, 250);

    setLauncherContent(false);
  };

  /*
   * Recalculate mobile size
   * when browser is resized.
   */
  window.addEventListener(
    'resize',
    function () {
      applyMobileSize();
    }
  );

  /*
   * Add elements
   */
  container.appendChild(iframe);

  container.appendChild(button);

  document.body.appendChild(container);

  /*
   * Load saved bot design
   */
  loadBotLauncherConfig();

})();