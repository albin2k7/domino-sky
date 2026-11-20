import React, { useEffect, useRef, useState } from 'react';
import { Clock, Users, XCircle, AlertCircle, Share2, UserCheck } from 'lucide-react';
import type { NetworkMetrics, MetricsDelta } from '../types';

function useCountUp(target: number, duration = 600) {
  const [val, setVal] = useState(target);
  const prev = useRef(target);
  const raf = useRef<number>(0);

  useEffect(() => {
    const start = prev.current;
    const diff = target - start;
    if (diff === 0) return;
    const startTime = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(start + diff * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else { prev.current = target; setVal(target); }
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);

  return val;
}

interface KPICardsProps {
  metrics: NetworkMetrics;
  previewDeltas?: MetricsDelta | null;
}

interface CardCfg {
  label: string;
  value: number;
  delta?: number;
  unit: string;
  Icon: React.FC<{ className?: string }>;
  warnLevel: 'danger' | 'warn' | 'info' | 'none';
}

const Card: React.FC<CardCfg & { idx: number }> = ({ label, value, delta, unit, Icon, warnLevel, idx }) => {
  const displayed = useCountUp(value);

  const borderCls = warnLevel === 'danger' ? 'border-danger/40'
    : warnLevel === 'warn' ? 'border-warn/40'
    : warnLevel === 'info' ? 'border-info/30'
    : 'border-line';

  const glowCls = warnLevel === 'danger' ? 'shadow-glow-danger'
    : warnLevel === 'warn' ? 'shadow-glow-warn'
    : '';

  const valueCls = warnLevel === 'danger' ? 'text-danger'
    : warnLevel === 'warn' ? 'text-warn'
    : warnLevel === 'info' ? 'text-info'
    : 'text-primary';

  const iconCls = warnLevel === 'danger' ? 'text-danger'
    : warnLevel === 'warn' ? 'text-warn'
    : warnLevel === 'info' ? 'text-info'
    : 'text-muted';

  const bgCls = warnLevel === 'danger' ? 'bg-danger-muted'
    : warnLevel === 'warn' ? 'bg-warn-muted'
    : warnLevel === 'info' ? 'bg-info-muted'
    : 'bg-panel';

  const deltaDescription = delta !== undefined && delta !== 0
    ? `, ${delta > 0 ? 'increased' : 'decreased'} by ${Math.abs(delta)}`
    : '';

  return (
    <div
      className={`animate-domino-item border rounded-2xl p-3 flex flex-col justify-between transition-all ${borderCls} ${bgCls} ${glowCls}`}
      style={{ animationDelay: `${idx * 40}ms` }}
      role="status"
      aria-label={`${label}: ${displayed.toLocaleString()} ${unit}${deltaDescription}`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-muted uppercase tracking-wider">{label}</span>
        <Icon className={`w-4 h-4 ${iconCls}`} aria-hidden="true" />
      </div>

      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className={`text-2xl font-mono font-bold tabular-nums ${valueCls}`}>
          {displayed.toLocaleString()}
        </span>
        <span className="text-xs font-mono text-muted">{unit}</span>

        {delta !== undefined && delta !== 0 && (
          <span
            className={`ml-auto text-xs font-mono font-bold px-1.5 py-0.5 rounded border ${
              delta < 0
                ? 'bg-ok-muted text-ok border-ok/40'
                : 'bg-danger-muted text-danger border-danger/40'
            }`}
            aria-label={`Change: ${delta > 0 ? '+' : ''}${delta} ${unit}`}
          >
            {delta > 0 ? `+${delta}` : delta}
          </span>
        )}
      </div>
    </div>
  );
};

export const KPICards: React.FC<KPICardsProps> = ({ metrics, previewDeltas }) => {
  const cards: (CardCfg & { idx: number })[] = [
    {
      idx: 0,
      label: 'Stranded Passengers',
      value: metrics.strandedPax,
      delta: previewDeltas?.deltaStrandedPax,
      unit: 'pax',
      Icon: Users,
      warnLevel: metrics.strandedPax > 100 ? 'danger' : metrics.strandedPax > 0 ? 'warn' : 'none',
    },
    {
      idx: 1,
      label: 'Total Delay',
      value: metrics.totalDelayMinutes,
      delta: previewDeltas?.deltaTotalDelayMinutes,
      unit: 'min',
      Icon: Clock,
      warnLevel: metrics.totalDelayMinutes > 500 ? 'danger' : metrics.totalDelayMinutes > 0 ? 'warn' : 'none',
    },
    {
      idx: 2,
      label: 'Flights Delayed',
      value: metrics.flightsDelayed,
      unit: `/${metrics.totalFlights}`,
      Icon: AlertCircle,
      warnLevel: metrics.flightsDelayed > 10 ? 'danger' : metrics.flightsDelayed > 0 ? 'warn' : 'none',
    },
    {
      idx: 3,
      label: 'Flights Cancelled',
      value: metrics.flightsCancelled,
      delta: previewDeltas?.deltaFlightsCancelled,
      unit: 'legs',
      Icon: XCircle,
      warnLevel: metrics.flightsCancelled > 0 ? 'danger' : 'none',
    },
    {
      idx: 4,
      label: 'Broken Connections',
      value: metrics.brokenConnections,
      delta: previewDeltas?.deltaBrokenConnections,
      unit: 'missed',
      Icon: Share2,
      warnLevel: metrics.brokenConnections > 0 ? 'info' : 'none',
    },
    {
      idx: 5,
      label: 'Crews at Limit',
      value: metrics.crewsAtLimit,
      delta: previewDeltas?.deltaCrewsAtLimit,
      unit: 'crews',
      Icon: UserCheck,
      warnLevel: metrics.crewsAtLimit > 0 ? 'warn' : 'none',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" role="region" aria-label="Key performance indicators">
      {cards.map((c) => <Card key={c.label} {...c} />)}
    </div>
  );
};
