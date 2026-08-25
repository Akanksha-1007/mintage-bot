import React from 'react';

const mintageMark = new URL('../assets/images/mintage-mark.png', import.meta.url).href;
const mintageLockup = new URL('../assets/images/mintage-lockup.png', import.meta.url).href;

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
    sm: { mark: 'h-[26px] w-[26px]', title: 'text-[14.5px]', sub: 'text-[10.5px]' },
    md: { mark: 'h-[30px] w-[30px]', title: 'text-[15px]', sub: 'text-[11px]' },
    lg: { mark: 'h-[36px] w-[36px]', title: 'text-[17px]', sub: 'text-[11.5px]' },
    xl: { mark: '', title: '', sub: '' },
  };

  if (size === 'xl') {
    return (
      <div className={`full-brand-lockup ${className}`}>
        <img src={mintageLockup} alt="Mintage — refreshing brands" />
      </div>
    );
  }

  const currentSize = sizeMap[size];

  return (
    <div className={`flex min-w-0 items-center gap-2.5 ${className}`}>
      <span className={`brand-mark ${currentSize.mark}`} aria-hidden="true">
        <img src={mintageMark} alt="" />
      </span>
      <span className="flex min-w-0 flex-col leading-none">
        <span className={`brand-name ${currentSize.title}`}>Mintage</span>
        {showSubtitle && (
          <span className={`brand-sub ${currentSize.sub}`}>Chatbot workspace</span>
        )}
      </span>
    </div>
  );
}
