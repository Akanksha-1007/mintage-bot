(function() {
  if (window.BotFlowWidgetLoaded) return;
  window.BotFlowWidgetLoaded = true;

  // Locate current script element
  var scriptTag = document.currentScript || (function() {
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].src && scripts[i].src.indexOf('widget.js') !== -1) {
        return scripts[i];
      }
    }
    return scripts[scripts.length - 1];
  })();

  var customHost = scriptTag ? scriptTag.getAttribute('data-host') : null;
  var baseUrl = customHost || '';

  if (!baseUrl && scriptTag && scriptTag.src) {
    try {
      var urlObj = new URL(scriptTag.src);
      if (urlObj.origin && urlObj.origin.indexOf('file:') === -1) {
        var scriptPath = urlObj.pathname.replace(/\/widget\.js$/, '');
        baseUrl = urlObj.origin + scriptPath;
      }
    } catch (e) {}
  }

  // Ensure iframe loads from public shared app domain rather than private sandbox URL
  if (baseUrl && baseUrl.indexOf('ais-dev-') !== -1) {
    baseUrl = baseUrl.replace('ais-dev-', 'ais-pre-');
  }

  // Handle GitHub Pages subpath auto-correction for mintage-bot
  if (baseUrl && baseUrl.indexOf('akanksha-1007.github.io') !== -1 && baseUrl.indexOf('/mintage-bot') === -1) {
    baseUrl = baseUrl.replace(/\/$/, '') + '/mintage-bot';
  }

  // Fallback to live GitHub Pages app URL if baseUrl is still empty
  var fallbackUrl = 'https://akanksha-1007.github.io/mintage-bot';
  if (!baseUrl) {
    baseUrl = fallbackUrl;
  }

  var botId = (scriptTag && (scriptTag.getAttribute('data-bot-id') || scriptTag.getAttribute('data-id'))) || 'default';
  var position = (scriptTag && scriptTag.getAttribute('data-position')) || 'right'; // 'right' or 'left'
  var primaryColor = (scriptTag && scriptTag.getAttribute('data-color')) || '#4f46e5';
  var mode = (scriptTag && scriptTag.getAttribute('data-mode')) || 'iframe'; // 'iframe' or 'popup'

  var targetUrl = baseUrl + '/widget/' + encodeURIComponent(botId);

  // Container
  var container = document.createElement('div');
  container.id = 'botflow-widget-container';
  var sidePos = position === 'left' ? 'left:20px;' : 'right:20px;';
  container.style.cssText = 'position:fixed; bottom:20px; ' + sidePos + ' z-index:2147483647; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;';

  // Floating Toggle Button
  var button = document.createElement('button');
  button.id = 'botflow-widget-button';
  button.setAttribute('aria-label', 'Toggle Chat');
  button.style.cssText = 'width:56px; height:56px; border-radius:28px; background:' + primaryColor + '; border:none; color:white; cursor:pointer; box-shadow:0 6px 20px rgba(0,0,0,0.25); transition:transform 0.2s; display:flex; align-items:center; justify-content:center; padding:0; margin:0; outline:none; -webkit-tap-highlight-color:transparent;';
  
  var chatIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
  var closeIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

  button.innerHTML = chatIcon;
  button.onmouseover = function() { button.style.transform = 'scale(1.08)'; };
  button.onmouseout = function() { button.style.transform = 'scale(1)'; };

  if (mode === 'popup') {
    button.onclick = function(e) {
      if (e) e.preventDefault();
      var left = Math.max(0, (window.screen.width || 1200) - 440);
      var top = 100;
      window.open(targetUrl, 'BotFlowChat_' + botId, 'width=420,height=680,left=' + left + ',top=' + top + ',resizable=yes,scrollbars=yes');
    };
    container.appendChild(button);
  } else {
    // Wrapper for Iframe + Floating Action Bar
    var wrapper = document.createElement('div');
    wrapper.id = 'botflow-widget-wrapper';
    var iframeSide = position === 'left' ? 'left:0;' : 'right:0;';
    wrapper.style.cssText = 'display:none; position:absolute; bottom:72px; ' + iframeSide + ' width:380px; height:620px; max-width:calc(100vw - 32px); max-height:calc(100vh - 96px); border-radius:18px; box-shadow:0 12px 40px rgba(0,0,0,0.22); background:white; overflow:hidden; transition: opacity 0.25s ease, transform 0.25s ease; opacity:0; transform:translateY(12px); z-index:2147483647;';

    // Iframe
    var iframe = document.createElement('iframe');
    iframe.id = 'botflow-widget-iframe';
    iframe.src = targetUrl;
    iframe.title = 'Chatbot';
    iframe.setAttribute('allow', 'autoplay; camera; microphone');
    iframe.style.cssText = 'width:100%; height:100%; border:none; background:white; color-scheme: normal;';

    wrapper.appendChild(iframe);

    var isOpen = false;
    button.onclick = function(e) {
      if (e) e.preventDefault();
      isOpen = !isOpen;
      if (isOpen) {
        wrapper.style.display = 'block';
        setTimeout(function() {
          wrapper.style.opacity = '1';
          wrapper.style.transform = 'translateY(0)';
        }, 10);
        button.innerHTML = closeIcon;
      } else {
        wrapper.style.opacity = '0';
        wrapper.style.transform = 'translateY(12px)';
        setTimeout(function() {
          wrapper.style.display = 'none';
        }, 250);
        button.innerHTML = chatIcon;
      }
    };

    container.appendChild(wrapper);
    container.appendChild(button);
  }

  function mountWidget() {
    if (document.body && !document.getElementById('botflow-widget-container')) {
      document.body.appendChild(container);
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    mountWidget();
  } else {
    window.addEventListener('DOMContentLoaded', mountWidget);
    window.addEventListener('load', mountWidget);
  }
})();

