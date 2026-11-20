import React, { useEffect, useRef } from 'react';
import { X, Shield, Clock, Users, Ban, PlaneTakeoff, Scale } from 'lucide-react';
import { DEFAULT_ASSUMPTIONS } from '../config/assumptions';

interface AssumptionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AssumptionsDrawer: React.FC<AssumptionsDrawerProps> = ({ isOpen, onClose }) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      // Focus close button after render
      requestAnimationFrame(() => closeButtonRef.current?.focus());
    } else if (previousFocusRef.current instanceof HTMLElement) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const rules = [
    {
      icon: Clock,
      colorCls: 'text-accent',
      bgCls: 'bg-accent-muted border-accent/30',
      valueBg: 'bg-accent-muted text-accent border-accent/40',
      label: 'MIN_TURNAROUND',
      value: `${DEFAULT_ASSUMPTIONS.MIN_TURNAROUND} minutes`,
      desc: 'Physical minimum ground time between aircraft arrival and next departure. Absorbs minor delays if scheduled buffer exceeds 30m.',
    },
    {
      icon: Users,
      colorCls: 'text-info',
      bgCls: 'bg-info-muted border-info/30',
      valueBg: 'bg-info-muted text-info border-info/40',
      label: 'MIN_CREW_TURN / MCT',
      value: `${DEFAULT_ASSUMPTIONS.MIN_CREW_TURN}m / ${DEFAULT_ASSUMPTIONS.DEFAULT_MIN_CONNECTION_TIME}m`,
      desc: 'Crew rest/briefing between legs is 30 min. Passenger Minimum Connection Time is 45m (mega hub) / 40m (regional). Below MCT = broken connection.',
    },
    {
      icon: Clock,
      colorCls: 'text-warn',
      bgCls: 'bg-warn-muted border-warn/30',
      valueBg: 'bg-warn-muted text-warn border-warn/40',
      label: 'MAX_CREW_DUTY_MIN',
      value: `${DEFAULT_ASSUMPTIONS.MAX_CREW_DUTY_MIN} minutes (10h)`,
      desc: 'DGCA domestic multi-sector Flight Duty Period. Calculated from 45m before first departure to actual arrival of last leg. Overruns = duty violation.',
    },
    {
      icon: Ban,
      colorCls: 'text-danger',
      bgCls: 'bg-danger-muted border-danger/30',
      valueBg: 'bg-danger-muted text-danger border-danger/40',
      label: 'CANCEL_THRESHOLD_MIN',
      value: `${DEFAULT_ASSUMPTIONS.CANCEL_THRESHOLD_MIN} minutes (4h)`,
      desc: 'If cumulative departure delay exceeds 240 minutes, the flight is automatically cancelled due to airport slot loss and crew duty expiration.',
    },
    {
      icon: PlaneTakeoff,
      colorCls: 'text-muted',
      bgCls: 'bg-panel border-line',
      valueBg: 'bg-panel text-muted border-line',
      label: 'Closure Semantics (GDP)',
      value: 'Ground Delay Program',
      desc: 'Flights destined for a closed airport are held at origin to arrive after reopening. Departures at a closed airport are gate-held until reopening.',
    },
    {
      icon: Scale,
      colorCls: 'text-ok',
      bgCls: 'bg-ok-muted border-ok/30',
      valueBg: 'bg-ok-muted text-ok border-ok/40',
      label: 'Recovery Weights',
      value: 'Objective Function',
      desc: undefined,
      weights: [
        { k: 'Stranded Pax', v: '×10.0', cls: 'text-accent' },
        { k: 'Cancellation', v: '×1000.0', cls: 'text-danger' },
        { k: 'Delay Minute', v: '×1.0', cls: 'text-warn' },
        { k: 'Crew Violation', v: '×500.0', cls: 'text-warn' },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-bg/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-surface border-l border-line p-6 overflow-y-auto shadow-2xl flex flex-col gap-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assumptions-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-line">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-accent-muted border border-accent/30 flex items-center justify-center text-accent">
              <Shield className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="assumptions-title" className="text-sm font-bold uppercase tracking-wider text-primary">Operational Rules</h2>
              <span className="text-xs font-mono text-accent">/src/config/assumptions.ts</span>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close operational rules panel"
            className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-panel border border-transparent hover:border-line transition min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Rules */}
        <div className="space-y-3 text-xs">
          {rules.map((rule, i) => {
            const Icon = rule.icon;
            return (
              <div key={i} className={`p-3 border rounded-xl ${rule.bgCls}`}>
                <div className="flex items-center justify-between font-mono font-bold mb-1.5">
                  <span className={`flex items-center gap-1.5 ${rule.colorCls}`}>
                    <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                    {rule.label}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded border ${rule.valueBg}`}>
                    {rule.value}
                  </span>
                </div>
                {rule.desc && (
                  <p className="text-muted leading-relaxed text-xs">{rule.desc}</p>
                )}
                {rule.weights && (
                  <div className="grid grid-cols-2 gap-2 mt-2 font-mono text-xs">
                    {rule.weights.map((w, j) => (
                      <div key={j} className="bg-bg rounded-lg p-1.5 text-muted">
                        {w.k}: <span className={`font-bold ${w.cls}`}>{w.v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-line flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-panel hover:border-line-strong border border-line text-muted rounded-xl text-xs font-mono font-semibold transition min-h-[44px]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
