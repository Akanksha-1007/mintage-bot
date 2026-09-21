import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import MintageLogo from '../components/MintageLogo';
import ThemeToggle from '../components/ThemeToggle';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const getErrorMessage = (code: string) => {
    switch (code) {
      case 'auth/invalid-email': return 'Please enter a valid email address.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential': return 'Invalid email or password. Please try again.';
      case 'auth/too-many-requests': return 'Too many failed attempts. Please try again later.';
      case 'auth/operation-not-allowed': return 'Email/password authentication is not enabled in Firebase.';
      default: return 'Unable to sign in. Please check your credentials and try again.';
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.toLowerCase().trim(), password);
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(getErrorMessage(err?.code || 'auth/invalid-credential'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <ThemeToggle className="login-theme-toggle" />
      <main className="login-auth-side">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="login-auth-card">
          <div className="login-mobile-logo"><MintageLogo size="xl" /></div>
          <h1>Welcome back</h1>
          <p className="login-intro">Sign in to continue to your chatbot workspace.</p>

          <form className="login-form" onSubmit={handleAuth}>
            <div className="login-field">
              <label htmlFor="email">Email address</label>
              <input id="email" type="email" required disabled={isLoading} placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="login-field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" required disabled={isLoading} placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            <AnimatePresence mode="wait">
              {error && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="login-error">
                  <AlertCircle /><span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <button type="submit" disabled={isLoading} className="login-primary-button">
              {isLoading ? <Loader2 className="animate-spin" /> : <>Continue<ArrowRight /></>}
            </button>
          </form>

          <div className="login-utility-row"><span>Client access is provisioned by the administrator.</span></div>
        </motion.div>
      </main>
    </div>
  );
}
