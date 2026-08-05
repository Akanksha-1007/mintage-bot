import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return new Error(JSON.stringify(errInfo));
}

export interface ImpersonatedClient {
  id: string;
  name: string;
  email: string;
  company?: string;
  password?: string;
}

interface AuthContextType {
  user: User | null;
  isDemo: boolean;
  loading: boolean;
  isAdmin: boolean;
  userRole: 'admin' | 'user';
  clientUser: ImpersonatedClient | null;
  impersonatedClient: ImpersonatedClient | null;
  effectiveUserId: string;
  loginDemo: () => void;
  loginClient: (client: ImpersonatedClient) => void;
  logout: () => void;
  setImpersonatedClient: (client: ImpersonatedClient | null) => void;
  clearImpersonation: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ADMIN_EMAILS = [
  'admin@mintagemarkcomm.com',
  'admin@mintagemarkcomm',
  'akanksha@mintagemarkcomm.com',
  'admin@mintage.com'
];

export const isAdminEmail = (email?: string | null) => {
  if (!email) return false;
  const clean = email.toLowerCase().trim();
  return ADMIN_EMAILS.includes(clean);
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<'admin' | 'user'>('user');
  const [clientUser, setClientUser] = useState<ImpersonatedClient | null>(() => {
    try {
      const stored = localStorage.getItem('botflow_client_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [impersonatedClient, setImpersonatedClientState] = useState<ImpersonatedClient | null>(() => {
    try {
      const stored = localStorage.getItem('botflow_impersonated_client');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const setImpersonatedClient = (client: ImpersonatedClient | null) => {
    setImpersonatedClientState(client);
    if (client) {
      localStorage.setItem('botflow_impersonated_client', JSON.stringify(client));
    } else {
      localStorage.removeItem('botflow_impersonated_client');
    }
  };

  const clearImpersonation = () => {
    setImpersonatedClient(null);
  };

  const loginClient = (client: ImpersonatedClient) => {
    setClientUser(client);
    setImpersonatedClientState(null);
    setIsDemo(false);
    setUserRole('user');
    localStorage.setItem('botflow_client_user', JSON.stringify(client));
    localStorage.removeItem('botflow_demo_session');
    localStorage.removeItem('botflow_impersonated_client');
  };

  useEffect(() => {
    const demoSession = localStorage.getItem('botflow_demo_session');
    const storedClient = localStorage.getItem('botflow_client_user');

    if (storedClient) {
      setUserRole('user');
    } else if (demoSession === 'true') {
      setIsDemo(true);
      setUserRole('admin');
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        if (isAdminEmail(firebaseUser.email)) {
          setUserRole('admin');
        }

        const userRef = doc(db, 'users', firebaseUser.uid);
        try {
          const userDoc = await getDoc(userRef).catch(() => null);
          if (!userDoc || !userDoc.exists()) {
            const roleToSet = isAdminEmail(firebaseUser.email) ? 'admin' : 'user';
            await setDoc(userRef, {
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || '',
              photoURL: firebaseUser.photoURL || '',
              createdAt: serverTimestamp(),
              lastLogin: serverTimestamp(),
              role: roleToSet
            }, { merge: true }).catch(err => console.warn('User profile create warning:', err?.message || err));
          } else {
            const data = userDoc.data();
            if (data?.role === 'admin' || isAdminEmail(firebaseUser.email)) {
              setUserRole('admin');
            } else {
              setUserRole('user');
            }

            await setDoc(userRef, {
              lastLogin: serverTimestamp(),
              displayName: firebaseUser.displayName || data?.displayName || '',
              photoURL: firebaseUser.photoURL || data?.photoURL || '',
            }, { merge: true }).catch(err => console.warn('User profile update warning:', err?.message || err));
          }
        } catch (error: any) {
          if (error?.code === 'permission-denied') {
            const enhancedError = handleFirestoreError(error, OperationType.WRITE, `users/${firebaseUser.uid}`);
            console.warn('Sync failed (permission denied):', enhancedError.message);
          } else {
            console.warn('User profile sync skipped/offline:', error?.message || error);
          }
        }
      }
      setUser(firebaseUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginDemo = () => {
    setIsDemo(true);
    setClientUser(null);
    setUserRole('admin');
    localStorage.setItem('botflow_demo_session', 'true');
    localStorage.removeItem('botflow_client_user');
  };

  const logout = async () => {
    localStorage.removeItem('botflow_demo_session');
    localStorage.removeItem('botflow_impersonated_client');
    localStorage.removeItem('botflow_client_user');
    setIsDemo(false);
    setClientUser(null);
    setImpersonatedClientState(null);
    setUserRole('user');
    await auth.signOut();
  };

  // Effective User ID for querying resources (bots, leads)
  const effectiveUserId = impersonatedClient ? impersonatedClient.id : (clientUser ? clientUser.id : (user?.uid || 'demo_user'));

  // Admin boolean: true ONLY if user is genuinely an admin AND NOT a client account
  const isAdmin = !clientUser && (isAdminEmail(user?.email) || userRole === 'admin' || (isDemo && !clientUser));

  return (
    <AuthContext.Provider value={{ 
      user, 
      isDemo, 
      loading, 
      isAdmin,
      userRole,
      clientUser,
      impersonatedClient,
      effectiveUserId,
      loginDemo, 
      loginClient,
      logout,
      setImpersonatedClient,
      clearImpersonation
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
