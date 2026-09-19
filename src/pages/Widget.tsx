import React from 'react';
import { useParams, useLocation } from 'react-router-dom';
import ChatWidget from '../components/ChatWidget';

const Widget: React.FC = () => {
  const params = useParams<{
    botId?: string;
    id?: string;
  }>();

  const location = useLocation();

  // ============================================================
  // GET BOT ID
  // ============================================================

  let botId = '';

  // ------------------------------------------------------------
  // 1. React Router parameter
  // Supports:
  // /widget/12345
  // /widget/abc123
  // ------------------------------------------------------------

  if (params.botId) {
    botId = params.botId;
  }

  if (!botId && params.id) {
    botId = params.id;
  }

  // ------------------------------------------------------------
  // 2. Query string fallback
  //
  // /widget?botId=12345
  // /widget?id=12345
  // ------------------------------------------------------------

  if (!botId) {
    const searchParams = new URLSearchParams(
      location.search
    );

    const queryBotId =
      searchParams.get('botId') ||
      searchParams.get('id') ||
      searchParams.get('bot');

    if (queryBotId) {
      botId = queryBotId;
    }
  }

  // ------------------------------------------------------------
  // 3. Direct pathname fallback
  //
  // /widget/12345
  // ------------------------------------------------------------

  if (!botId) {
    const pathname =
      window.location.pathname || '';

    const widgetMatch = pathname.match(
      /\/widget\/([^/?#]+)/
    );

    if (
      widgetMatch &&
      widgetMatch[1]
    ) {
      try {
        botId = decodeURIComponent(
          widgetMatch[1]
        );
      } catch {
        botId = widgetMatch[1];
      }
    }
  }

  // ------------------------------------------------------------
  // 4. Remove accidental whitespace
  // ------------------------------------------------------------

  botId = String(botId || '').trim();

  // ------------------------------------------------------------
  // DEBUG
  // ------------------------------------------------------------

  console.log(
    '[WIDGET] Current URL:',
    window.location.href
  );

  console.log(
    '[WIDGET] Path:',
    window.location.pathname
  );

  console.log(
    '[WIDGET] Search:',
    window.location.search
  );

  console.log(
    '[WIDGET] Bot ID:',
    botId
  );

  // ============================================================
  // NO BOT ID
  // ============================================================

  if (!botId) {
    return (
      <div
        style={{
          width: '100%',
          height: '100vh',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          boxSizing: 'border-box',
          backgroundColor: '#ffffff',
          color: '#111827',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '420px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              margin: '0 auto 20px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#f3f4f6',
              fontSize: '28px',
            }}
          >
            💬
          </div>

          <h1
            style={{
              margin: '0 0 10px',
              fontSize: '22px',
              lineHeight: '30px',
              fontWeight: 700,
              color: '#111827',
            }}
          >
            Chatbot unavailable
          </h1>

          <p
            style={{
              margin: '0 0 16px',
              fontSize: '14px',
              lineHeight: '22px',
              color: '#6b7280',
            }}
          >
            No chatbot ID was provided.
          </p>

          <p
            style={{
              margin: 0,
              fontSize: '12px',
              lineHeight: '18px',
              color: '#9ca3af',
              wordBreak: 'break-word',
            }}
          >
            Please check the chatbot embed configuration.
          </p>
        </div>
      </div>
    );
  }

  // ============================================================
  // CHATBOT
  // ============================================================

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        minHeight: '100vh',
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        backgroundColor: '#ffffff',
      }}
    >
      <ChatWidget botId={botId} />
    </div>
  );
};

export default Widget;