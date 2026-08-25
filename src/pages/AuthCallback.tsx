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
    <div className="centered-status">
      <h2>Authentication successful</h2>
      <p>Redirecting you back to the dashboard…</p>
    </div>
  );
}
