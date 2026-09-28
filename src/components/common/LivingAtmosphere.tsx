import React, { useEffect, useRef, useState } from 'react';

interface SignalParticle {
  id: number;
  x: number; // percentage
  y: number; // percentage
  size: number; // 1.5 to 2.5px
  color: string;
  baseOpacity: number;
  duration: number; // seconds
  delay: number; // seconds
  driftX: number; // px
  driftY: number; // px
}

// Deterministic seed generation for digital signal particles (avoiding random jumps on re-render)
const SIGNAL_PARTICLES: SignalParticle[] = [
  { id: 1, x: 12, y: 18, size: 2, color: '#38bdf8', baseOpacity: 0.35, duration: 24, delay: 0, driftX: 14, driftY: -18 },
  { id: 2, x: 28, y: 35, size: 1.5, color: '#818cf8', baseOpacity: 0.28, duration: 32, delay: 2, driftX: -16, driftY: 14 },
  { id: 3, x: 42, y: 15, size: 2.5, color: '#22d3ee', baseOpacity: 0.42, duration: 20, delay: 4, driftX: 18, driftY: 10 },
  { id: 4, x: 65, y: 22, size: 1.5, color: '#38bdf8', baseOpacity: 0.3, duration: 28, delay: 1, driftX: -12, driftY: -16 },
  { id: 5, x: 78, y: 40, size: 2, color: '#c084fc', baseOpacity: 0.38, duration: 36, delay: 3, driftX: 16, driftY: 12 },
  { id: 6, x: 88, y: 18, size: 1.5, color: '#38bdf8', baseOpacity: 0.25, duration: 26, delay: 5, driftX: -14, driftY: -10 },
  { id: 7, x: 15, y: 62, size: 2.2, color: '#22d3ee', baseOpacity: 0.32, duration: 30, delay: 2, driftX: 12, driftY: -20 },
  { id: 8, x: 32, y: 75, size: 1.8, color: '#818cf8', baseOpacity: 0.4, duration: 22, delay: 4, driftX: -18, driftY: 16 },
  { id: 9, x: 52, y: 58, size: 1.5, color: '#38bdf8', baseOpacity: 0.22, duration: 34, delay: 1, driftX: 14, driftY: 12 },
  { id: 10, x: 68, y: 82, size: 2.4, color: '#38bdf8', baseOpacity: 0.36, duration: 25, delay: 6, driftX: -16, driftY: -14 },
  { id: 11, x: 84, y: 68, size: 1.8, color: '#a855f7', baseOpacity: 0.3, duration: 29, delay: 3, driftX: 10, driftY: 18 },
  { id: 12, x: 92, y: 88, size: 1.5, color: '#22d3ee', baseOpacity: 0.28, duration: 31, delay: 5, driftX: -12, driftY: -12 },
  { id: 13, x: 22, y: 88, size: 2, color: '#38bdf8', baseOpacity: 0.34, duration: 27, delay: 2, driftX: 15, driftY: -15 },
  { id: 14, x: 48, y: 38, size: 1.5, color: '#c084fc', baseOpacity: 0.26, duration: 33, delay: 4, driftX: -10, driftY: 14 },
  { id: 15, x: 58, y: 92, size: 2.2, color: '#22d3ee', baseOpacity: 0.35, duration: 23, delay: 1, driftX: 16, driftY: -18 },
  { id: 16, x: 74, y: 12, size: 1.6, color: '#818cf8', baseOpacity: 0.32, duration: 35, delay: 7, driftX: -14, driftY: 10 },
  { id: 17, x: 8, y: 44, size: 2, color: '#38bdf8', baseOpacity: 0.28, duration: 26, delay: 3, driftX: 12, driftY: 16 },
  { id: 18, x: 95, y: 48, size: 1.5, color: '#22d3ee', baseOpacity: 0.3, duration: 28, delay: 2, driftX: -15, driftY: -12 }
];

export const LivingAtmosphere: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const targetPointerRef = useRef({ x: 0, y: 0 });
  const currentPointerRef = useRef({ x: 0, y: 0 });
  const animationFrameRef = useRef<number | null>(null);

  // Subtle pointer tracking with spring/lerp easing on desktop
  useEffect(() => {
    // Check if the device has a precision pointer (desktop mouse/trackpad)
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (!mediaQuery.matches) {
      // Touch or mobile device: pointer parallax strictly disabled
      return;
    }

    const handlePointerMove = (e: MouseEvent) => {
      // Calculate normalized offset from center: -1.0 to +1.0
      const normX = (e.clientX / window.innerWidth - 0.5) * 2;
      const normY = (e.clientY / window.innerHeight - 0.5) * 2;
      targetPointerRef.current = { x: normX, y: normY };
    };

    window.addEventListener('mousemove', handlePointerMove, { passive: true });

    // Smooth continuous lerp loop for the atmospheric response (approx 2-5px)
    const updateParallax = () => {
      const target = targetPointerRef.current;
      const current = currentPointerRef.current;

      // Easing interpolation factor (0.04 creates an organic fluid drift)
      current.x += (target.x - current.x) * 0.04;
      current.y += (target.y - current.y) * 0.04;

      if (containerRef.current) {
        // Deep blue layer responds ~3.5px
        containerRef.current.style.setProperty('--parallax-blue-x', `${(current.x * 3.8).toFixed(2)}px`);
        containerRef.current.style.setProperty('--parallax-blue-y', `${(current.y * 3.8).toFixed(2)}px`);

        // Subtle violet layer drifts oppositely ~2.5px
        containerRef.current.style.setProperty('--parallax-violet-x', `${(-current.x * 2.8).toFixed(2)}px`);
        containerRef.current.style.setProperty('--parallax-violet-y', `${(-current.y * 2.8).toFixed(2)}px`);

        // Cyan light diffusion follows ~4.5px
        containerRef.current.style.setProperty('--parallax-cyan-x', `${(current.x * 4.5).toFixed(2)}px`);
        containerRef.current.style.setProperty('--parallax-cyan-y', `${(current.y * 4.5).toFixed(2)}px`);
      }

      animationFrameRef.current = requestAnimationFrame(updateParallax);
    };

    animationFrameRef.current = requestAnimationFrame(updateParallax);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      id="skyops-living-atmosphere"
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none"
      style={
        {
          '--parallax-blue-x': '0px',
          '--parallax-blue-y': '0px',
          '--parallax-violet-x': '0px',
          '--parallax-violet-y': '0px',
          '--parallax-cyan-x': '0px',
          '--parallax-cyan-y': '0px'
        } as React.CSSProperties
      }
    >
      {/* Base Dark Foundation */}
      <div className="absolute inset-0 bg-[#07080c]" />

      {/* Layer A: Deep Blue Atmospheric Cloud (25-40s loop) */}
      <div
        className="absolute -top-[15%] -left-[10%] w-[65vw] h-[65vw] max-w-[950px] max-h-[950px] rounded-full skyops-cosmic-cloud-blue will-change-transform"
        style={{
          background: 'radial-gradient(circle, rgba(14, 116, 144, 0.28) 0%, rgba(2, 132, 199, 0.18) 40%, rgba(3, 105, 161, 0.06) 70%, transparent 85%)',
          filter: 'blur(75px)'
        }}
      />

      {/* Layer B: Subtle Violet Atmospheric Cloud (35-55s loop, counter trajectory) */}
      <div
        className="absolute -bottom-[20%] -right-[10%] w-[70vw] h-[70vw] max-w-[1050px] max-h-[1050px] rounded-full skyops-cosmic-cloud-violet will-change-transform"
        style={{
          background: 'radial-gradient(circle, rgba(109, 40, 217, 0.22) 0%, rgba(91, 33, 182, 0.14) 45%, rgba(67, 24, 155, 0.04) 75%, transparent 85%)',
          filter: 'blur(85px)'
        }}
      />

      {/* Layer C: Very Subtle Cyan Light Diffusion (15-30s loop, center-right) */}
      <div
        className="absolute top-[25%] right-[20%] w-[45vw] h-[45vw] max-w-[700px] max-h-[700px] rounded-full skyops-cosmic-cloud-cyan will-change-transform"
        style={{
          background: 'radial-gradient(circle, rgba(6, 182, 212, 0.16) 0%, rgba(14, 165, 233, 0.08) 50%, transparent 80%)',
          filter: 'blur(70px)'
        }}
      />

      {/* Layer D: Sparse Digital Signal Particles (represent infrastructure telemetry) */}
      <div className="absolute inset-0">
        {SIGNAL_PARTICLES.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full skyops-signal-particle"
            style={
              {
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: `${p.size}px`,
                height: `${p.size}px`,
                backgroundColor: p.color,
                boxShadow: `0 0 6px 1px ${p.color}80`,
                '--base-opacity': p.baseOpacity,
                '--drift-x': `${p.driftX}px`,
                '--drift-y': `${p.driftY}px`,
                animationDuration: `${p.duration}s`,
                animationDelay: `${p.delay}s`
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* Layer E: Soft Dark Vignette for Immaculate Contrast & Depth */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 50% 45%, transparent 40%, rgba(7, 8, 12, 0.6) 80%, rgba(5, 6, 9, 0.92) 100%)'
        }}
      />
    </div>
  );
};
