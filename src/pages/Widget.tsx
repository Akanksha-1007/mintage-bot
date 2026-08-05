import React from 'react';
import { useParams } from 'react-router-dom';
import ChatWidget from '../components/ChatWidget';

export default function Widget() {
  const { id } = useParams();

  if (!id) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-900">Invalid Bot ID</h1>
          <p className="text-gray-500 mt-2">Please provide a valid bot configuration ID.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-transparent overflow-hidden">
      <ChatWidget botId={id} />
    </div>
  );
}
