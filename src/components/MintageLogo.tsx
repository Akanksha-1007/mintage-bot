import React from 'react';

const mintageMark = new URL('../assets/images/mintage-mark.png', import.meta.url).href;
const mintageLockup = new URL('../assets/images/mintage-lockup.png', import.meta.url).href;

interface MintageLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
  variant?: 'light' | 'dark' | 'auto';
  textColor?: string;
}

export default function MintageLogo({
  className = '',
  size = 'md',
  showSubtitle = false,
  variant = 'auto',
  textColor,
}: MintageLogoProps) {
  const sizeMap = {
    sm: { mark: 'h-[30px] w-[30px] p-0.5', title: 'text-[15px]', sub: 'text-[10.5px]' },
    md: { mark: 'h-[36px] w-[36px] p-1', title: 'text-[17px]', sub: 'text-[11px]' },
    lg: { mark: 'h-[44px] w-[44px] p-1.5', title: 'text-[20px]', sub: 'text-[12px]' },
    xl: { mark: 'h-[56px] w-[56px] p-2', title: 'text-[26px]', sub: 'text-[13.5px]' },
  };

  if (size === 'xl') {
    return (
      <div className={`flex flex-col items-center gap-3 ${className}`}>
        <div className="relative group">
          <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-[#5B3DF5] via-[#8B74FF] to-[#E83E9B] opacity-75 blur-md group-hover:opacity-100 transition duration-300"></div>
          <div className="relative flex items-center justify-center h-16 w-16 rounded-2xl bg-white p-2 shadow-xl border border-purple-100">
            <img src={mintageMark} alt="Mintage Logo" className="h-full w-full object-contain" />
          </div>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-[#5B3DF5] via-[#7B4DFF] to-[#E83E9B] bg-clip-text text-transparent">
            Mintage
          </span>
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-0.5">
            Chatbot Workspace
          </span>
        </div>
      </div>
    );
  }

  const currentSize = sizeMap[size];

  let titleColorClass = textColor;
  let subColorClass = 'text-gray-500 dark:text-gray-400';

  if (!titleColorClass) {
    if (variant === 'light') {
      titleColorClass = 'text-white';
      subColorClass = 'text-gray-400';
    } else if (variant === 'dark') {
      titleColorClass = 'text-gray-900';
      subColorClass = 'text-gray-500';
    } else {
      titleColorClass = 'text-gray-900 dark:text-white';
    }
  }

  return (
    <div className={`flex min-w-0 items-center gap-2.5 ${className}`}>
      <div className="relative shrink-0">
        <span className={`inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-[#5B3DF5] via-[#7B4DFF] to-[#E83E9B] p-[1.5px] shadow-sm ${currentSize.mark}`}>
          <span className="flex h-full w-full items-center justify-center rounded-[10px] bg-white p-0.5 overflow-hidden">
            <img src={mintageMark} alt="Mintage" className="h-full w-full object-contain" />
          </span>
        </span>
      </div>
      <span className="flex min-w-0 flex-col leading-none">
        <span className={`font-extrabold tracking-tight ${titleColorClass} ${currentSize.title}`}>
          Mintage
        </span>
        {showSubtitle && (
          <span className={`font-medium ${subColorClass} mt-0.5 ${currentSize.sub}`}>
            Chatbot workspace
          </span>
        )}
      </span>
    </div>
  );
}
