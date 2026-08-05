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
import { MessageSquare, Chrome, Loader2, AlertCircle, KeyRound, ArrowRight, ShieldCheck } from 'lucide-react';
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
      <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] py-12 px-4 sm:px-6 lg:px-8 font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full space-y-8 bg-white p-8 sm:p-12 rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100"
        >
          <div className="text-center">
            <div className="mx-auto h-16 w-16 bg-amber-100 rounded-2xl flex items-center justify-center mb-6">
              <KeyRound className="h-8 w-8 text-amber-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Secure your account</h2>
            <p className="mt-3 text-sm text-gray-500 font-medium">
              You've signed in with Google. Please create a password so you can also log in with your email later.
            </p>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleSetPassword}>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">
                Create Password
              </label>
              <input
                type="password"
                required
                disabled={isLoading}
                className="block w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all disabled:opacity-50"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-medium">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || password.length < 6}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-100"
            >
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                <>
                  <span>Complete Setup</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full space-y-8 bg-white p-8 sm:p-12 rounded-[32px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100"
      >
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <MintageLogo size="xl" showSubtitle={true} />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">
            {isSignUp ? 'Create client account' : 'Sign in to portal'}
          </h2>
          <p className="text-xs text-gray-500 font-medium">
            {isSignUp ? 'Start building and managing your Mintage Chatbots' : 'Access your chatbot dashboard and client metrics'}
          </p>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                setEmail('admin@mintagemarkcomm.com');
                setPassword('Admin@123');
                setIsDemoMode(false);
                setError('');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl border border-indigo-200 transition-all shadow-sm"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              <span>Auto-Fill Admin Credentials</span>
            </button>
          </div>
        </div>

        <form className="mt-10 space-y-6" onSubmit={handleAuth}>
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">
                Email Address {isDemoMode && <span className="text-amber-600 font-normal lowercase">(optional in demo)</span>}
              </label>
              <input
                type="email"
                required={!isDemoMode}
                disabled={isLoading}
                className="block w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all disabled:opacity-50"
                placeholder={isDemoMode ? "any-email@demo.com" : "name@company.com"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">
                Password {isDemoMode && <span className="text-amber-600 font-normal lowercase">(optional in demo)</span>}
              </label>
              <input
                type="password"
                required={!isDemoMode}
                disabled={isLoading}
                className="block w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all disabled:opacity-50"
                placeholder={isDemoMode ? "•••••••• (optional)" : "••••••••"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <AnimatePresence mode="wait">
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-medium"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-3.5 px-4 border border-transparent text-sm font-bold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all disabled:opacity-70 shadow-lg shadow-indigo-100"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                isDemoMode ? 'Continue in Demo Mode' : (isSignUp ? 'Create Account' : 'Sign In')
              )}
            </button>
          </div>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-100"></div>
          </div>
          <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-bold">
            <span className="px-4 bg-white text-gray-400">Or continue with</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-200 rounded-xl bg-white text-sm font-bold text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50 shadow-sm"
          >
            <Chrome className="h-5 w-5 text-gray-400" />
            <span>Google</span>
          </button>
        </div>

        <div className="pt-4 text-center">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
            }}
            disabled={isLoading}
            className="text-sm font-bold text-indigo-600 hover:text-indigo-500 transition-colors"
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
          </button>
        </div>

        <div className="mt-6 flex items-center justify-center gap-3 p-4 bg-amber-50/50 rounded-2xl border border-amber-100/50">
          <div className="relative flex items-center">
            <input
              type="checkbox"
              id="demo-mode"
              checked={isDemoMode}
              onChange={(e) => setIsDemoMode(e.target.checked)}
              className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-amber-200 bg-white checked:bg-amber-500 checked:border-amber-500 transition-all"
            />
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          <label htmlFor="demo-mode" className="text-xs text-amber-800 font-bold cursor-pointer select-none">
            Enable Demo Mode (Bypass Firebase)
          </label>
        </div>
      </motion.div>
    </div>
  );
}
