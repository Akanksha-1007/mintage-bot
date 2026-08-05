import React from 'react';

const mintageLogoImg = new URL('../assets/images/mintage_logo_1785236258821.jpg', import.meta.url).href;

interface MintageLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
}

export default function MintageLogo({ 
  className = '', 
  size = 'md',
  showSubtitle = false
}: MintageLogoProps) {
  const sizeMap = {
    sm: { img: 'h-7 w-auto', title: 'text-sm', sub: 'text-[8px]' },
    md: { img: 'h-10 w-auto', title: 'text-base', sub: 'text-[9px]' },
    lg: { img: 'h-14 w-auto', title: 'text-xl', sub: 'text-[10px]' },
    xl: { img: 'h-20 w-auto', title: 'text-2xl', sub: 'text-xs' },
  };

  const currentSize = sizeMap[size];

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <img 
        src={mintageLogoImg} 
        alt="Mintage Logo" 
        className={`${currentSize.img} object-contain mix-blend-multiply rounded-lg`}
        referrerPolicy="no-referrer"
      />
      <div className="flex flex-col">
        <span className={`font-extrabold tracking-tight text-gray-900 ${currentSize.title} flex items-center gap-1`}>
          <span>Mintage</span>
          <span className="text-indigo-600 font-black">Chatbot</span>
        </span>
        {showSubtitle && (
          <span className={`font-bold uppercase tracking-widest text-gray-400 ${currentSize.sub}`}>
            Refreshing Brands
          </span>
        )}
      </div>
    </div>
  );
}
