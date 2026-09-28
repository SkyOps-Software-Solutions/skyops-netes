/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Loader2 } from 'lucide-react';
import React, { useState } from 'react';
import { AuthView } from './components/auth/AuthView';
import { InvitationAcceptanceModal } from './components/auth/InvitationAcceptanceModal';
import { LandingPage } from './components/landing/LandingPage';
import { AppShell } from './components/layout/AppShell';
import { BrandLogo } from './components/common/BrandLogo';
import { AuthProvider, useAuth } from './context/AuthContext';

function MainRouter() {
  const { isAuthenticated, loading } = useAuth();
  const [currentView, setCurrentView] = useState<'home' | 'signin' | 'signup'>('home');

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-zinc-100 gap-3">
        <BrandLogo size="lg" rounded="rounded-xl" className="shadow-lg shadow-sky-950/60" />
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
          <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
          <span>Initializing SkyOps Secure Session...</span>
        </div>
      </div>
    );
  }

  // If authenticated, take user directly into the SkyOps Dashboard application
  if (isAuthenticated) {
    return (
      <>
        <AppShell onSignOut={() => setCurrentView('home')} />
        <InvitationAcceptanceModal />
      </>
    );
  }

  // Public Routes for unauthenticated visitors
  if (currentView === 'signin') {
    return (
      <>
        <AuthView
          initialMode="signin"
          onBackToHome={() => setCurrentView('home')}
          onAuthSuccess={() => setCurrentView('home')}
        />
        <InvitationAcceptanceModal />
      </>
    );
  }

  if (currentView === 'signup') {
    return (
      <>
        <AuthView
          initialMode="signup"
          onBackToHome={() => setCurrentView('home')}
          onAuthSuccess={() => setCurrentView('home')}
        />
        <InvitationAcceptanceModal />
      </>
    );
  }

  // Default: Public SaaS Home / Landing Page
  return (
    <>
      <LandingPage
        onSignIn={() => setCurrentView('signin')}
        onSignUp={() => setCurrentView('signup')}
      />
      <InvitationAcceptanceModal />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainRouter />
    </AuthProvider>
  );
}
