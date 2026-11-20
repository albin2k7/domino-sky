import { describe, it, expect } from 'vitest';
import { validateAINumbers, extractNumbersFromText } from '../server/validator';
import { generateDeterministicFallback } from '../server/fallback';

describe('Phase 5: AI Number Validator & Guardrails', () => {
  const sampleSnapshot = {
    closure: { airport_id: 'BOM', start_time: '14:00', end_time: '15:30' },
    metrics: {
      totalFlights: 70,
      flightsDelayed: 8,
      flightsCancelled: 1,
      totalDelayMinutes: 480,
      strandedPax: 151,
      brokenConnections: 2,
      crewsAtLimit: 1,
      airportsAffected: ['BOM', 'GOI', 'PNQ', 'AMD'],
    },
    topFlights: [
      { flight_id: 'DS0204', delay_dep_min: 90, stranded_pax: 151, scheduled_dep: '12:30', actual_dep: '14:00' },
      { flight_id: 'DS0405', delay_dep_min: 75, stranded_pax: 0, scheduled_dep: '14:45', actual_dep: '16:00' },
    ],
    candidates: [
      {
        action: { id: 'hold_DS0704_15m', label: 'Hold DS0704' },
        score: 185,
        deltas: { deltaTotalDelayMinutes: 15, deltaStrandedPax: -25, deltaFlightsCancelled: 0, score: 185 },
      },
    ],
  };

  it('extracts numbers and times correctly from text', () => {
    const text = 'At 14:00, BOM closure caused 480 minutes of delay and 151 stranded passengers.';
    const nums = extractNumbersFromText(text);
    expect(nums).toContain(480);
    expect(nums).toContain(151);
    expect(nums).toContain(14);
  });

  it('accepts text where all numbers come strictly from the snapshot', () => {
    const validText = 'Due to the BOM closure, 8 flights are delayed and 1 flight is cancelled, resulting in 480 total delay minutes and 151 stranded passengers. Recommended hold saves 25 passengers.';
    const result = validateAINumbers(validText, sampleSnapshot);
    expect(result.valid).toBe(true);
    expect(result.unauthorizedNumbers).toHaveLength(0);
  });

  it('rejects text containing hallucinated numbers', () => {
    const hallucinatedText = 'There are 999 stranded passengers and a total of 12500 delay minutes.';
    const result = validateAINumbers(hallucinatedText, sampleSnapshot);
    expect(result.valid).toBe(false);
    expect(result.unauthorizedNumbers).toContain(999);
    expect(result.unauthorizedNumbers).toContain(12500);
  });

  it('deterministic fallback template generates 100% verified advice', () => {
    const fallback = generateDeterministicFallback(sampleSnapshot);
    expect(fallback.verified).toBe(true);
    expect(fallback.fallback).toBe(true);
    expect(fallback.recommendations.length).toBeGreaterThan(0);

    const validation = validateAINumbers(fallback.summary, sampleSnapshot);
    expect(validation.valid).toBe(true);
  });
});
