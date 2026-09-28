import React from 'react';

interface SkyOpsIntelligenceProcessingProps {
  title?: string;
  subtitle?: string;
  className?: string;
  compact?: boolean;
}

export const SkyOpsIntelligenceProcessing: React.FC<SkyOpsIntelligenceProcessingProps> = ({
  title = '✦ SKYOPS INTELLIGENCE',
  subtitle = 'Analyzing infrastructure signals...',
  className = '',
  compact = false
}) => {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-sky-500/30 bg-zinc-950/90 p-5 flex flex-col items-center justify-center text-center select-none ${className}`}
    >
      {/* Background Animated Blue/Violet Morphing Energy Field */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -inset-1/2 opacity-35 skyops-ai-energy-field"
          style={{
            background:
              'radial-gradient(ellipse at 35% 35%, rgba(56, 189, 248, 0.45) 0%, transparent 50%), radial-gradient(ellipse at 65% 65%, rgba(139, 92, 246, 0.45) 0%, transparent 55%), radial-gradient(circle at 50% 50%, rgba(14, 165, 233, 0.25) 0%, transparent 70%)',
            filter: 'blur(32px)'
          }}
        />
        {/* Soft rotating conic ambient sheen */}
        <div
          className="absolute inset-0 opacity-20 skyops-ai-conic-spin"
          style={{
            background:
              'conic-gradient(from 0deg at 50% 50%, rgba(56, 189, 248, 0.3) 0deg, rgba(168, 85, 247, 0.3) 120deg, rgba(14, 165, 233, 0.1) 240deg, rgba(56, 189, 248, 0.3) 360deg)'
          }}
        />
      </div>

      {/* Central Intelligence Core with Inward-Drifting Particles */}
      <div className="relative mb-3.5 flex items-center justify-center">
        {/* Inward Ingesting Particles */}
        <div className="absolute inset-0 -m-6 pointer-events-none">
          <span
            className="absolute rounded-full bg-sky-400 skyops-ai-particle-inward"
            style={{ width: '3px', height: '3px', top: '10%', left: '15%', '--in-x': '26px', '--in-y': '26px', animationDelay: '0s' } as React.CSSProperties}
          />
          <span
            className="absolute rounded-full bg-violet-400 skyops-ai-particle-inward"
            style={{ width: '2.5px', height: '2.5px', top: '15%', right: '15%', '--in-x': '-24px', '--in-y': '22px', animationDelay: '0.6s' } as React.CSSProperties}
          />
          <span
            className="absolute rounded-full bg-cyan-300 skyops-ai-particle-inward"
            style={{ width: '3px', height: '3px', bottom: '15%', left: '20%', '--in-x': '22px', '--in-y': '-24px', animationDelay: '1.2s' } as React.CSSProperties}
          />
          <span
            className="absolute rounded-full bg-sky-300 skyops-ai-particle-inward"
            style={{ width: '2px', height: '2.5px', bottom: '10%', right: '20%', '--in-x': '-28px', '--in-y': '-20px', animationDelay: '1.8s' } as React.CSSProperties}
          />
        </div>

        {/* Central Core Icon & Breathing Outer Rings */}
        <div className="relative w-12 h-12 rounded-2xl bg-zinc-900/90 border border-sky-400/50 flex items-center justify-center shadow-[0_0_24px_rgba(56,189,248,0.35)]">
          <div className="absolute inset-0 rounded-2xl border border-violet-500/40 skyops-ai-ring-pulse" />
          <span className="text-xl text-sky-300 skyops-ai-sparkle-glow select-none">✦</span>
        </div>
      </div>

      {/* Typography strictly complying with specification */}
      <div className="relative z-10 space-y-1">
        <h4 className="text-xs font-mono font-bold tracking-wider text-sky-300 uppercase flex items-center justify-center gap-1.5">
          <span>{title}</span>
        </h4>
        <p className="text-xs font-mono text-zinc-300 font-medium">
          {subtitle}
        </p>
        {!compact && (
          <div className="pt-2 flex items-center justify-center gap-2 text-[10px] font-mono text-zinc-400">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            <span>Correlating Kubernetes telemetry, container exits & topology mesh</span>
          </div>
        )}
      </div>
    </div>
  );
};
