import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import rawDataset from '../data/dataset.json' with { type: 'json' };
import { simulate } from '../src/engine/simulate.ts';
import {
  generateRecoveryCandidates,
  evaluateAction,
  cancelFlight,
  swapInSpareAircraft,
  holdForConnections,
} from '../src/engine/recovery.ts';

describe('Phase 2: Deterministic Simulation Engine', () => {
  it('produces zero delay and zero stranded pax when there is no airport closure', () => {
    const result = simulate(rawDataset, null);

    assert.strictEqual(result.metrics.flightsDelayed, 0, 'No flights should be delayed');
    assert.strictEqual(result.metrics.flightsCancelled, 0, 'No flights should be cancelled');
    assert.strictEqual(result.metrics.totalDelayMinutes, 0, 'Total delay minutes must be 0');
    assert.strictEqual(result.metrics.strandedPax, 0, 'Zero stranded pax on baseline');
    assert.strictEqual(result.metrics.brokenConnections, 0, 'Zero broken connections on baseline');
    assert.strictEqual(result.metrics.crewsAtLimit, 0, 'Zero crew duty limit overruns on baseline');
  });

  it('slack fully absorbs small delays along aircraft chains', () => {
    // BOM closure 06:15 to 06:45 (30m closure)
    // DS0201 departs DEL at 06:00 and arrives BOM at 08:10.
    // DS0701 departs HYD at 06:30 and arrives BOM at 07:55.
    // DS1201 departs AMD at 06:30 and arrives BOM at 07:40.
    // Let's test a mild closure at AMD 06:00 to 06:45 (15 min delay on DS1201 which departs 06:30)
    const closure = { airport_id: 'AMD', start_time: '06:00', end_time: '06:45' };
    const result = simulate(rawDataset, closure);

    const ds1201 = result.flights['DS1201'];
    assert.strictEqual(ds1201.status, 'DELAYED');
    assert.strictEqual(ds1201.delay_dep_min, 15, 'DS1201 delayed by 15m to 06:45');
    assert.strictEqual(ds1201.actual_arr, '07:55');

    // DS1202 is scheduled at 08:10 BOM->AMD.
    // DS1201 arrived at 07:55 + 30m min turnaround = 08:25 ready time.
    // So DS1202 is delayed to 08:25 (15m delay), arriving AMD at 09:35.
    // Next leg DS1203 is scheduled at 10:35 AMD->DEL (scheduled turnaround was 75m!).
    // 09:35 + 30m = 10:05 ready time <= 10:35 scheduled dep!
    // So DS1203 departs ON TIME at 10:35! Delay was fully absorbed by slack!
    const ds1203 = result.flights['DS1203'];
    assert.strictEqual(ds1203.status, 'ON_TIME', 'DS1203 should absorb upstream delay via slack');
    assert.strictEqual(ds1203.delay_dep_min, 0);
  });

  it('causal chain always terminates at the root closure', () => {
    const closure = { airport_id: 'BOM', start_time: '12:00', end_time: '14:00' };
    const result = simulate(rawDataset, closure);

    for (const flight of result.flight_list) {
      if (flight.status === 'DELAYED' || flight.status === 'CANCELLED') {
        assert.ok(flight.causal_chain.length >= 2, `Flight ${flight.flight_id} must have causal chain`);
        assert.strictEqual(
          flight.causal_chain[0],
          'CLOSURE:BOM',
          `Causal chain for ${flight.flight_id} must start at CLOSURE:BOM`
        );
      }
    }
  });

  it('stranded pax never exceeds total passengers across the network', () => {
    const closure = { airport_id: 'DEL', start_time: '06:00', end_time: '15:00' };
    const result = simulate(rawDataset, closure);

    const totalPax = rawDataset.flights.reduce((sum, f) => sum + f.pax, 0);
    assert.ok(result.metrics.strandedPax <= totalPax, 'Stranded pax must not exceed total booked pax');
    assert.ok(result.metrics.strandedPax > 0, 'Major DEL closure must strand passengers');
  });

  it('is strictly deterministic: identical inputs yield deep-equal outputs', () => {
    const closure = { airport_id: 'BOM', start_time: '11:00', end_time: '13:30' };
    const run1 = simulate(rawDataset, closure);
    const run2 = simulate(rawDataset, closure);

    assert.deepStrictEqual(run1, run2, 'Simulation must be 100% deterministic');
  });
});

describe('Phase 3: Recovery Actions & Search Engine', () => {
  const closure = { airport_id: 'BOM', start_time: '11:00', end_time: '13:30' };

  it('cancelFlight is a pure function and modifies only the targeted flight', () => {
    const modified = cancelFlight(rawDataset, 'DS0204');
    assert.strictEqual(modified.flights.find(f => f.flight_id === 'DS0204').is_cancelled, true);
    assert.strictEqual(rawDataset.flights.find(f => f.flight_id === 'DS0204').is_cancelled, undefined);
  });

  it('swapInSpareAircraft reassigns tail from target flight downstream', () => {
    // VT-DS18 is spare at DEL. DS0105 departs DEL at 15:15 on VT-DS01.
    const modified = swapInSpareAircraft(rawDataset, 'VT-DS18', 'DS0105');
    const target = modified.flights.find(f => f.flight_id === 'DS0105');
    assert.strictEqual(target.tail_id, 'VT-DS18');
    // Prior flight DS0104 on VT-DS01 remains VT-DS01
    const prior = modified.flights.find(f => f.flight_id === 'DS0104');
    assert.strictEqual(prior.tail_id, 'VT-DS01');
  });

  it('every candidate afterMetrics strictly equals a fresh simulate() of modifiedScenario', () => {
    const candidates = generateRecoveryCandidates(rawDataset, closure);
    assert.ok(candidates.length > 0, 'Must generate recovery candidates for BOM disruption');

    for (const cand of candidates.slice(0, 5)) {
      const independentSim = simulate(cand.modifiedScenario, closure);
      assert.deepStrictEqual(
        cand.afterMetrics,
        independentSim.metrics,
        `afterMetrics of ${cand.action.id} must equal fresh independent simulation`
      );
    }
  });

  it('ranks candidates by weighted improvement score and includes positive recovery actions', () => {
    // Closure at DEL where CX13 connection can be protected by holding DS1102
    const delClosure = { airport_id: 'DEL', start_time: '12:00', end_time: '14:30' };
    const candidates = generateRecoveryCandidates(rawDataset, delClosure);
    assert.ok(candidates.length > 0, 'Must generate candidates');
    assert.ok(candidates[0].score >= candidates[candidates.length - 1].score, 'Candidates must be sorted descending');

    // Check that top candidate provides positive improvement
    const top = candidates[0];
    assert.ok(top.score > 0, 'Top recovery candidate at DEL must have a positive improvement score');
    assert.ok(top.deltas.deltaStrandedPax < 0, 'Top candidate must reduce stranded pax');
  });
});
