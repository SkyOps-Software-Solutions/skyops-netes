import React, { useState } from 'react';
import { SKYOPS_LOGO_FIREBASE_URL, SKYOPS_LOGO_URL } from '../../config/branding';

interface BrandLogoProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  rounded?: string;
  alt?: string;
}

const sizeMap = {
  xs: 'w-5 h-5 min-w-[20px]',
  sm: 'w-7 h-7 min-w-[28px]',
  md: 'w-8 h-8 min-w-[32px]',
  lg: 'w-10 h-10 min-w-[40px]',
  xl: 'w-12 h-12 min-w-[48px]',
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = '',
  size = 'md',
  rounded = 'rounded-lg',
  alt = 'SkyOps Logo',
}) => {
  const [imgSrc, setImgSrc] = useState<string>(SKYOPS_LOGO_URL);
  const [hasError, setHasError] = useState(false);

  const handleError = () => {
    // If local path failed, fallback to remote Firebase Storage URL
    if (imgSrc !== SKYOPS_LOGO_FIREBASE_URL) {
      setImgSrc(SKYOPS_LOGO_FIREBASE_URL);
    } else {
      setHasError(true);
    }
  };

  const dimensionClass = sizeMap[size] || sizeMap.md;

  if (hasError) {
    return (
      <div
        className={`${dimensionClass} ${rounded} bg-sky-600 flex items-center justify-center text-white font-mono font-bold text-xs shadow-md shrink-0 ${className}`}
      >
        SK
      </div>
    );
  }

  return (
    <div
      className={`${dimensionClass} ${rounded} overflow-hidden flex items-center justify-center shrink-0 bg-zinc-950 border border-zinc-800/80 shadow-md ${className}`}
    >
      <img
        src={imgSrc}
        alt={alt}
        onError={handleError}
        className="w-full h-full object-cover"
        loading="eager"
      />
    </div>
  );
};
