import React, { useState } from 'react';
import {
  BotDesignConfig,
  DESIGN_THEME_PRESETS,
  getDefaultDesignConfig
} from '../types/design';
import {
  Bot,
  MessageSquare,
  Sparkles,
  LifeBuoy,
  User,
  Mail,
  Palette,
  Layout,
  Type,
  Maximize2,
  Check,
  RotateCcw,
  Sliders,
  Smartphone,
  Eye,
  Send,
  ChevronRight,
  Smile
} from 'lucide-react';

interface BotDesignEditorProps {
  designConfig: BotDesignConfig;
  onChange: (config: BotDesignConfig) => void;
  botName: string;
}

export default function BotDesignEditor({
  designConfig,
  onChange,
  botName
}: BotDesignEditorProps) {
  const config = designConfig || getDefaultDesignConfig();
  const [activeSection, setActiveSection] = useState<'branding' | 'colors' | 'launcher' | 'typography'>('branding');
  const [previewMode, setPreviewMode] = useState<'open' | 'launcher'>('open');

  const updateConfig = (updates: Partial<BotDesignConfig>) => {
    onChange({ ...config, ...updates });
  };

  const applyPreset = (presetKey: string) => {
    const preset = DESIGN_THEME_PRESETS[presetKey];
    if (preset) {
      updateConfig({
        themePreset: presetKey as any,
        headerBgColor: preset.headerBgColor,
        headerTextColor: preset.headerTextColor,
        userBubbleBg: preset.userBubbleBg,
        userBubbleText: preset.userBubbleText,
        botBubbleBg: preset.botBubbleBg,
        botBubbleText: preset.botBubbleText,
        accentColor: preset.accentColor,
        widgetBgColor: preset.widgetBgColor
      });
    }
  };

  const renderAvatarIcon = (preset: string, className: string = 'w-5 h-5') => {
    switch (preset) {
      case 'robot': return <Bot className={className} />;
      case 'agent': return <User className={className} />;
      case 'sparkles': return <Sparkles className={className} />;
      case 'support': return <LifeBuoy className={className} />;
      default: return <Bot className={className} />;
    }
  };

  const renderLauncherIcon = (iconName: string, className: string = 'w-6 h-6') => {
    switch (iconName) {
      case 'bot': return <Bot className={className} />;
      case 'sparkles': return <Sparkles className={className} />;
      case 'message': return <Mail className={className} />;
      case 'help': return <LifeBuoy className={className} />;
      case 'chat':
      default:
        return <MessageSquare className={className} />;
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-50">
      {/* LEFT COLUMN: Controls & Settings */}
      <div className="w-1/2 flex flex-col border-r border-gray-200 bg-white overflow-hidden">
        {/* Navigation Section Tabs */}
        <div className="flex border-b border-gray-200 bg-slate-50/80 p-1.5 gap-1">
          <button
            onClick={() => setActiveSection('branding')}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${activeSection === 'branding'
              ? 'bg-white text-indigo-600 shadow-sm border border-gray-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Header & Branding</span>
          </button>

          <button
            onClick={() => setActiveSection('colors')}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${activeSection === 'colors'
              ? 'bg-white text-indigo-600 shadow-sm border border-gray-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Color Palette</span>
          </button>

          <button
            onClick={() => setActiveSection('launcher')}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${activeSection === 'launcher'
              ? 'bg-white text-indigo-600 shadow-sm border border-gray-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
          >
            <Layout className="w-3.5 h-3.5" />
            <span>Widget Launcher</span>
          </button>

          <button
            onClick={() => setActiveSection('typography')}
            className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${activeSection === 'typography'
              ? 'bg-white text-indigo-600 shadow-sm border border-gray-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
          >
            <Type className="w-3.5 h-3.5" />
            <span>Style & Font</span>
          </button>
        </div>

        {/* Form Body Scroll Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* SECTION 1: HEADER & BRANDING */}
          {activeSection === 'branding' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Header & Bot Identity</h3>
                <p className="text-xs text-slate-500 mt-0.5">Customize how your chatbot introduces itself to site visitors.</p>
              </div>

              {/* Bot Title Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Bot Name / Header Title
                </label>
                <input
                  type="text"
                  value={config.botTitle || botName}
                  onChange={(e) => updateConfig({ botTitle: e.target.value })}
                  placeholder="e.g. BotFlow Assistant"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>

              {/* Subtitle / Status Tagline */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Status Subtitle / Tagline
                </label>
                <input
                  type="text"
                  value={config.subtitle}
                  onChange={(e) => updateConfig({ subtitle: e.target.value })}
                  placeholder="e.g. Online • Replies instantly"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>

              {/* Avatar Preset Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Avatar Icon Preset
                </label>
                <div className="grid grid-cols-5 gap-2.5">
                  {[
                    { id: 'robot', label: 'Robot' },
                    { id: 'agent', label: 'Agent' },
                    { id: 'sparkles', label: 'Sparkles' },
                    { id: 'support', label: 'Support' },
                    { id: 'custom', label: 'Custom' }
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => updateConfig({ avatarPreset: item.id as any })}
                      className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${config.avatarPreset === item.id
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-600 ring-2 ring-indigo-600/20'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                    >
                      {renderAvatarIcon(item.id, 'w-5 h-5')}
                      <span className="text-[11px] font-medium">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Avatar Image URL */}
              {config.avatarPreset === 'custom' && (
                <div className="animate-fadeIn">
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Custom Avatar Image URL
                  </label>
                  <input
                    type="url"
                    value={config.avatarUrl}
                    onChange={(e) => updateConfig({ avatarUrl: e.target.value })}
                    placeholder="https://example.com/logo.png"
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Direct HTTPS image URL (PNG, JPG, or SVG).</p>
                </div>
              )}
            </div>
          )}

          {/* SECTION 2: COLOR PALETTE */}
          {activeSection === 'colors' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Color Palette & Themes</h3>
                <p className="text-xs text-slate-500 mt-0.5">Select a curated theme or fine-tune individual brand colors.</p>
              </div>

              {/* Theme Preset Cards */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  One-Click Theme Presets
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(DESIGN_THEME_PRESETS).map(([key, preset]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => applyPreset(key)}
                      className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden group ${config.themePreset === key
                        ? 'border-indigo-600 ring-2 ring-indigo-600/20 bg-indigo-50/20'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                        }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-800">{preset.name}</span>
                        {config.themePreset === key && (
                          <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">
                            ✓
                          </span>
                        )}
                      </div>

                      {/* Color Preview Pill Bar */}
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-5 h-5 rounded-full border border-black/10 shadow-xs"
                          style={{ background: preset.headerBgColor }}
                          title="Header Color"
                        />
                        <div
                          className="w-5 h-5 rounded-full border border-black/10 shadow-xs"
                          style={{ background: preset.userBubbleBg }}
                          title="User Bubble"
                        />
                        <div
                          className="w-5 h-5 rounded-full border border-black/10 shadow-xs"
                          style={{ background: preset.botBubbleBg }}
                          title="Bot Bubble"
                        />
                        <div
                          className="w-5 h-5 rounded-full border border-black/10 shadow-xs"
                          style={{ background: preset.accentColor }}
                          title="Accent Color"
                        />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Fine-Tuning Hex Pickers */}
              <div className="space-y-4 pt-2 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Custom Color Tweaks</h4>

                <div className="grid grid-cols-2 gap-4">
                  {/* Header Background */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Header Background</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={config.headerBgColor.startsWith('#') ? config.headerBgColor : '#5B3DF5'}
                        onChange={(e) => updateConfig({ headerBgColor: e.target.value, themePreset: 'custom' })}
                        className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200"
                      />
                      <input
                        type="text"
                        value={config.headerBgColor}
                        onChange={(e) => updateConfig({ headerBgColor: e.target.value, themePreset: 'custom' })}
                        className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                  </div>

                  {/* Header Text */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Header Text</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={config.headerTextColor.startsWith('#') ? config.headerTextColor : '#ffffff'}
                        onChange={(e) => updateConfig({ headerTextColor: e.target.value, themePreset: 'custom' })}
                        className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200"
                      />
                      <input
                        type="text"
                        value={config.headerTextColor}
                        onChange={(e) => updateConfig({ headerTextColor: e.target.value, themePreset: 'custom' })}
                        className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                  </div>

                  {/* User Bubble Background */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">User Bubble Background</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={config.userBubbleBg.startsWith('#') ? config.userBubbleBg : '#5B3DF5'}
                        onChange={(e) => updateConfig({ userBubbleBg: e.target.value, themePreset: 'custom' })}
                        className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200"
                      />
                      <input
                        type="text"
                        value={config.userBubbleBg}
                        onChange={(e) => updateConfig({ userBubbleBg: e.target.value, themePreset: 'custom' })}
                        className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                  </div>

                  {/* Bot Bubble Background */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Bot Bubble Background</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={config.botBubbleBg.startsWith('#') ? config.botBubbleBg : '#ffffff'}
                        onChange={(e) => updateConfig({ botBubbleBg: e.target.value, themePreset: 'custom' })}
                        className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200"
                      />
                      <input
                        type="text"
                        value={config.botBubbleBg}
                        onChange={(e) => updateConfig({ botBubbleBg: e.target.value, themePreset: 'custom' })}
                        className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                  </div>

                  {/* Primary Accent */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Primary Accent</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={config.accentColor.startsWith('#') ? config.accentColor : '#5B3DF5'}
                        onChange={(e) => updateConfig({ accentColor: e.target.value, themePreset: 'custom' })}
                        className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200"
                      />
                      <input
                        type="text"
                        value={config.accentColor}
                        onChange={(e) => updateConfig({ accentColor: e.target.value, themePreset: 'custom' })}
                        className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                  </div>

                  {/* Widget Background */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Widget Body Background</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={config.widgetBgColor.startsWith('#') ? config.widgetBgColor : '#f8fafc'}
                        onChange={(e) => updateConfig({ widgetBgColor: e.target.value, themePreset: 'custom' })}
                        className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200"
                      />
                      <input
                        type="text"
                        value={config.widgetBgColor}
                        onChange={(e) => updateConfig({ widgetBgColor: e.target.value, themePreset: 'custom' })}
                        className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3: WIDGET LAUNCHER BUTTON */}
          {activeSection === 'launcher' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Floating Launcher & Teaser</h3>
                <p className="text-xs text-slate-500 mt-0.5">Customize the trigger button that sits in the corner of your website.</p>
              </div>

              {/* Launcher Icon Choice */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Launcher Button Icon
                </label>
                <div className="grid grid-cols-5 gap-2.5">
                  {[
                    { id: 'chat', label: 'Chat' },
                    { id: 'bot', label: 'Robot' },
                    { id: 'sparkles', label: 'Sparkles' },
                    { id: 'message', label: 'Message' },
                    { id: 'help', label: 'Help' }
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => updateConfig({ launcherIcon: item.id as any })}
                      className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${config.launcherIcon === item.id
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-600 ring-2 ring-indigo-600/20'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                    >
                      {renderLauncherIcon(item.id, 'w-5 h-5')}
                      <span className="text-[11px] font-medium">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Teaser Callout Badge */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">Show Teaser Callout Bubble</label>
                  <input
                    type="checkbox"
                    checked={config.showTeaser}
                    onChange={(e) => updateConfig({ showTeaser: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 rounded-md focus:ring-indigo-500"
                  />
                </div>

                {config.showTeaser && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Teaser Message Text
                    </label>
                    <input
                      type="text"
                      value={config.launcherText}
                      onChange={(e) => updateConfig({ launcherText: e.target.value })}
                      placeholder="e.g. Chat with us! 👋"
                      className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    />
                  </div>
                )}
              </div>

              {/* Position & Shape */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2">Screen Alignment</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => updateConfig({ launcherPosition: 'bottom-right' })}
                      className={`py-2 px-3 text-xs font-medium rounded-xl border transition-all ${config.launcherPosition === 'bottom-right'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-600 font-bold'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                      Bottom Right
                    </button>
                    <button
                      type="button"
                      onClick={() => updateConfig({ launcherPosition: 'bottom-left' })}
                      className={`py-2 px-3 text-xs font-medium rounded-xl border transition-all ${config.launcherPosition === 'bottom-left'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-600 font-bold'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                      Bottom Left
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2">Button Shape</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'circle', label: 'Circle' },
                      { id: 'pill', label: 'Pill' },
                      { id: 'rounded', label: 'Square' }
                    ].map((shape) => (
                      <button
                        key={shape.id}
                        type="button"
                        onClick={() => updateConfig({ launcherShape: shape.id as any })}
                        className={`py-2 text-[11px] font-medium rounded-xl border transition-all ${config.launcherShape === shape.id
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-600 font-bold'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                      >
                        {shape.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Pulse Animation Toggle */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div>
                  <p className="text-xs font-semibold text-slate-700">Pulse Glow Effect</p>
                  <p className="text-[11px] text-slate-500">Adds an animated ripple around launcher button to catch attention.</p>
                </div>
                <input
                  type="checkbox"
                  checked={config.enablePulseAnimation}
                  onChange={(e) => updateConfig({ enablePulseAnimation: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 rounded-md focus:ring-indigo-500"
                />
              </div>
            </div>
          )}

          {/* SECTION 4: TYPOGRAPHY & STYLE */}
          {activeSection === 'typography' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Typography & Corner Roundness</h3>
                <p className="text-xs text-slate-500 mt-0.5">Customize font family and corner geometry of the widget window.</p>
              </div>

              {/* Font Family */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Font Family
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['Inter', 'Outfit', 'Poppins', 'Roboto', 'System'].map((font) => (
                    <button
                      key={font}
                      type="button"
                      onClick={() => updateConfig({ fontFamily: font as any })}
                      className={`p-3 rounded-xl border text-center transition-all ${config.fontFamily === font
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-600 font-bold ring-2 ring-indigo-600/20'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                      <span className="text-sm block" style={{ fontFamily: font === 'System' ? 'sans-serif' : font }}>
                        {font}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Corner Radius */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Corner Roundness (Border Radius)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: '8px', label: 'Compact (8px)' },
                    { id: '16px', label: 'Standard (16px)' },
                    { id: '24px', label: 'Rounded (24px)' },
                    { id: '32px', label: 'Pill (32px)' }
                  ].map((rad) => (
                    <button
                      key={rad.id}
                      type="button"
                      onClick={() => updateConfig({ borderRadius: rad.id as any })}
                      className={`py-2 px-2 text-[11px] font-medium rounded-xl border text-center transition-all ${config.borderRadius === rad.id
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-600 font-bold'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                      {rad.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Shadow Depth */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Container Shadow Effect
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'soft', label: 'Soft Subtle' },
                    { id: 'elevated', label: 'Elevated (Default)' },
                    { id: 'glow', label: 'Neon Glow' }
                  ].map((sh) => (
                    <button
                      key={sh.id}
                      type="button"
                      onClick={() => updateConfig({ shadowStyle: sh.id as any })}
                      className={`py-2.5 px-3 text-xs font-medium rounded-xl border text-center transition-all ${config.shadowStyle === sh.id
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-600 font-bold'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                      {sh.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Interactive Live Preview */}
      <div className="w-1/2 flex flex-col bg-slate-100 p-6 relative overflow-hidden items-center justify-center">
        {/* Top Control Bar for Preview */}
        <div className="absolute top-4 left-6 right-6 flex items-center justify-between bg-white/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-slate-200/80 shadow-xs z-10">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-bold text-slate-800">Live Preview</span>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setPreviewMode('open')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${previewMode === 'open'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
                }`}
            >
              Open Window
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('launcher')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${previewMode === 'launcher'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
                }`}
            >
              Launcher Only
            </button>
          </div>
        </div>

        {/* Dynamic Simulated Background Page */}
        <div className="w-full h-full max-w-md flex flex-col justify-end relative pt-16 pb-4">
          {previewMode === 'open' ? (
            /* SIMULATED OPEN CHAT WIDGET */
            <div
              className="w-full flex flex-col h-[520px] shadow-2xl transition-all overflow-hidden border border-slate-200/80"
              style={{
                borderRadius: config.borderRadius || '16px',
                fontFamily: config.fontFamily === 'System' ? 'sans-serif' : config.fontFamily,
                backgroundColor: config.widgetBgColor || '#f8fafc',
                boxShadow:
                  config.shadowStyle === 'glow'
                    ? `0 20px 50px ${config.accentColor || '#5B3DF5'}40`
                    : config.shadowStyle === 'soft'
                      ? '0 10px 25px rgba(0,0,0,0.08)'
                      : '0 20px 40px rgba(0,0,0,0.18)'
              }}
            >
              {/* Header */}
              <div
                className="p-4 flex items-center justify-between shadow-xs transition-all"
                style={{
                  background: config.headerBgColor || '#5B3DF5',
                  color: config.headerTextColor || '#ffffff'
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center overflow-hidden border border-white/20">
                    {config.avatarPreset === 'custom' && config.avatarUrl ? (
                      <img src={config.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      renderAvatarIcon(config.avatarPreset || 'robot', 'w-5 h-5 text-white')
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm leading-snug">{config.botTitle || botName || 'BotFlow Assistant'}</h4>
                    <p className="text-[10px] opacity-85 font-medium">{config.subtitle || 'Online • Replies instantly'}</p>
                  </div>
                </div>

                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>

              {/* Chat Message Stream */}
              <div className="flex-1 p-4 space-y-3 overflow-y-auto">
                {/* Bot Welcome Message */}
                <div className="flex justify-start">
                  <div
                    className="max-w-[85%] p-3 rounded-2xl text-xs shadow-xs transition-all rounded-tl-none border border-slate-100"
                    style={{
                      background: config.botBubbleBg || '#ffffff',
                      color: config.botBubbleText || '#1e293b'
                    }}
                  >
                    <p className="font-medium">👋 Welcome! How can we assist you today?</p>
                  </div>
                </div>

                {/* User Message */}
                <div className="flex justify-end">
                  <div
                    className="max-w-[85%] p-3 rounded-2xl text-xs shadow-xs transition-all rounded-tr-none"
                    style={{
                      background: config.userBubbleBg || '#5B3DF5',
                      color: config.userBubbleText || '#ffffff'
                    }}
                  >
                    <p className="font-medium">I'd like to learn more about your services.</p>
                  </div>
                </div>

                {/* Bot Response */}
                <div className="flex justify-start">
                  <div
                    className="max-w-[85%] p-3 rounded-2xl text-xs shadow-xs transition-all rounded-tl-none border border-slate-100"
                    style={{
                      background: config.botBubbleBg || '#ffffff',
                      color: config.botBubbleText || '#1e293b'
                    }}
                  >
                    <p className="font-medium">Great! Please select an option below:</p>
                    <div className="mt-2.5 space-y-1.5">
                      {['View Pricing', 'Book Demo Call'].map((opt, i) => (
                        <div
                          key={i}
                          className="p-2 rounded-xl border text-[11px] font-bold flex items-center justify-between"
                          style={{
                            borderColor: config.accentColor ? `${config.accentColor}40` : '#e2e8f0',
                            color: config.accentColor || '#5B3DF5',
                            backgroundColor: config.accentColor ? `${config.accentColor}0a` : '#f8fafc'
                          }}
                        >
                          <span>{opt}</span>
                          <ChevronRight className="w-3 h-3" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Chat Input Bar */}
              <div className="p-3 bg-white border-t border-slate-100 flex items-center gap-2">
                <input
                  type="text"
                  disabled
                  placeholder="Write a message..."
                  className="flex-1 bg-slate-50 px-3.5 py-2 text-xs rounded-xl border border-slate-200 opacity-80"
                />
                <button
                  type="button"
                  className="p-2 rounded-xl text-white shadow-xs"
                  style={{ background: config.accentColor || '#5B3DF5' }}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            /* SIMULATED LAUNCHER BUTTON PREVIEW */
            <div
              className={`w-full flex items-center gap-3 relative ${config.launcherPosition === 'bottom-left' ? 'justify-start' : 'justify-end'
                }`}
            >
              {config.showTeaser && (
                <div className="bg-white px-4 py-2.5 rounded-2xl shadow-xl border border-slate-200/80 text-xs font-semibold text-slate-800 animate-bounce">
                  {config.launcherText || 'Chat with us! 👋'}
                </div>
              )}

              <div className="relative">
                {config.enablePulseAnimation && (
                  <span
                    className="absolute inset-0 rounded-full animate-ping opacity-30"
                    style={{ background: config.accentColor || '#5B3DF5' }}
                  />
                )}
                <div
                  className={`w-14 h-14 text-white flex items-center justify-center shadow-2xl transition-all cursor-pointer ${config.launcherShape === 'pill'
                    ? 'rounded-3xl w-24'
                    : config.launcherShape === 'rounded'
                      ? 'rounded-2xl'
                      : 'rounded-full'
                    }`}
                  style={{ background: config.accentColor || '#5B3DF5' }}
                >
                  {renderLauncherIcon(config.launcherIcon || 'chat', 'w-6 h-6')}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
