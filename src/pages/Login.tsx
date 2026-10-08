import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Loader2, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import MintageLogo from '../components/MintageLogo';
import ThemeToggle from '../components/ThemeToggle';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const navigate = useNavigate();

  const getErrorMessage = (code: string) => {
    switch (code) {
      case 'auth/invalid-email': return 'Please enter a valid email address.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential': return 'Invalid email or password. Please try again.';
      case 'auth/user-disabled': return 'Your account has been disabled. Please contact the administrator.';
      case 'auth/too-many-requests': return 'Too many failed attempts. Please try again later.';
      case 'auth/operation-not-allowed': return 'Email/password authentication is not enabled in Firebase.';
      default: return 'Unable to sign in. Please check your credentials and try again.';
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
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

  const handleForgotPassword = async () => {
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter your email address to reset your password.');
      return;
    }
    setError('');
    setSuccessMsg('');
    setIsResetting(true);
    try {
      await sendPasswordResetEmail(auth, email.toLowerCase().trim());
      setSuccessMsg('Password reset link sent! Check your email inbox to reset your password.');
    } catch (err: any) {
      console.error('Password reset error:', err);
      setError(err?.message || 'Unable to send password reset email. Check your email address.');
    } finally {
      setIsResetting(false);
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
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="password" className="!mb-0">Password</label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={isResetting || isLoading}
                  className="text-xs text-[#5B3DF5] hover:underline font-medium focus:outline-none"
                >
                  {isResetting ? 'Sending...' : 'Forgot password?'}
                </button>
              </div>
              <input id="password" type="password" required disabled={isLoading} placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            <AnimatePresence mode="wait">
              {error && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="login-error">
                  <AlertCircle /><span>{error}</span>
                </motion.div>
              )}
              {successMsg && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="login-error !border-emerald-200 !bg-emerald-50 !text-emerald-700">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /><span>{successMsg}</span>
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
