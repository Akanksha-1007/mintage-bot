import React from 'react';

const mintageLogo = new URL('../assets/images/mintage-logo.png', import.meta.url).href;

interface MintageLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
}

export default function MintageLogo({
  className = '',
  size = 'md',
  showSubtitle = false,
}: MintageLogoProps) {
  const sizeMap = {
    sm: { mark: 'h-7 w-7', title: 'text-[14px]', sub: 'text-[10px]' },
    md: { mark: 'h-8 w-8', title: 'text-[15px]', sub: 'text-[10px]' },
    lg: { mark: 'h-10 w-10', title: 'text-lg', sub: 'text-[11px]' },
    xl: { mark: 'h-12 w-12', title: 'text-xl', sub: 'text-xs' },
  };

  const currentSize = sizeMap[size];

  if (size === 'xl') {
    return (
      <div className={`full-brand-lockup ${className}`}>
        <img src={mintageLogo} alt="Mintage — Refreshing brands" />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2.5 min-w-0 ${className}`}>
      <div className={`${currentSize.mark} brand-mark shrink-0`} aria-hidden="true">
        <img src={mintageLogo} alt="" />
      </div>
      <div className="flex min-w-0 flex-col leading-none">
        <span className={`font-semibold tracking-[-0.025em] text-[#202020] ${currentSize.title}`}>
          Mintage
        </span>
        {showSubtitle && (
          <span className={`mt-1 truncate font-medium text-[#787774] ${currentSize.sub}`}>
            Chatbot workspace
          </span>
        )}
      </div>
    </div>
  );
}
