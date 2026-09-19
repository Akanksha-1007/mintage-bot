import React from 'react';
import { useParams } from 'react-router-dom';
import ChatWidget from '../components/ChatWidget';

const Widget: React.FC = () => {
  const { botId } = useParams<{ botId: string }>();

  // --------------------------------------------------
  // Missing Bot ID
  // --------------------------------------------------

  if (!botId) {
    return (
      <div
        style={{
          minHeight: '100vh',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          boxSizing: 'border-box',
          backgroundColor: '#ffffff',
          color: '#1f2937',
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
              margin: 0,
              fontSize: '14px',
              lineHeight: '22px',
              color: '#6b7280',
            }}
          >
            No chatbot ID was provided.
          </p>
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // Chatbot
  // --------------------------------------------------

  return <ChatWidget botId={botId} />;
};

export default Widget;