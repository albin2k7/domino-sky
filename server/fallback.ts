/**
 * Deterministic Dispatcher Fallback Template
 * 
 * Used when the LLM API is unavailable, times out, or fails strict number validation.
 * Uses only 100% ground-truth engine metrics and candidate evaluations.
 */

export interface DispatchResponse {
  summary: string;
  recommendations: Array<{
    actionId: string;
    label: string;
    rationale: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    expectedImpact: {
      strandedPaxSaved: number;
      delayMinutesReduced: number;
      score: number;
    };
  }>;
  verified: boolean;
  fallback: boolean;
}

export function generateDeterministicFallback(snapshot: any): DispatchResponse {
  const closure = snapshot.closure;
  const metrics = snapshot.metrics;
  const candidates = snapshot.candidates || [];

  const closureDesc = closure 
    ? `${closure.airport_id} closure (${closure.start_time} - ${closure.end_time})` 
    : 'network operational condition';

  const summary = `Operations summary for ${closureDesc}: ${metrics.flightsDelayed} flights delayed, ` +
    `${metrics.flightsCancelled} flights cancelled, ${metrics.totalDelayMinutes} total delay minutes, ` +
    `and ${metrics.strandedPax} passengers stranded across ${metrics.airportsAffected.length} airports. ` +
    `${metrics.crewsAtLimit} crew duty limit violations recorded.`;

  const recommendations = candidates.slice(0, 3).map((cand: any, idx: number) => {
    const priority = idx === 0 ? 'HIGH' : idx === 1 ? 'MEDIUM' : 'LOW';
    const paxSaved = Math.max(0, -cand.deltas.deltaStrandedPax);
    const delaySaved = Math.max(0, -cand.deltas.deltaTotalDelayMinutes);

    return {
      actionId: cand.action.id,
      label: cand.action.label,
      rationale: `${cand.action.description} This action yields an improvement score of ${cand.score}, ` +
        `saving ${paxSaved} stranded passengers and reducing delay by ${delaySaved} minutes.`,
      priority: priority as 'HIGH' | 'MEDIUM' | 'LOW',
      expectedImpact: {
        strandedPaxSaved: paxSaved,
        delayMinutesReduced: delaySaved,
        score: cand.score,
      },
    };
  });

  return {
    summary,
    recommendations,
    verified: true,
    fallback: true,
  };
}
