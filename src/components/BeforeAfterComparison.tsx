import React from 'react';
import { ArrowRight, CheckCircle2, RotateCcw } from 'lucide-react';
import type { EvaluatedRecoveryCandidate } from '../types';

interface BeforeAfterComparisonProps {
  candidate: EvaluatedRecoveryCandidate;
  onRevert: () => void;
}

export const BeforeAfterComparison: React.FC<BeforeAfterComparisonProps> = ({ candidate, onRevert }) => {
  const { beforeMetrics: before, afterMetrics: after, deltas } = candidate;

  const rows = [
    { label: 'Stranded Pax', before: before.strandedPax, after: after.strandedPax, delta: deltas.deltaStrandedPax, unit: 'pax', isGood: deltas.deltaStrandedPax < 0 },
    { label: 'Total Delay', before: before.totalDelayMinutes, after: after.totalDelayMinutes, delta: deltas.deltaTotalDelayMinutes, unit: 'min', isGood: deltas.deltaTotalDelayMinutes < 0 },
    { label: 'Cancelled', before: before.flightsCancelled, after: after.flightsCancelled, delta: deltas.deltaFlightsCancelled, unit: 'flights', isGood: deltas.deltaFlightsCancelled <= 0 },
    { label: 'Broken Cx', before: before.brokenConnections, after: after.brokenConnections, delta: deltas.deltaBrokenConnections, unit: 'cx', isGood: deltas.deltaBrokenConnections < 0 },
  ];

  return (
    <div
      className="bg-ok-muted border border-ok/40 rounded-2xl p-4 shadow-glow-ok animate-domino-item"
      aria-label={`Recovery action comparison: ${candidate.action.label}`}
      role="region"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 border-b border-ok/20 pb-2.5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-ok" aria-hidden="true" />
          <div>
            <h3 className="text-xs font-bold text-ok uppercase tracking-wider">
              Recovery Applied: <span className="text-primary font-mono">{candidate.action.label}</span>
            </h3>
            <p className="text-xs text-muted">{candidate.action.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono font-bold text-accent bg-accent-muted px-2.5 py-1 rounded-lg border border-accent/30">
            Score +{candidate.score}
          </span>
          <button
            onClick={onRevert}
            aria-label="Revert recovery action and return to disrupted state"
            className="text-xs px-3 py-1.5 rounded-lg bg-panel hover:border-line-strong border border-line text-muted flex items-center gap-1.5 transition min-h-[44px]"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Revert
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {rows.map((r, i) => {
          const deltaDirection = r.delta < 0 ? 'Reduced' : r.delta > 0 ? 'Increased' : 'No change';
          const deltaLabel = `${r.label}: ${deltaDirection} by ${Math.abs(r.delta)} ${r.unit}, from ${r.before} to ${r.after}`;

          return (
            <div key={i} className="bg-bg border border-line rounded-xl p-2.5 flex flex-col gap-1" aria-label={deltaLabel}>
              <span className="text-xs uppercase tracking-wider font-semibold text-muted">{r.label}</span>
              <div className="flex items-center gap-2 font-mono">
                <span className="text-sm text-muted line-through tabular-nums">{r.before.toLocaleString()}</span>
                <ArrowRight className="w-3 h-3 text-muted shrink-0" aria-hidden="true" />
                <span className={`text-base font-bold tabular-nums ${r.isGood ? 'text-ok' : 'text-danger'}`}>
                  {r.after.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-end">
                <span
                  className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded border ${
                    r.isGood
                      ? 'bg-ok-muted text-ok border-ok/40'
                      : r.delta === 0
                      ? 'bg-panel text-muted border-line'
                      : 'bg-danger-muted text-danger border-danger/40'
                  }`}
                  aria-label={`${r.delta > 0 ? '+' : ''}${r.delta} ${r.unit}`}
                >
                  {r.delta > 0 ? `+${r.delta}` : r.delta} {r.unit}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
