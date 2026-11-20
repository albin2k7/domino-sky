import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateAINumbers, extractNumbersFromText } from '../server/validator.ts';
import { generateDeterministicFallback } from '../server/fallback.ts';

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
    assert.ok(nums.includes(480));
    assert.ok(nums.includes(151));
    assert.ok(nums.includes(14));
  });

  it('accepts text where all numbers come strictly from the snapshot', () => {
    const validText = 'Due to the BOM closure, 8 flights are delayed and 1 flight is cancelled, resulting in 480 total delay minutes and 151 stranded passengers. Recommended hold saves 25 passengers.';
    const result = validateAINumbers(validText, sampleSnapshot);
    assert.strictEqual(result.valid, true, 'Should pass verification when all numbers are valid');
    assert.strictEqual(result.unauthorizedNumbers.length, 0);
  });

  it('rejects text containing hallucinated numbers', () => {
    const hallucinatedText = 'There are 999 stranded passengers and a total of 12500 delay minutes.';
    const result = validateAINumbers(hallucinatedText, sampleSnapshot);
    assert.strictEqual(result.valid, false, 'Must reject hallucinated numbers');
    assert.ok(result.unauthorizedNumbers.includes(999));
    assert.ok(result.unauthorizedNumbers.includes(12500));
  });

  it('deterministic fallback template generates 100% verified advice', () => {
    const fallback = generateDeterministicFallback(sampleSnapshot);
    assert.strictEqual(fallback.verified, true);
    assert.strictEqual(fallback.fallback, true);
    assert.ok(fallback.recommendations.length > 0);

    const validation = validateAINumbers(fallback.summary, sampleSnapshot);
    assert.strictEqual(validation.valid, true, 'Fallback summary must contain only valid numbers');
  });
});
