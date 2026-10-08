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
  const [currentView, setCurrentView] = useState<'home' | 'signin' | 'signup' | 'demo'>('home');

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

  // Live Interactive Demo Mode for prospective visitors
  if (currentView === 'demo') {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col">
        <div className="bg-gradient-to-r from-sky-950/90 via-zinc-900 to-indigo-950/90 border-b border-sky-800/50 px-4 py-2 text-xs font-mono text-zinc-200 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-50 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold text-sky-300">Acme Global Fleet Sandbox</span>
            <span className="text-zinc-500">·</span>
            <span className="text-zinc-400 hidden sm:inline">
              Production-EKS · Staging-EKS · Development-GKE · Customer-Cluster-01
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentView('signup')}
              className="px-3 py-1 bg-sky-500 hover:bg-sky-400 text-zinc-950 font-bold rounded-lg text-xs transition-colors cursor-pointer"
            >
              Connect Real Cluster
            </button>
            <button
              onClick={() => setCurrentView('home')}
              className="text-zinc-400 hover:text-zinc-100 text-xs transition-colors cursor-pointer"
            >
              Exit Demo
            </button>
          </div>
        </div>
        <div className="flex-1">
          <AppShell onSignOut={() => setCurrentView('home')} />
        </div>
        <InvitationAcceptanceModal />
      </div>
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
        onExploreDemo={() => setCurrentView('demo')}
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
