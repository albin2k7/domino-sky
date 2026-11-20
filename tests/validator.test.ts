import { describe, it, expect } from 'vitest';
import rawDataset from '../data/dataset.json';
import { validateDataset, timeToMinutes, minutesToTime } from '../src/engine/validator';
import type { Scenario as Dataset } from '../src/types';

describe('Time conversion utilities', () => {
  it('converts HH:MM to minutes from midnight correctly', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('01:30')).toBe(90);
    expect(timeToMinutes('08:15')).toBe(495);
    expect(timeToMinutes('23:59')).toBe(1439);
  });

  it('converts minutes to HH:MM correctly', () => {
    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(90)).toBe('01:30');
    expect(minutesToTime(495)).toBe('08:15');
    expect(minutesToTime(1439)).toBe('23:59');
  });

  it('throws on invalid time formats', () => {
    expect(() => timeToMinutes('25:00')).toThrow();
    expect(() => timeToMinutes('12:60')).toThrow();
    expect(() => timeToMinutes('invalid')).toThrow();
  });
});

describe('Dataset Validator - Baseline Real Dataset', () => {
  const dataset = rawDataset as unknown as Dataset;

  it('passes baseline validation with zero errors', () => {
    const report = validateDataset(dataset);
    expect(report.valid).toBe(true);
    expect(report.error_count).toBe(0);
    expect(report.errors).toHaveLength(0);
  });

  it('computes correct baseline dataset statistics', () => {
    const report = validateDataset(dataset);
    expect(report.stats.airportCount).toBe(16);
    expect(report.stats.flightCount).toBe(70);
    expect(report.stats.aircraftCount).toBe(16);
    expect(report.stats.connectionCount).toBe(21);
    expect(report.stats.crewCount).toBe(16);
    expect(report.stats.spareCount).toBe(2);
    expect(report.stats.totalBufferSlackMin).toBe(1025);
  });
});

describe('Dataset Validator - Synthetic Defect Detection', () => {
  const getCleanCopy = (): Dataset => JSON.parse(JSON.stringify(rawDataset));

  it('detects overlapping flights on the same aircraft', () => {
    const data = getCleanCopy();
    // Force DS0102 to depart at 08:30 while DS0101 arrives at 08:50
    const flight2 = data.flights.find(f => f.flight_id === 'DS0102')!;
    flight2.dep = '08:30';

    const report = validateDataset(data);
    expect(report.valid).toBe(false);
    const overlapError = report.errors.find(e => e.type === 'AIRCRAFT_OVERLAP');
    expect(overlapError).toBeDefined();
    expect(overlapError?.entity_id).toBe('VT-DS01');
  });

  it('detects broken aircraft chains (flight N destination != flight N+1 origin)', () => {
    const data = getCleanCopy();
    // DS0101 lands in JAI, but change DS0102 origin to BOM
    const flight2 = data.flights.find(f => f.flight_id === 'DS0102')!;
    flight2.origin = 'BOM';

    const report = validateDataset(data);
    expect(report.valid).toBe(false);
    const chainError = report.errors.find(e => e.type === 'BROKEN_AIRCRAFT_CHAIN');
    expect(chainError).toBeDefined();
    expect(chainError?.message).toContain('arrives at JAI, but DS0102 departs from BOM');
  });

  it('detects insufficient turnaround (< 30 min)', () => {
    const data = getCleanCopy();
    // DS0101 arrives at 08:50; change DS0102 dep to 09:10 (20m gap < 30m)
    const flight2 = data.flights.find(f => f.flight_id === 'DS0102')!;
    flight2.dep = '09:10';

    const report = validateDataset(data);
    expect(report.valid).toBe(false);
    const turnError = report.errors.find(e => e.type === 'INSUFFICIENT_TURNAROUND');
    expect(turnError).toBeDefined();
    expect(turnError?.entity_id).toBe('DS0102');
  });

  it('detects connections referencing unknown flights', () => {
    const data = getCleanCopy();
    data.connections[0].from_flight = 'DS9999_NONEXISTENT';

    const report = validateDataset(data);
    expect(report.valid).toBe(false);
    const cxError = report.errors.find(e => e.type === 'UNKNOWN_FLIGHT_IN_CONNECTION');
    expect(cxError).toBeDefined();
    expect(cxError?.entity_id).toBe(data.connections[0].connection_id);
  });

  it('detects connection airport mismatches', () => {
    const data = getCleanCopy();
    // Connection CX01 is at BOM, change connection airport to DEL
    data.connections[0].airport = 'DEL';

    const report = validateDataset(data);
    expect(report.valid).toBe(false);
    const airportError = report.errors.find(e => e.type === 'CONNECTION_AIRPORT_MISMATCH');
    expect(airportError).toBeDefined();
  });

  it('detects broken crew chains', () => {
    const data = getCleanCopy();
    // Assign flight DS0501 (BOM-BLR) into CR01 who is currently at JAI
    data.crews[0].flight_ids[1] = 'DS0501';

    const report = validateDataset(data);
    expect(report.valid).toBe(false);
    const crewChainError = report.errors.find(e => e.type === 'BROKEN_CREW_CHAIN');
    expect(crewChainError).toBeDefined();
    expect(crewChainError?.entity_id).toBe('CR01');
  });

  it('detects crew base mismatch', () => {
    const data = getCleanCopy();
    data.crews[0].base = 'CCU'; // CR01 first flight departs from DEL

    const report = validateDataset(data);
    expect(report.valid).toBe(false);
    const baseError = report.errors.find(e => e.type === 'CREW_BASE_MISMATCH');
    expect(baseError).toBeDefined();
    expect(baseError?.entity_id).toBe('CR01');
  });

  it('detects crew duty exceeded at baseline', () => {
    const data = getCleanCopy();
    // Set CR03 duty_start 2 hours earlier so scheduled duty exceeds 600 min
    data.crews.find(c => c.crew_id === 'CR03')!.duty_start = '09:00';

    const report = validateDataset(data);
    expect(report.valid).toBe(false);
    const dutyError = report.errors.find(e => e.type === 'CREW_DUTY_EXCEEDED_AT_BASELINE');
    expect(dutyError).toBeDefined();
    expect(dutyError?.entity_id).toBe('CR03');
  });
});
