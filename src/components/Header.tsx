import React, { useState, useEffect } from 'react';
import { HelpCircle, RotateCcw, Zap, Palette, Radio, Pause } from 'lucide-react';
import type { AirportClosure } from '../types';
import { THEME_PRESETS, applyTheme, getSavedTheme } from '../theme/presets';

interface HeaderProps {
  closure: AirportClosure | null;
  onSelectPreset: (presetId: string) => void;
  onReset: () => void;
  onOpenAssumptions: () => void;
  onToggleReducedMotion: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  closure,
  onSelectPreset,
  onReset,
  onOpenAssumptions,
  onToggleReducedMotion,
}) => {
  const [currentTheme, setCurrentTheme] = useState('night-ops');
  const [currentTime, setCurrentTime] = useState('14:30:00');

  useEffect(() => {
    const saved = getSavedTheme();
    setCurrentTheme(saved);
    applyTheme(saved);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toTimeString().split(' ')[0]);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleThemeChange = (themeId: string) => {
    setCurrentTheme(themeId);
    applyTheme(themeId);
  };

  const isDisrupted = closure !== null;

  return (
    <header className="border-b border-line bg-surface/90 backdrop-blur-md px-6 py-3.5 sticky top-0 z-40 flex flex-wrap items-center justify-between gap-4">
      {/* Brand */}
      <div className="flex items-center gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-accent-muted border border-accent/40 flex items-center justify-center text-accent shadow-sm" aria-hidden="true">
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-6 rounded-sm bg-accent rotate-[-15deg] transform shadow-xs"></div>
            <div className="w-2.5 h-6 rounded-sm bg-accent/80 rotate-[-5deg] transform shadow-xs"></div>
            <div className="w-2.5 h-6 rounded-sm bg-accent/50 rotate-[10deg] transform shadow-xs"></div>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-base font-extrabold tracking-wider text-primary uppercase">
              Domino Sky
            </h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-accent-muted text-accent border border-accent/40 font-bold uppercase tracking-widest">
              Ops Center
            </span>

            {/* Network Status Pill */}
            <div
              role="status"
              aria-label={isDisrupted ? 'Network disrupted' : 'Network nominal'}
              className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border transition-colors ${
                isDisrupted
                  ? 'bg-danger-muted text-danger border-danger/50 animate-pulse'
                  : 'bg-ok-muted text-ok border-ok/50'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isDisrupted ? 'bg-danger' : 'bg-ok'}`} aria-hidden="true"></span>
              <span>{isDisrupted ? 'DISRUPTED' : 'NOMINAL'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted font-mono mt-0.5">
            <Radio className="w-3 h-3 text-accent animate-pulse" aria-hidden="true" />
            <span>IST Clock:</span>
            <span className="text-primary font-bold" aria-label={`Current time ${currentTime}`}>{currentTime}</span>
          </div>
        </div>
      </div>

      {/* Preset Scenarios */}
      <nav aria-label="Scenario presets" className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-mono text-muted flex items-center gap-1 mr-1">
          <Zap className="w-3.5 h-3.5 text-warn" aria-hidden="true" /> Presets:
        </span>
        <button
          onClick={() => onSelectPreset('preset_mumbai_storm')}
          aria-label="Mumbai Thunderstorm: BOM closed 14:00 to 15:30"
          className="text-xs px-3 min-h-[44px] rounded-xl bg-panel hover:bg-surface text-primary border border-line hover:border-accent/50 transition font-medium flex items-center gap-1.5"
        >
          <span className="w-2 h-2 rounded-full bg-warn" aria-hidden="true"></span>
          Mumbai Storm
        </button>
        <button
          onClick={() => onSelectPreset('preset_delhi_fog')}
          aria-label="Delhi Dense Fog: DEL closed 06:00 to 08:30"
          className="text-xs px-3 min-h-[44px] rounded-xl bg-panel hover:bg-surface text-primary border border-line hover:border-accent/50 transition font-medium flex items-center gap-1.5"
        >
          <span className="w-2 h-2 rounded-full bg-accent" aria-hidden="true"></span>
          Delhi Fog
        </button>
        <button
          onClick={() => onSelectPreset('preset_blr_surge')}
          aria-label="Bengaluru Airspace Hold: BLR closed 12:00 to 14:00"
          className="text-xs px-3 min-h-[44px] rounded-xl bg-panel hover:bg-surface text-primary border border-line hover:border-accent/50 transition font-medium flex items-center gap-1.5"
        >
          <span className="w-2 h-2 rounded-full bg-info" aria-hidden="true"></span>
          Bengaluru Hold
        </button>
      </nav>

      {/* Controls */}
      <div className="flex items-center gap-2.5 flex-wrap">
        {/* Theme Switcher */}
        <div className="flex items-center gap-1 bg-panel border border-line rounded-xl p-1" role="group" aria-label="Theme selector">
          <Palette className="w-3.5 h-3.5 text-muted ml-1.5 mr-0.5" aria-hidden="true" />
          {THEME_PRESETS.map((t) => (
            <button
              key={t.id}
              onClick={() => handleThemeChange(t.id)}
              aria-label={`Switch to ${t.name} theme`}
              aria-pressed={currentTheme === t.id}
              className={`text-xs font-mono px-2 py-1 min-h-[44px] rounded-lg transition flex items-center gap-1.5 ${
                currentTheme === t.id
                  ? 'bg-surface text-accent font-bold shadow-xs border border-line'
                  : 'text-muted hover:text-primary'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${t.badgeDot}`} aria-hidden="true"></span>
              <span>{t.name}</span>
            </button>
          ))}
        </div>

        {/* Reduced Motion Toggle */}
        <button
          onClick={onToggleReducedMotion}
          aria-label="Toggle animations on or off"
          className="text-xs px-3 min-h-[44px] rounded-xl bg-panel hover:bg-surface text-muted border border-line hover:border-line-strong flex items-center gap-1.5 transition font-medium"
        >
          <Pause className="w-3.5 h-3.5" aria-hidden="true" />
          Motion
        </button>

        {closure && (
          <button
            onClick={onReset}
            aria-label="Reset closure and return to baseline"
            className="text-xs px-3 min-h-[44px] rounded-xl bg-closed-muted hover:bg-closed/30 text-closed border border-closed/40 flex items-center gap-1.5 transition font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Reset
          </button>
        )}

        <button
          onClick={onOpenAssumptions}
          aria-label="View operational rules and assumptions"
          className="text-xs px-3 min-h-[44px] rounded-xl bg-panel hover:bg-surface text-primary border border-line hover:border-line-strong flex items-center gap-1.5 transition font-medium"
        >
          <HelpCircle className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
          Assumptions
        </button>
      </div>
    </header>
  );
};
