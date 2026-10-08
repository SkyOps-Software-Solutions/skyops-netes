import React, { useState } from 'react';
import { Download, Share, Smartphone, X, Check } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'compact' | 'standard' | 'sidebar';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  variant = 'compact'
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [installing, setInstalling] = useState(false);

  // If already installed in standalone mode, do not show prompt
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    if (isInstallable) {
      setInstalling(true);
      try {
        await install();
      } finally {
        setInstalling(false);
      }
    } else {
      // If browser hasn't fired beforeinstallprompt yet or doesn't support it, show instructions
      setShowIOSModal(true);
    }
  };

  if (!isInstallable && !isIOS) {
    // Still render a friendly button if wanted, or fallback
    return (
      <>
        <button
          onClick={() => setShowIOSModal(true)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded bg-sky-950/60 hover:bg-sky-900/60 text-sky-300 hover:text-sky-200 border border-sky-800/60 transition-colors text-xs font-mono font-medium cursor-pointer ${className}`}
          title="Install SkyOps as a Standalone App"
        >
          <Download className="w-3.5 h-3.5 text-sky-400" />
          <span>Install App</span>
        </button>

        {showIOSModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-xl bg-zinc-900 border border-zinc-700 p-6 shadow-2xl text-zinc-100 font-sans space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-sky-400" />
                  <h3 className="text-sm font-semibold text-white">Install SkyOps</h3>
                </div>
                <button
                  onClick={() => setShowIOSModal(false)}
                  className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs text-zinc-300 space-y-3">
                <p>Install SkyOps on your mobile home screen or desktop for rapid Kubernetes incident management:</p>
                <div className="space-y-2 bg-zinc-950 p-3 rounded-lg border border-zinc-800 font-mono text-[11px]">
                  <div className="flex items-start gap-2">
                    <span className="text-sky-400 font-bold">1.</span>
                    <span>In your browser menu (Chrome, Safari, Edge), look for <strong>Install SkyOps</strong> or <strong>Share</strong>.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-sky-400 font-bold">2.</span>
                    <span>Select <strong>Add to Home Screen</strong> or <strong>Install App</strong>.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-sky-400 font-bold">3.</span>
                    <span>Launch SkyOps with dedicated full-screen window and instant triage.</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowIOSModal(false)}
                className="w-full py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-mono text-xs font-semibold transition-colors cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <button
        onClick={handleInstallClick}
        disabled={installing}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded bg-sky-600/90 hover:bg-sky-500 text-white border border-sky-400/40 shadow-xs hover:shadow-sky-500/20 transition-all text-xs font-mono font-medium cursor-pointer ${className}`}
        title="Install SkyOps to desktop or home screen"
      >
        <Download className={`w-3.5 h-3.5 ${installing ? 'animate-bounce' : ''}`} />
        <span>{installing ? 'Installing...' : isIOS ? 'Install on iOS' : 'Install App'}</span>
      </button>

      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-xl bg-zinc-900 border border-zinc-700 p-6 shadow-2xl text-zinc-100 font-sans space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-sky-400" />
                <h3 className="text-sm font-semibold text-white">Install SkyOps on iOS</h3>
              </div>
              <button
                onClick={() => setShowIOSModal(false)}
                className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-zinc-300 space-y-3">
              <p>Install SkyOps on your iPhone or iPad home screen for instant incident alerts and autonomous cluster control:</p>
              <div className="space-y-2.5 bg-zinc-950 p-3.5 rounded-lg border border-zinc-800 font-mono text-[11px]">
                <div className="flex items-start gap-2">
                  <span className="p-1 rounded bg-zinc-800 text-sky-400">
                    <Share className="w-3.5 h-3.5" />
                  </span>
                  <span>1. Tap the <strong>Share</strong> icon in the Safari navigation bar at bottom.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="p-1 rounded bg-zinc-800 text-emerald-400 font-bold">+</span>
                  <span>2. Scroll down and tap <strong>Add to Home Screen</strong>.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="p-1 rounded bg-zinc-800 text-sky-400">
                    <Check className="w-3.5 h-3.5" />
                  </span>
                  <span>3. Tap <strong>Add</strong> in the top right to complete.</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-mono text-xs font-semibold transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
};
