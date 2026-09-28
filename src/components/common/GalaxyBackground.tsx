import React, { useEffect, useRef, useState } from 'react';

interface GalaxyBackgroundProps {
  intensity?: 'subtle' | 'minimal' | 'hero';
  showNebula?: boolean;
  className?: string;
}

export const GalaxyBackground: React.FC<GalaxyBackgroundProps> = ({
  intensity = 'subtle',
  showNebula = true,
  className = ''
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      initStars();
    };

    window.addEventListener('resize', handleResize);

    // Number of stars based on intensity and screen size
    const starCount =
      intensity === 'minimal'
        ? Math.floor((width * height) / 36000)
        : intensity === 'hero'
        ? Math.floor((width * height) / 18000)
        : Math.floor((width * height) / 24000);

    interface Star {
      x: number;
      y: number;
      size: number;
      baseAlpha: number;
      alpha: number;
      twinkleSpeed: number;
      twinklePhase: number;
      color: string;
    }

    let stars: Star[] = [];

    const initStars = () => {
      stars = [];
      const colors = ['#ffffff', '#bae6fd', '#c7d2fe', '#e0f2fe'];
      for (let i = 0; i < starCount; i++) {
        const baseAlpha = 0.15 + Math.random() * 0.45;
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size: Math.random() < 0.85 ? Math.random() * 1.1 + 0.5 : Math.random() * 1.6 + 1.2,
          baseAlpha,
          alpha: baseAlpha,
          twinkleSpeed: 0.005 + Math.random() * 0.015,
          twinklePhase: Math.random() * Math.PI * 2,
          color: colors[Math.floor(Math.random() * colors.length)]
        });
      }
    };

    initStars();

    let frame = 0;
    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Draw subtle stars
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];

        if (!reducedMotion) {
          star.twinklePhase += star.twinkleSpeed;
          star.alpha = star.baseAlpha + Math.sin(star.twinklePhase) * (star.baseAlpha * 0.5);
        }

        ctx.fillStyle = star.color;
        ctx.globalAlpha = Math.max(0.08, Math.min(0.85, star.alpha));
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1.0;

      if (!reducedMotion) {
        frame++;
        animationFrameId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [intensity, reducedMotion]);

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 pointer-events-none overflow-hidden select-none z-0 ${className}`}
      style={{ backgroundColor: '#05060A' }}
    >
      {/* 1. Deep Space Base Radial Gradients */}
      <div
        className="absolute inset-0 opacity-100"
        style={{
          background: `
            radial-gradient(ellipse 90% 60% at 50% -15%, rgba(14, 165, 233, 0.07), transparent 75%),
            radial-gradient(ellipse 70% 50% at 90% 15%, rgba(99, 102, 241, 0.06), transparent 70%),
            radial-gradient(ellipse 60% 45% at 10% 85%, rgba(2, 132, 199, 0.04), transparent 65%),
            #05060A
          `
        }}
      />

      {/* 2. Atmospheric Nebula Layer (Soft, floating blur) */}
      {showNebula && (
        <div
          className={`absolute inset-0 pointer-events-none ${reducedMotion ? '' : 'drift-nebula'}`}
          style={{
            backgroundImage: `
              radial-gradient(circle at 25% 30%, rgba(56, 189, 248, 0.04) 0%, transparent 45%),
              radial-gradient(circle at 75% 65%, rgba(129, 140, 248, 0.04) 0%, transparent 50%)
            `
          }}
        />
      )}

      {/* 3. Subtle Starlight Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none opacity-80"
      />

      {/* 4. Atmospheric Vignette (keeps contrast crisp on borders) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, transparent 60%, rgba(5, 6, 10, 0.6) 100%)'
        }}
      />
    </div>
  );
};
