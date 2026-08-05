import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    // This page is usually only seen if the OAuth popup doesn't close automatically
    // or if the user navigates here manually.
    const timer = setTimeout(() => {
      navigate('/dashboard');
    }, 2000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-900">Authentication Successful</h2>
        <p className="text-gray-500 mt-2">Redirecting you back to the dashboard...</p>
      </div>
    </div>
  );
}
