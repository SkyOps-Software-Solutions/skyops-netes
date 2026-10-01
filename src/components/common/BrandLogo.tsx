import React, { useState } from 'react';

export const BRAND_LOGO_URL =
  'https://firebasestorage.googleapis.com/v0/b/skyops-a1143.firebasestorage.app/o/ChatGPT%20Image%20Sep%2029%2C%202026%2C%2010_37_21%20AM.png?alt=media&token=80d46921-e8f1-4ac9-8920-8be0b1c9115a';

export interface BrandLogoProps {
  /** Size preset */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** Custom image class names */
  className?: string;
  /** Custom container class names */
  containerClassName?: string;
  /** Whether to render text brand label */
  showText?: boolean;
  /** Text size */
  textClassName?: string;
  /** Optional version tag or badge */
  version?: string;
  /** Optional subtitle below the brand title */
  subtitle?: string;
  /** Optional click handler */
  onClick?: () => void;
  /** Priority loading flag */
  priority?: boolean;
  /** Optional rounded style override */
  rounded?: string;
}

const sizeMap = {
  xs: 'w-5 h-5',
  sm: 'w-6 h-6',
  md: 'w-7 h-7',
  lg: 'w-8 h-8',
  xl: 'w-10 h-10',
  '2xl': 'w-12 h-12'
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  className = '',
  containerClassName = '',
  showText = false,
  textClassName = '',
  version,
  subtitle,
  onClick,
  priority = false,
  rounded
}) => {
  const [imgSrc, setImgSrc] = useState<string>('/logo.png');
  const [hasError, setHasError] = useState<boolean>(false);

  const handleImageError = () => {
    if (imgSrc !== BRAND_LOGO_URL) {
      // Fallback to high-availability CDN URL
      setImgSrc(BRAND_LOGO_URL);
    } else {
      setHasError(true);
    }
  };

  const imgDimensions = sizeMap[size] || sizeMap.md;

  const logoImage = (
    <div
      className={`relative shrink-0 flex items-center justify-center ${rounded || 'rounded-lg'} overflow-hidden select-none ${imgDimensions} ${containerClassName}`}
      onClick={onClick}
    >
      {!hasError ? (
        <img
          src={imgSrc}
          alt="SkyOps Logo"
          onError={handleImageError}
          loading={priority ? 'eager' : 'lazy'}
          className={`w-full h-full object-contain drop-shadow-md transition-transform duration-200 ${rounded || ''} ${className}`}
        />
      ) : (
        <div className="w-full h-full rounded-lg bg-sky-600 flex items-center justify-center text-white font-mono font-bold text-xs">
          SK
        </div>
      )}
    </div>
  );

  if (!showText) {
    return logoImage;
  }

  return (
    <div className="flex items-center gap-2.5">
      {logoImage}
      <div>
        <div className={`font-bold text-zinc-100 tracking-tight flex items-center gap-1.5 ${textClassName || 'text-sm'}`}>
          SkyOps
          {version && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
              {version}
            </span>
          )}
        </div>
        {subtitle && (
          <div className="text-[10px] font-mono text-zinc-500 leading-tight">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
};
