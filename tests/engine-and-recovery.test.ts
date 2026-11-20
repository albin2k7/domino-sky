import { describe, it, expect } from 'vitest';
import rawDataset from '../data/dataset.json';
import { simulate } from '../src/engine/simulate';
import {
  generateRecoveryCandidates,
  cancelFlight,
  swapInSpareAircraft,
} from '../src/engine/recovery';
import { Scenario } from '../src/types';

describe('Phase 2: Deterministic Simulation Engine', () => {
  const scenario = rawDataset as unknown as Scenario;

  it('produces zero delay and zero stranded pax when there is no airport closure', () => {
    const result = simulate(scenario, null);

    expect(result.metrics.flightsDelayed).toBe(0);
    expect(result.metrics.flightsCancelled).toBe(0);
    expect(result.metrics.totalDelayMinutes).toBe(0);
    expect(result.metrics.strandedPax).toBe(0);
    expect(result.metrics.brokenConnections).toBe(0);
    expect(result.metrics.crewsAtLimit).toBe(0);
  });

  it('slack fully absorbs small delays along aircraft chains', () => {
    const closure = { airport_id: 'AMD', start_time: '06:00', end_time: '06:45' };
    const result = simulate(scenario, closure);

    const ds1201 = result.flights['DS1201'];
    expect(ds1201.status).toBe('DELAYED');
    expect(ds1201.delay_dep_min).toBe(15);
    expect(ds1201.actual_arr).toBe('07:55');

    // Downstream leg DS1203 absorbs delay
    const ds1203 = result.flights['DS1203'];
    expect(ds1203.status).toBe('ON_TIME');
    expect(ds1203.delay_dep_min).toBe(0);
  });

  it('causal chain always terminates at the root closure', () => {
    const closure = { airport_id: 'BOM', start_time: '12:00', end_time: '14:00' };
    const result = simulate(scenario, closure);

    for (const flight of result.flight_list) {
      if (flight.status === 'DELAYED' || flight.status === 'CANCELLED') {
        expect(flight.causal_chain.length).toBeGreaterThanOrEqual(2);
        expect(flight.causal_chain[0]).toBe('CLOSURE:BOM');
      }
    }
  });

  it('stranded pax never exceeds total passengers across the network', () => {
    const closure = { airport_id: 'DEL', start_time: '06:00', end_time: '15:00' };
    const result = simulate(scenario, closure);

    const totalPax = scenario.flights.reduce((sum, f) => sum + f.pax, 0);
    expect(result.metrics.strandedPax).toBeLessThanOrEqual(totalPax);
    expect(result.metrics.strandedPax).toBeGreaterThan(0);
  });

  it('is strictly deterministic: identical inputs yield deep-equal outputs', () => {
    const closure = { airport_id: 'BOM', start_time: '11:00', end_time: '13:30' };
    const run1 = simulate(scenario, closure);
    const run2 = simulate(scenario, closure);

    expect(run1).toEqual(run2);
  });
});

describe('Phase 3: Recovery Actions & Search Engine', () => {
  const scenario = rawDataset as unknown as Scenario;
  const closure = { airport_id: 'BOM', start_time: '11:00', end_time: '13:30' };

  it('cancelFlight is a pure function and modifies only the targeted flight', () => {
    const modified = cancelFlight(scenario, 'DS0204');
    expect(modified.flights.find(f => f.flight_id === 'DS0204')?.is_cancelled).toBe(true);
    expect(scenario.flights.find(f => f.flight_id === 'DS0204')?.is_cancelled).toBeUndefined();
  });

  it('swapInSpareAircraft reassigns tail from target flight downstream', () => {
    const modified = swapInSpareAircraft(scenario, 'VT-DS18', 'DS0105');
    const target = modified.flights.find(f => f.flight_id === 'DS0105');
    expect(target?.tail_id).toBe('VT-DS18');
    const prior = modified.flights.find(f => f.flight_id === 'DS0104');
    expect(prior?.tail_id).toBe('VT-DS01');
  });

  it('every candidate afterMetrics strictly equals a fresh simulate() of modifiedScenario', () => {
    const candidates = generateRecoveryCandidates(scenario, closure);
    expect(candidates.length).toBeGreaterThan(0);

    for (const cand of candidates.slice(0, 5)) {
      const independentSim = simulate(cand.modifiedScenario, closure);
      expect(cand.afterMetrics).toEqual(independentSim.metrics);
    }
  });

  it('ranks candidates by weighted improvement score and includes positive recovery actions', () => {
    const delClosure = { airport_id: 'DEL', start_time: '12:00', end_time: '14:30' };
    const candidates = generateRecoveryCandidates(scenario, delClosure);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].score).toBeGreaterThanOrEqual(candidates[candidates.length - 1].score);

    const top = candidates[0];
    expect(top.score).toBeGreaterThan(0);
    expect(top.deltas.deltaStrandedPax).toBeLessThan(0);
  });
});
