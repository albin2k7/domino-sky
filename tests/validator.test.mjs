import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import rawDataset from '../data/dataset.json' with { type: 'json' };
import { validateDataset, timeToMinutes, minutesToTime } from '../src/engine/validator.ts';

describe('Time conversion utilities', () => {
  it('converts HH:MM to minutes from midnight correctly', () => {
    assert.strictEqual(timeToMinutes('00:00'), 0);
    assert.strictEqual(timeToMinutes('01:30'), 90);
    assert.strictEqual(timeToMinutes('08:15'), 495);
    assert.strictEqual(timeToMinutes('23:59'), 1439);
  });

  it('converts minutes to HH:MM correctly', () => {
    assert.strictEqual(minutesToTime(0), '00:00');
    assert.strictEqual(minutesToTime(90), '01:30');
    assert.strictEqual(minutesToTime(495), '08:15');
    assert.strictEqual(minutesToTime(1439), '23:59');
  });

  it('throws on invalid time formats', () => {
    assert.throws(() => timeToMinutes('25:00'));
    assert.throws(() => timeToMinutes('12:60'));
    assert.throws(() => timeToMinutes('invalid'));
  });
});

describe('Dataset Validator - Baseline Real Dataset', () => {
  it('passes baseline validation with zero errors', () => {
    const report = validateDataset(rawDataset);
    assert.strictEqual(report.valid, true);
    assert.strictEqual(report.error_count, 0);
    assert.strictEqual(report.errors.length, 0);
  });

  it('computes correct baseline dataset statistics', () => {
    const report = validateDataset(rawDataset);
    assert.strictEqual(report.stats.airportCount, 16);
    assert.strictEqual(report.stats.flightCount, 70);
    assert.strictEqual(report.stats.aircraftCount, 16);
    assert.strictEqual(report.stats.connectionCount, 21);
    assert.strictEqual(report.stats.crewCount, 16);
    assert.strictEqual(report.stats.spareCount, 2);
    assert.strictEqual(report.stats.totalBufferSlackMin, 1025);
  });
});

describe('Dataset Validator - Synthetic Defect Detection', () => {
  const getCleanCopy = () => JSON.parse(JSON.stringify(rawDataset));

  it('detects overlapping flights on the same aircraft', () => {
    const data = getCleanCopy();
    // Force DS0102 to depart at 08:30 while DS0101 arrives at 08:50
    const flight2 = data.flights.find(f => f.flight_id === 'DS0102');
    flight2.dep = '08:30';

    const report = validateDataset(data);
    assert.strictEqual(report.valid, false);
    const overlapError = report.errors.find(e => e.type === 'AIRCRAFT_OVERLAP');
    assert.ok(overlapError, 'Should report AIRCRAFT_OVERLAP');
    assert.strictEqual(overlapError.entity_id, 'VT-DS01');
  });

  it('detects broken aircraft chains (flight N destination != flight N+1 origin)', () => {
    const data = getCleanCopy();
    // DS0101 lands in JAI, but change DS0102 origin to BOM
    const flight2 = data.flights.find(f => f.flight_id === 'DS0102');
    flight2.origin = 'BOM';

    const report = validateDataset(data);
    assert.strictEqual(report.valid, false);
    const chainError = report.errors.find(e => e.type === 'BROKEN_AIRCRAFT_CHAIN');
    assert.ok(chainError, 'Should report BROKEN_AIRCRAFT_CHAIN');
    assert.ok(chainError.message.includes('arrives at JAI, but DS0102 departs from BOM'));
  });

  it('detects insufficient turnaround (< 30 min)', () => {
    const data = getCleanCopy();
    // DS0101 arrives at 08:50; change DS0102 dep to 09:10 (20m gap < 30m)
    const flight2 = data.flights.find(f => f.flight_id === 'DS0102');
    flight2.dep = '09:10';

    const report = validateDataset(data);
    assert.strictEqual(report.valid, false);
    const turnError = report.errors.find(e => e.type === 'INSUFFICIENT_TURNAROUND');
    assert.ok(turnError, 'Should report INSUFFICIENT_TURNAROUND');
    assert.strictEqual(turnError.entity_id, 'DS0102');
  });

  it('detects connections referencing unknown flights', () => {
    const data = getCleanCopy();
    data.connections[0].from_flight = 'DS9999_NONEXISTENT';

    const report = validateDataset(data);
    assert.strictEqual(report.valid, false);
    const cxError = report.errors.find(e => e.type === 'UNKNOWN_FLIGHT_IN_CONNECTION');
    assert.ok(cxError, 'Should report UNKNOWN_FLIGHT_IN_CONNECTION');
    assert.strictEqual(cxError.entity_id, data.connections[0].connection_id);
  });

  it('detects connection airport mismatches', () => {
    const data = getCleanCopy();
    data.connections[0].airport = 'DEL'; // CX01 is at BOM

    const report = validateDataset(data);
    assert.strictEqual(report.valid, false);
    const airportError = report.errors.find(e => e.type === 'CONNECTION_AIRPORT_MISMATCH');
    assert.ok(airportError, 'Should report CONNECTION_AIRPORT_MISMATCH');
  });

  it('detects broken crew chains', () => {
    const data = getCleanCopy();
    // Assign flight DS0501 (BOM-BLR) into CR01 who is currently at JAI
    data.crews[0].flight_ids[1] = 'DS0501';

    const report = validateDataset(data);
    assert.strictEqual(report.valid, false);
    const crewChainError = report.errors.find(e => e.type === 'BROKEN_CREW_CHAIN');
    assert.ok(crewChainError, 'Should report BROKEN_CREW_CHAIN');
    assert.strictEqual(crewChainError.entity_id, 'CR01');
  });

  it('detects crew base mismatch', () => {
    const data = getCleanCopy();
    data.crews[0].base = 'CCU'; // CR01 first flight departs from DEL

    const report = validateDataset(data);
    assert.strictEqual(report.valid, false);
    const baseError = report.errors.find(e => e.type === 'CREW_BASE_MISMATCH');
    assert.ok(baseError, 'Should report CREW_BASE_MISMATCH');
    assert.strictEqual(baseError.entity_id, 'CR01');
  });

  it('detects crew duty exceeded at baseline', () => {
    const data = getCleanCopy();
    // Set CR03 duty_start 2 hours earlier so scheduled duty exceeds 600 min
    data.crews.find(c => c.crew_id === 'CR03').duty_start = '09:00';

    const report = validateDataset(data);
    assert.strictEqual(report.valid, false);
    const dutyError = report.errors.find(e => e.type === 'CREW_DUTY_EXCEEDED_AT_BASELINE');
    assert.ok(dutyError, 'Should report CREW_DUTY_EXCEEDED_AT_BASELINE');
    assert.strictEqual(dutyError.entity_id, 'CR03');
  });
});
