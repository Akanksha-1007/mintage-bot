export interface BotDesignConfig {
  // Branding & Header
  botTitle: string;
  subtitle: string;
  avatarUrl: string;
  avatarPreset: 'robot' | 'agent' | 'sparkles' | 'support' | 'custom';

  // Color Palette & Themes
  themePreset: 'indigo' | 'emerald' | 'midnight' | 'sunset' | 'rose' | 'cyber' | 'custom';
  headerBgColor: string;
  headerTextColor: string;
  userBubbleBg: string;
  userBubbleText: string;
  botBubbleBg: string;
  botBubbleText: string;
  accentColor: string;
  widgetBgColor: string;

  // Widget Launcher Button
  launcherIcon: 'chat' | 'bot' | 'sparkles' | 'message' | 'help';
  launcherText: string;
  showTeaser: boolean;
  launcherPosition: 'bottom-right' | 'bottom-left';
  launcherShape: 'circle' | 'pill' | 'rounded';
  enablePulseAnimation: boolean;

  // Typography & Structure
  fontFamily: 'Inter' | 'Outfit' | 'Poppins' | 'Roboto' | 'System';
  borderRadius: '8px' | '16px' | '24px' | '32px';
  shadowStyle: 'soft' | 'elevated' | 'glow';
}

export const DESIGN_THEME_PRESETS: Record<string, {
  name: string;
  headerBgColor: string;
  headerTextColor: string;
  userBubbleBg: string;
  userBubbleText: string;
  botBubbleBg: string;
  botBubbleText: string;
  accentColor: string;
  widgetBgColor: string;
}> = {
  indigo: {
    name: 'Mintage Purple',
    headerBgColor: 'linear-gradient(135deg, #5B3DF5 0%, #7B4DFF 100%)',
    headerTextColor: '#ffffff',
    userBubbleBg: '#5B3DF5',
    userBubbleText: '#ffffff',
    botBubbleBg: '#ffffff',
    botBubbleText: '#1e293b',
    accentColor: '#E83E9B',
    widgetBgColor: '#F8F7FF'
  },
  emerald: {
    name: 'Emerald Luxury',
    headerBgColor: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
    headerTextColor: '#ffffff',
    userBubbleBg: '#059669',
    userBubbleText: '#ffffff',
    botBubbleBg: '#ffffff',
    botBubbleText: '#0f172a',
    accentColor: '#10b981',
    widgetBgColor: '#f0fdf4'
  },
  midnight: {
    name: 'Midnight Dark',
    headerBgColor: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    headerTextColor: '#38bdf8',
    userBubbleBg: '#2563eb',
    userBubbleText: '#ffffff',
    botBubbleBg: '#1e293b',
    botBubbleText: '#f8fafc',
    accentColor: '#38bdf8',
    widgetBgColor: '#0f172a'
  },
  sunset: {
    name: 'Sunset Glow',
    headerBgColor: 'linear-gradient(135deg, #ea580c 0%, #d97706 100%)',
    headerTextColor: '#ffffff',
    userBubbleBg: '#ea580c',
    userBubbleText: '#ffffff',
    botBubbleBg: '#ffffff',
    botBubbleText: '#1c1917',
    accentColor: '#f97316',
    widgetBgColor: '#fff7ed'
  },
  rose: {
    name: 'Rose Romance',
    headerBgColor: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
    headerTextColor: '#ffffff',
    userBubbleBg: '#e11d48',
    userBubbleText: '#ffffff',
    botBubbleBg: '#ffffff',
    botBubbleText: '#1c1917',
    accentColor: '#f43f5e',
    widgetBgColor: '#fff1f2'
  },
  cyber: {
    name: 'Cyberpunk Neon',
    headerBgColor: 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)',
    headerTextColor: '#ffffff',
    userBubbleBg: '#8b5cf6',
    userBubbleText: '#ffffff',
    botBubbleBg: '#18181b',
    botBubbleText: '#f4f4f5',
    accentColor: '#ec4899',
    widgetBgColor: '#09090b'
  }
};

export function getDefaultDesignConfig(overrides?: Partial<BotDesignConfig>): BotDesignConfig {
  return {
    botTitle: 'BotFlow Assistant',
    subtitle: 'Online • Replies instantly',
    avatarUrl: '',
    avatarPreset: 'robot',

    themePreset: 'indigo',
    headerBgColor: 'linear-gradient(135deg, #5B3DF5 0%, #7B4DFF 100%)',
    headerTextColor: '#ffffff',
    userBubbleBg: '#5B3DF5',
    userBubbleText: '#ffffff',
    botBubbleBg: '#ffffff',
    botBubbleText: '#1e293b',
    accentColor: '#E83E9B',
    widgetBgColor: '#F8F7FF',

    launcherIcon: 'chat',
    launcherText: 'Chat with us! 👋',
    showTeaser: true,
    launcherPosition: 'bottom-right',
    launcherShape: 'circle',
    enablePulseAnimation: true,

    fontFamily: 'Inter',
    borderRadius: '16px',
    shadowStyle: 'elevated',
    ...overrides
  };
}
