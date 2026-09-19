(function () {
  'use strict';

  // Get the current script element
  var script =
    document.currentScript ||
    document.querySelector('script[data-bot-id]');

  if (!script) {
    console.error('Chatbot: widget script not found.');
    return;
  }

  // Read configuration from the embed script
  var botId = script.getAttribute('data-bot-id');
  var color = script.getAttribute('data-color') || '#5B3DF5';
  var position = script.getAttribute('data-position') || 'bottom-right';
  var logo = script.getAttribute('data-logo') || '';

  // Decode values passed through the embed code
  try {
    color = decodeURIComponent(color);
  } catch (e) { }

  try {
    logo = decodeURIComponent(logo);
  } catch (e) { }

  if (!botId) {
    console.error('Chatbot: data-bot-id is missing.');
    return;
  }

  // --------------------------------------------------
  // Launcher Button
  // --------------------------------------------------

  var launcher = document.createElement('button');

  launcher.type = 'button';
  launcher.setAttribute('aria-label', 'Open chat');

  launcher.style.position = 'fixed';
  launcher.style.width = '60px';
  launcher.style.height = '60px';
  launcher.style.border = 'none';
  launcher.style.borderRadius = '50%';
  launcher.style.background = color;
  launcher.style.cursor = 'pointer';
  launcher.style.zIndex = '2147483647';

  launcher.style.display = 'flex';
  launcher.style.alignItems = 'center';
  launcher.style.justifyContent = 'center';

  launcher.style.padding = '0';
  launcher.style.margin = '0';

  launcher.style.boxShadow =
    '0 4px 16px rgba(0,0,0,0.25)';

  // --------------------------------------------------
  // Launcher Position
  // --------------------------------------------------

  if (position === 'bottom-left') {
    launcher.style.left = '20px';
    launcher.style.bottom = '20px';
  } else if (position === 'top-right') {
    launcher.style.right = '20px';
    launcher.style.top = '20px';
  } else if (position === 'top-left') {
    launcher.style.left = '20px';
    launcher.style.top = '20px';
  } else {
    // Default: bottom-right
    launcher.style.right = '20px';
    launcher.style.bottom = '20px';
  }

  // --------------------------------------------------
  // Launcher Logo
  // --------------------------------------------------

  if (logo) {
    var logoImage = document.createElement('img');

    logoImage.src = logo;
    logoImage.alt = 'Chat';

    logoImage.style.width = '34px';
    logoImage.style.height = '34px';

    logoImage.style.objectFit = 'contain';
    logoImage.style.display = 'block';

    launcher.appendChild(logoImage);
  } else {
    // Fallback icon when no logo is uploaded
    var icon = document.createElement('span');

    icon.textContent = '💬';

    icon.style.fontSize = '28px';
    icon.style.lineHeight = '1';

    launcher.appendChild(icon);
  }

  // --------------------------------------------------
  // Add Launcher to Page
  // --------------------------------------------------

  document.body.appendChild(launcher);

  // --------------------------------------------------
  // Chat Iframe
  // --------------------------------------------------

  var iframe = document.createElement('iframe');

  iframe.src =
    window.location.origin +
    '/widget/' +
    encodeURIComponent(botId);

  iframe.title = 'Chatbot';

  iframe.style.position = 'fixed';
  iframe.style.width = '380px';
  iframe.style.height = '650px';
  iframe.style.maxWidth = 'calc(100vw - 30px)';
  iframe.style.maxHeight = 'calc(100vh - 100px)';

  iframe.style.border = 'none';
  iframe.style.borderRadius = '16px';

  iframe.style.background = '#ffffff';

  iframe.style.boxShadow =
    '0 10px 40px rgba(0,0,0,0.20)';

  iframe.style.zIndex = '2147483646';

  iframe.style.display = 'none';

  // --------------------------------------------------
  // Iframe Position
  // --------------------------------------------------

  if (position === 'bottom-left') {
    iframe.style.left = '20px';
    iframe.style.bottom = '90px';
  } else if (position === 'top-right') {
    iframe.style.right = '20px';
    iframe.style.top = '90px';
  } else if (position === 'top-left') {
    iframe.style.left = '20px';
    iframe.style.top = '90px';
  } else {
    iframe.style.right = '20px';
    iframe.style.bottom = '90px';
  }

  document.body.appendChild(iframe);

  // --------------------------------------------------
  // Open / Close Chat
  // --------------------------------------------------

  var isOpen = false;

  launcher.addEventListener('click', function () {
    isOpen = !isOpen;

    iframe.style.display = isOpen
      ? 'block'
      : 'none';

    if (isOpen) {
      launcher.setAttribute(
        'aria-label',
        'Close chat'
      );
    } else {
      launcher.setAttribute(
        'aria-label',
        'Open chat'
      );
    }
  });

  // --------------------------------------------------
  // Mobile Responsive
  // --------------------------------------------------

  function updateMobileStyles() {
    if (window.innerWidth <= 600) {
      iframe.style.width = 'calc(100vw - 20px)';
      iframe.style.height = 'calc(100vh - 90px)';
      iframe.style.maxWidth = 'none';
      iframe.style.maxHeight = 'none';

      launcher.style.width = '56px';
      launcher.style.height = '56px';

      if (position === 'bottom-left') {
        launcher.style.left = '10px';
        launcher.style.bottom = '10px';

        iframe.style.left = '10px';
        iframe.style.bottom = '76px';
      } else if (position === 'top-left') {
        launcher.style.left = '10px';
        launcher.style.top = '10px';

        iframe.style.left = '10px';
        iframe.style.top = '76px';
      } else if (position === 'top-right') {
        launcher.style.right = '10px';
        launcher.style.top = '10px';

        iframe.style.right = '10px';
        iframe.style.top = '76px';
      } else {
        launcher.style.right = '10px';
        launcher.style.bottom = '10px';

        iframe.style.right = '10px';
        iframe.style.bottom = '76px';
      }
    } else {
      iframe.style.width = '380px';
      iframe.style.height = '650px';
      iframe.style.maxWidth = 'calc(100vw - 30px)';
      iframe.style.maxHeight = 'calc(100vh - 100px)';

      launcher.style.width = '60px';
      launcher.style.height = '60px';
    }
  }

  updateMobileStyles();

  window.addEventListener(
    'resize',
    updateMobileStyles
  );
})();