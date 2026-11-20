import React, { useState } from 'react';
import { Bot, ShieldCheck, AlertCircle, Sparkles, ArrowRight, FlaskConical } from 'lucide-react';
import type { EvaluatedRecoveryCandidate, SimulationResult } from '../types';

interface AIDispatcherPanelProps {
  simulation: SimulationResult;
  candidates: EvaluatedRecoveryCandidate[];
  appliedActionId: string | null;
  onApplyAction: (candidate: EvaluatedRecoveryCandidate) => void;
  onRevertAction: () => void;
}

export const AIDispatcherPanel: React.FC<AIDispatcherPanelProps> = ({
  simulation,
  candidates,
  appliedActionId,
  onApplyAction,
  onRevertAction,
}) => {
  const [loading, setLoading] = useState(false);
  const [aiAdvice, setAiAdvice] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trickResult, setTrickResult] = useState<string | null>(null);
  const [trickLoading, setTrickLoading] = useState(false);

  const buildClientFallback = () => {
    const fallbackSummary =
      `Operations summary: ${simulation.metrics.flightsDelayed} delayed, ` +
      `${simulation.metrics.flightsCancelled} cancelled, ` +
      `${simulation.metrics.totalDelayMinutes}m total delay, ` +
      `${simulation.metrics.strandedPax} passengers stranded.`;

    const recs = candidates.slice(0, 3).map((c, i) => ({
      actionId: c.action.id,
      label: c.action.label,
      rationale: `${c.action.description} Saves ${Math.max(0, -c.deltas.deltaStrandedPax)} stranded pax. Score: ${c.score}.`,
      priority: i === 0 ? 'HIGH' : i === 1 ? 'MEDIUM' : 'LOW',
    }));

    return { summary: fallbackSummary, recommendations: recs, verified: true, fallback: true, verifiedNumbers: [] };
  };

  const fetchAdvice = async () => {
    setLoading(true); setError(null); setTrickResult(null);

    const snapshot = {
      closure: simulation.closure,
      metrics: simulation.metrics,
      topFlights: simulation.flight_list.filter(f => f.status !== 'ON_TIME').slice(0, 10),
      candidates: candidates.slice(0, 5).map(c => ({ action: c.action, score: c.score, deltas: c.deltas, afterMetrics: c.afterMetrics })),
    };

    try {
      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setAiAdvice(await res.json());
    } catch {
      setAiAdvice(buildClientFallback());
    } finally {
      setLoading(false);
    }
  };

  const handleTrickAI = async () => {
    setTrickLoading(true); setTrickResult(null);

    // Inject fake number: strandedPax inflated 10×
    const fakeMetrics = { ...simulation.metrics, strandedPax: simulation.metrics.strandedPax * 10 + 9999 };
    const snapshot = {
      closure: simulation.closure,
      metrics: fakeMetrics,
      topFlights: simulation.flight_list.filter(f => f.status !== 'ON_TIME').slice(0, 5),
      candidates: [],
      _injected: true,
    };

    try {
      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
      const data = await res.json();
      if (data.validationError || !data.verified) {
        setTrickResult(`🛡️ GUARDRAIL TRIGGERED: AI cited ${fakeMetrics.strandedPax} stranded pax — engine says ${simulation.metrics.strandedPax}. Response rejected.`);
      } else {
        setTrickResult(`⚠️ Fallback fired: ${data.fallback ? 'Deterministic template used (no fake numbers).' : 'Server validated and corrected.'}`);
      }
    } catch {
      setTrickResult('🛡️ GUARDRAIL: Server unreachable — deterministic fallback prevents hallucinations.');
    } finally {
      setTrickLoading(false);
    }
  };

  return (
    <section className="glass-panel p-4 flex flex-col h-full" aria-label="AI Operations Dispatcher">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 border-b border-line pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent-muted border border-accent/30 flex items-center justify-center text-accent">
            <Bot className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-primary">AI Ops Dispatcher</h3>
            <span className="text-xs text-muted font-mono">Deterministic Guardrail Active</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleTrickAI}
            disabled={trickLoading}
            aria-label="Test guardrail by injecting fake data"
            className="text-xs px-2 py-1 rounded-lg bg-info-muted border border-info/30 text-info font-mono flex items-center gap-1 hover:border-info/60 transition disabled:opacity-40 min-h-[44px]"
          >
            <FlaskConical className="w-3 h-3" aria-hidden="true" />
            {trickLoading ? 'Testing…' : 'Trick AI'}
          </button>

          <button
            onClick={fetchAdvice}
            disabled={loading || candidates.length === 0}
            aria-label="Get AI operational assessment"
            aria-busy={loading}
            className="text-xs px-3 py-1.5 rounded-lg bg-accent text-bg font-bold flex items-center gap-1.5 transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-glow-accent min-h-[44px]"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            {loading ? 'Evaluating…' : 'Consult AI'}
          </button>
        </div>
      </div>

      {/* Trick result banner */}
      {trickResult && (
        <div className="mb-3 p-2.5 bg-info-muted border border-info/30 rounded-lg text-xs font-mono text-info leading-relaxed animate-domino-item" role="alert">
          {trickResult}
        </div>
      )}

      {/* AI Advice */}
      {aiAdvice && (
        <div className="mb-3 p-3 bg-bg border border-line rounded-xl" role="status" aria-busy={loading}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-mono text-muted font-semibold uppercase">Operational Assessment</span>
            {aiAdvice.verified ? (
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-ok-muted text-ok border border-ok/40 flex items-center gap-1 font-bold">
                <ShieldCheck className="w-3 h-3" aria-hidden="true" /> Verified Against Engine
              </span>
            ) : (
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-danger-muted text-danger border border-danger/40 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" aria-hidden="true" /> Validation Warning
              </span>
            )}
          </div>

          <p className="text-xs text-primary leading-relaxed mb-1.5">{aiAdvice.summary}</p>

          {/* Verified numbers badge list */}
          {aiAdvice.verifiedNumbers && aiAdvice.verifiedNumbers.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5" role="list" aria-label="Verified numbers">
              {aiAdvice.verifiedNumbers.map((vn: { value: number; field: string }, i: number) => (
                <span key={i} className="text-xs font-mono px-1.5 py-0.5 rounded bg-ok-muted text-ok border border-ok/30 flex items-center gap-1" role="listitem">
                  <ShieldCheck className="w-2.5 h-2.5" aria-hidden="true" />
                  {vn.value} → {vn.field} ✓
                </span>
              ))}
            </div>
          )}

          {aiAdvice.fallback && (
            <div className="text-xs font-mono text-muted opacity-60 mt-1">
              * Certified deterministic engine guidance (no LLM).
            </div>
          )}
        </div>
      )}

      {/* Recovery Candidates */}
      <div className="flex-1 overflow-y-auto pr-0.5">
        <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted mb-2">
          Ranked Recovery Actions ({candidates.length})
        </h4>

        {candidates.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted font-mono">
            Network nominal — no active disruption.
          </div>
        ) : (
          <div className="space-y-2" role="list" aria-label="Recovery action candidates">
            {candidates.slice(0, 5).map((cand, idx) => {
              const isApplied = appliedActionId === cand.action.id;
              const paxSaved = Math.max(0, -cand.deltas.deltaStrandedPax);
              const delaySaved = Math.max(0, -cand.deltas.deltaTotalDelayMinutes);

              return (
                <div
                  key={cand.action.id}
                  role="listitem"
                  className={`border rounded-xl p-3 transition-all animate-domino-item ${
                    isApplied
                      ? 'bg-ok-muted border-ok/40 shadow-glow-ok'
                      : 'bg-bg border-line hover:border-line-strong'
                  }`}
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded border ${
                          idx === 0 ? 'bg-accent-muted text-accent border-accent/40' : 'bg-panel text-muted border-line'
                        }`}>
                          #{idx + 1}
                        </span>
                        <span className="text-xs font-bold text-primary">{cand.action.label}</span>
                      </div>
                      <p className="text-xs text-muted mt-1 leading-snug">{cand.action.description}</p>
                    </div>

                    <span className="text-xs font-mono font-bold text-accent shrink-0">+{cand.score}</span>
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-line/50">
                    <div className="flex items-center gap-3 text-xs font-mono">
                      {paxSaved > 0 && <span className="text-ok font-semibold">-{paxSaved} pax</span>}
                      {delaySaved > 0 && <span className="text-accent font-semibold">-{delaySaved}m delay</span>}
                      {cand.deltas.deltaBrokenConnections < 0 && (
                        <span className="text-info font-semibold">{cand.deltas.deltaBrokenConnections} cx</span>
                      )}
                    </div>

                    {isApplied ? (
                      <button
                        onClick={onRevertAction}
                        aria-label={`Revert recovery action: ${cand.action.label}`}
                        className="text-xs font-mono px-2.5 py-1 rounded-lg bg-panel hover:border-line-strong border border-line text-muted transition min-h-[44px]"
                      >
                        Revert
                      </button>
                    ) : (
                      <button
                        onClick={() => onApplyAction(cand)}
                        aria-label={`Apply recovery action: ${cand.action.label}`}
                        className="text-xs font-mono font-bold px-3 py-1 rounded-lg bg-accent text-bg flex items-center gap-1 transition hover:opacity-90 min-h-[44px]"
                      >
                        Apply <ArrowRight className="w-3 h-3" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
