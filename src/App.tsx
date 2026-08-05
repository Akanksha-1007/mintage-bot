/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { db } from './lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Bots from './pages/Bots';
import Builder from './pages/Builder';
import Integrations from './pages/Integrations';
import Leads from './pages/Leads';
import AdminDashboard from './pages/AdminDashboard';
import Layout from './components/Layout';

import Widget from './pages/Widget';
import AuthCallback from './pages/AuthCallback';

function BotSync() {
  useEffect(() => {
    const syncLocalBots = async () => {
      try {
        const localBotsRaw = localStorage.getItem('mintage_bots') || localStorage.getItem('botflow_local_bots');
        if (!localBotsRaw) return;
        const parsed = JSON.parse(localBotsRaw);
        const botsList = Array.isArray(parsed) ? parsed : Object.values(parsed);
        for (const bot of botsList) {
          if (bot && bot.id && bot.nodes) {
            // Sync to express server
            try {
              await fetch('/api/bots/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bot)
              });
            } catch (e) { }

            // Sync to Firestore
            try {
              await setDoc(doc(db, 'bot_configurations', bot.id), {
                name: bot.name || 'Unnamed Bot',
                nodes: bot.nodes,
                edges: bot.edges || [],
                spreadsheetId: bot.spreadsheetId || '',
                updatedAt: serverTimestamp()
              }, { merge: true });
            } catch (e) { }
          }
        }
      } catch (err) { }
    };

    syncLocalBots();
  }, []);

  return null;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isDemo, impersonatedClient, loading } = useAuth();

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!user && !isDemo && !impersonatedClient) return <Navigate to="/login" />;

  return <Layout>{children}</Layout>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isDemo, impersonatedClient, loading, isAdmin } = useAuth();

  if (loading) return <div className="flex items-center justify-center h-screen font-sans text-slate-600">Loading...</div>;
  if (!user && !isDemo && !impersonatedClient) return <Navigate to="/login" />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <AuthProvider>
      <BotSync />

      <BrowserRouter basename="/mintage-bot">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/widget/:id" element={<Widget />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            }
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/bots"
            element={
              <ProtectedRoute>
                <Bots />
              </ProtectedRoute>
            }
          />

          <Route
            path="/builder/:id?"
            element={
              <ProtectedRoute>
                <Builder />
              </ProtectedRoute>
            }
          />

          <Route
            path="/integrations"
            element={
              <ProtectedRoute>
                <Integrations />
              </ProtectedRoute>
            }
          />

          <Route
            path="/leads"
            element={
              <ProtectedRoute>
                <Leads />
              </ProtectedRoute>
            }
          />

          <Route path="/" element={<Navigate to="/dashboard" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
