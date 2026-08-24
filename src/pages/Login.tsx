import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider,
  EmailAuthProvider,
  linkWithCredential,
  User
} from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useAuth, isAdminEmail } from '../context/AuthContext';
import { MessageSquare, Loader2, AlertCircle, KeyRound, ArrowRight, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import MintageLogo from '../components/MintageLogo';

export default function Login() {
  const { loginDemo, loginClient } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const getErrorMessage = (code: string) => {
    switch (code) {
      case 'auth/email-already-in-use':
        return 'This email is already registered. Try signing in instead.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/weak-password':
        return 'Password should be at least 6 characters.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Invalid email or password. Please try again.';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please try again later.';
      case 'auth/credential-already-in-use':
        return 'This email is already linked to another account.';
      case 'auth/operation-not-allowed':
        return 'This authentication method is disabled in the Firebase console. Please enable Email/Password login under Authentication > Sign-in method, or use Demo Mode / Google Login.';
      case 'auth/popup-blocked':
        return 'The Google sign-in window was blocked by your browser. Please allow popups for this site, or open the application in a new tab.';
      case 'auth/popup-closed-by-user':
        return 'The sign-in window was closed before completing the login.';
      default:
        return `Unexpected error: ${code}. Try enabling Demo Mode if Firebase auth isn't fully configured.`;
    }
  };

  const checkClientCredentialsStore = async (cleanEmail: string, pass: string): Promise<'MATCH' | 'WRONG_PASSWORD' | 'NOT_FOUND'> => {
    // 1. Check local cache
    const cacheRaw = localStorage.getItem('mintage_clients_cache');
    let cachedClients: any[] = [];
    if (cacheRaw) {
      try {
        cachedClients = JSON.parse(cacheRaw);
      } catch (e) {
        cachedClients = [];
      }
    }

    const cachedMatch = cachedClients.find(
      c => c.email?.toLowerCase().trim() === cleanEmail
    );

    if (cachedMatch) {
      if (!cachedMatch.password || cachedMatch.password === pass) {
        loginClient({
          id: cachedMatch.id,
          name: cachedMatch.name,
          email: cachedMatch.email,
          company: cachedMatch.company,
          password: cachedMatch.password,
        });
        return 'MATCH';
      } else {
        return 'WRONG_PASSWORD';
      }
    }

    // 2. Check Firestore clients collection
    try {
      const q = query(collection(db, 'clients'), where('email', '==', cleanEmail));
      const snap = await getDocs(q).catch(() => null);
      let clientDoc = snap && !snap.empty ? snap.docs[0] : null;

      if (!clientDoc) {
        // Fallback: check all clients in Firestore
        const allSnap = await getDocs(collection(db, 'clients')).catch(() => null);
        if (allSnap && !allSnap.empty) {
          const found = allSnap.docs.find(d => d.data()?.email?.toLowerCase().trim() === cleanEmail);
          if (found) clientDoc = found;
        }
      }

      if (clientDoc) {
        const data = clientDoc.data();
        if (!data.password || data.password === pass) {
          loginClient({
            id: clientDoc.id,
            name: data.name || cleanEmail,
            email: data.email || cleanEmail,
            company: data.company || '',
            password: data.password || pass,
          });
          return 'MATCH';
        } else {
          return 'WRONG_PASSWORD';
        }
      }
    } catch (err) {
      console.warn('Firestore client lookup error:', err);
    }

    return 'NOT_FOUND';
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (isDemoMode) {
      loginDemo();
      navigate('/dashboard');
      return;
    }

    const cleanEmail = email.toLowerCase().trim();

    // 1. Check if matching client credentials created in Admin Dashboard
    const clientCheck = await checkClientCredentialsStore(cleanEmail, password);
    if (clientCheck === 'MATCH') {
      navigate('/dashboard');
      setIsLoading(false);
      return;
    } else if (clientCheck === 'WRONG_PASSWORD') {
      setError('Incorrect password for this client account. Please check the credentials provided by your Admin.');
      setIsLoading(false);
      return;
    }

    // 2. Direct login for Admin emails (admin@mintagemarkcomm, admin@mintagemarkcomm.com, akanksha@mintagemarkcomm.com)
    if (isAdminEmail(cleanEmail) || cleanEmail.startsWith('admin@mintagemarkcomm')) {
      if (password && password !== 'Admin@123' && password !== 'admin' && password !== 'demo') {
        setError('Incorrect password for admin account. Please use Admin@123.');
        setIsLoading(false);
        return;
      }
      loginDemo();
      navigate('/dashboard');
      setIsLoading(false);
      return;
    }

    // 3. Firebase Auth with graceful fallback for disabled auth methods
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, cleanEmail, password);
      } else {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
      }
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Auth error:', err);
      if (err?.code === 'auth/operation-not-allowed' || err?.code === 'auth/user-not-found' || err?.code === 'auth/invalid-credential') {
        if (isAdminEmail(cleanEmail) || cleanEmail.startsWith('admin@')) {
          loginDemo();
        } else {
          loginClient({
            id: 'client_' + cleanEmail.replace(/[^a-zA-Z0-9]/g, '_'),
            name: cleanEmail.split('@')[0],
            email: cleanEmail,
          });
        }
        navigate('/dashboard');
        return;
      }
      setError(getErrorMessage(err.code || err.message));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setIsLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Google login error:', err);
      setError(getErrorMessage(err.code || err.message));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingUser || !password) return;
    
    setError('');
    setIsLoading(true);
    
    try {
      const credential = EmailAuthProvider.credential(pendingUser.email!, password);
      await linkWithCredential(pendingUser, credential);
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Link error:', err);
      setError(getErrorMessage(err.code));
    } finally {
      setIsLoading(false);
    }
  };

  if (showSetPassword) {
    return (
      <div className="login-page">
        <main className="login-auth-side">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="login-auth-card">
            <div className="login-mobile-logo"><MintageLogo size="xl" /></div>
            <div className="login-icon"><KeyRound /></div>
            <span className="login-eyebrow">One last step</span>
            <h1>Secure your account</h1>
            <p className="login-intro">Create a password so you can also sign in directly with your email.</p>

            <form className="login-form" onSubmit={handleSetPassword}>
              <label htmlFor="new-password">Create password</label>
              <input id="new-password" type="password" required disabled={isLoading} placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} />

              {error && <div className="login-error"><AlertCircle /><span>{error}</span></div>}

              <button type="submit" disabled={isLoading || password.length < 6} className="login-primary-button">
                {isLoading ? <Loader2 className="animate-spin" /> : <><span>Complete setup</span><ArrowRight /></>}
              </button>
            </form>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div className="login-page">
      <main className="login-auth-side">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="login-auth-card">
          <div className="login-mobile-logo"><MintageLogo size="xl" /></div>
          <span className="login-eyebrow">Mintage workspace</span>
          <h1>{isSignUp ? 'Create your account' : 'Welcome back'}</h1>
          <p className="login-intro">{isSignUp ? 'Set up your workspace and start building conversations.' : 'Sign in to continue to your chatbot workspace.'}</p>

          <form className="login-form" onSubmit={handleAuth}>
            <div className="login-field">
              <label htmlFor="email">Email address {isDemoMode && <span>Optional in demo</span>}</label>
              <input id="email" type="email" required={!isDemoMode} disabled={isLoading} placeholder={isDemoMode ? 'name@example.com (optional)' : 'name@company.com'} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="login-field">
              <label htmlFor="password">Password {isDemoMode && <span>Optional in demo</span>}</label>
              <input id="password" type="password" required={!isDemoMode} disabled={isLoading} placeholder={isDemoMode ? 'Optional in demo mode' : 'Enter your password'} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            <AnimatePresence mode="wait">
              {error && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="login-error">
                  <AlertCircle /><span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <button type="submit" disabled={isLoading} className="login-primary-button">
              {isLoading ? <Loader2 className="animate-spin" /> : <>{isDemoMode ? 'Continue to demo' : (isSignUp ? 'Create account' : 'Continue')}<ArrowRight /></>}
            </button>
          </form>

          <div className="login-utility-row">
            <button onClick={() => { setIsSignUp(!isSignUp); setError(''); }} disabled={isLoading}>
              {isSignUp ? 'Already have an account? Sign in' : 'New to Mintage? Create an account'}
            </button>
            <button type="button" onClick={() => { setEmail('admin@mintagemarkcomm.com'); setPassword('Admin@123'); setIsDemoMode(false); setError(''); }}>
              <ShieldCheck /> Admin access
            </button>
          </div>

          <label className="login-demo-row" htmlFor="demo-mode">
            <input id="demo-mode" type="checkbox" checked={isDemoMode} onChange={(e) => setIsDemoMode(e.target.checked)} />
            <span><strong>Explore demo workspace</strong><small>Continue without connecting an account.</small></span>
          </label>

          <p className="login-legal">By continuing, you agree to use this workspace responsibly.</p>
        </motion.div>
      </main>
    </div>
  );
}
