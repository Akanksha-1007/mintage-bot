import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export interface ImpersonatedClient {
  id: string;
  name: string;
  email: string;
  company?: string;
}

export interface ClientProfile {
  id: string;
  name: string;
  email: string;
  company?: string;
  clientId: string;
}

interface AuthContextType {
  user: User | null;
  isDemo: boolean;
  loading: boolean;
  isAdmin: boolean;
  userRole: 'admin' | 'client' | 'user';
  clientUser: ClientProfile | null;
  impersonatedClient: ImpersonatedClient | null;
  effectiveUserId: string;
  loginDemo: () => void;
  loginClient: (client: ImpersonatedClient) => void;
  logout: () => Promise<void>;
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
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
};

function readStoredImpersonation(): ImpersonatedClient | null {
  try {
    const raw = sessionStorage.getItem('mintage_admin_impersonation');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<'admin' | 'client' | 'user'>('user');
  const [clientUser, setClientUser] = useState<ClientProfile | null>(null);
  const [impersonatedClientState, setImpersonatedClientState] = useState<ImpersonatedClient | null>(null);

  const setImpersonatedClient = (client: ImpersonatedClient | null) => {
    // Only a real Firebase admin may enter a client workspace.
    const currentIsAdmin = isAdminEmail(auth.currentUser?.email) || userRole === 'admin' || isDemo;
    if (client && !currentIsAdmin) return;
    setImpersonatedClientState(client);
    if (client) sessionStorage.setItem('mintage_admin_impersonation', JSON.stringify(client));
    else sessionStorage.removeItem('mintage_admin_impersonation');
  };

  const clearImpersonation = () => {
    setImpersonatedClientState(null);
    sessionStorage.removeItem('mintage_admin_impersonation');
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setClientUser(null);
      setUserRole('user');

      if (!firebaseUser) {
        setImpersonatedClientState(null);
        setLoading(false);
        return;
      }

      const adminByEmail = isAdminEmail(firebaseUser.email);

      try {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userSnap = await getDoc(userRef);
        const data = userSnap.exists() ? userSnap.data() : {};

        if (adminByEmail || data.role === 'admin') {
          setUserRole('admin');
          setClientUser(null);
          const storedImpersonation = readStoredImpersonation();
          if (storedImpersonation) setImpersonatedClientState(storedImpersonation);
        } else {
          // Check if client record exists in 'clients' collection for additional company info
          let clientComp = data.company || '';
          let clientName = data.displayName || firebaseUser.displayName || '';

          if (!clientComp || !clientName) {
            try {
              const clientRef = doc(db, 'clients', firebaseUser.uid);
              const clientSnap = await getDoc(clientRef);
              if (clientSnap.exists()) {
                const cData = clientSnap.data();
                if (!clientComp) clientComp = cData.company || '';
                if (!clientName) clientName = cData.name || '';
              }
            } catch (e) {
              console.warn('Unable to fetch clients doc:', e);
            }
          }

          const clientId = String(data.clientId || firebaseUser.uid);
          const profile: ClientProfile = {
            id: firebaseUser.uid,
            clientId,
            name: String(clientName || firebaseUser.email?.split('@')[0] || 'Client'),
            email: String(firebaseUser.email || data.email || ''),
            company: String(clientComp || '')
          };

          setUserRole('client');
          setClientUser(profile);
          setImpersonatedClientState(null);
          sessionStorage.removeItem('mintage_admin_impersonation');

          await setDoc(userRef, {
            email: firebaseUser.email || '',
            displayName: profile.name,
            company: profile.company,
            role: 'client',
            clientId,
            lastLogin: serverTimestamp()
          }, { merge: true }).catch(() => undefined);
        }
      } catch (error) {
        console.warn('Unable to load user profile:', error);
        if (adminByEmail) {
          setUserRole('admin');
          setClientUser(null);
        } else {
          const profile: ClientProfile = {
            id: firebaseUser.uid,
            clientId: firebaseUser.uid,
            name: String(firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Client'),
            email: String(firebaseUser.email || ''),
          };
          setUserRole('client');
          setClientUser(profile);
          setImpersonatedClientState(null);
          sessionStorage.removeItem('mintage_admin_impersonation');
        }
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const loginDemo = () => {
    // Kept for backwards compatibility with old UI code, but no longer grants
    // admin access. Real admins must authenticate through Firebase Auth.
    setIsDemo(false);
  };

  const loginClient = (_client: ImpersonatedClient) => {
    // Legacy API kept only so older components compile. Client identity now comes
    // exclusively from Firebase Authentication + users/{uid}.
    return;
  };

  const logout = async () => {
    clearImpersonation();
    setClientUser(null);
    setUserRole('user');
    setIsDemo(false);
    await signOut(auth);
  };

  const isAdmin = Boolean(user && (isAdminEmail(user.email) || userRole === 'admin'));
  const effectiveUserId = isAdmin
    ? (impersonatedClientState?.id || user?.uid || '')
    : (clientUser?.id || '');

  return (
    <AuthContext.Provider value={{
      user,
      isDemo,
      loading,
      isAdmin,
      userRole,
      clientUser,
      impersonatedClient: isAdmin ? impersonatedClientState : null,
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
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
