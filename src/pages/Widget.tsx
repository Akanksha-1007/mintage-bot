import React from 'react';
import { useParams } from 'react-router-dom';
import ChatWidget from '../components/ChatWidget';

export default function Widget() {
  const { id } = useParams();

  if (!id) {
    return (
      <div className="centered-status">
        <h1>Invalid bot ID</h1>
        <p>Provide a valid bot configuration ID to load this chatbot.</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-transparent overflow-hidden">
      <ChatWidget botId={id} />
    </div>
  );
}