import type { Dataset, Flight, Airport, ValidationError, ValidationReport } from '../types/index.ts';
import { DEFAULT_ASSUMPTIONS } from '../config/assumptions.ts';

/**
 * Utility to convert "HH:MM" string to minutes from midnight (00:00 = 0).
 */
export function timeToMinutes(hhmm: string): number {
  const parts = hhmm.split(':');
  if (parts.length !== 2) {
    throw new Error(`Invalid time format: "${hhmm}". Expected "HH:MM"`);
  }
  const [h, m] = parts.map(Number);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error(`Invalid time values in "${hhmm}"`);
  }
  return h * 60 + m;
}

/**
 * Utility to format minutes from midnight back to "HH:MM".
 */
export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.floor(minutes));
  const h = Math.floor(clamped / 60) % 24;
  const m = clamped % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Validates the raw flight network dataset against physical, geographic,
 * and operational constraints.
 * 
 * Reports:
 * - Overlapping flights on one aircraft
 * - Broken chains (flight N destination != flight N+1 origin)
 * - Missing or insufficient turnaround (< MIN_TURNAROUND)
 * - Connections referencing unknown flights or wrong airports
 * - Crew chains that don't make geographic sense or exceed duty limits
 */
export function validateDataset(
  dataset: Dataset,
  minTurnaround = DEFAULT_ASSUMPTIONS.MIN_TURNAROUND,
  maxCrewDuty = DEFAULT_ASSUMPTIONS.MAX_CREW_DUTY_MIN
): ValidationReport {
  const errors: ValidationError[] = [];

  const airportMap = new Map<string, Airport>(dataset.airports.map((a: Airport) => [a.id, a]));
  const flightMap = new Map<string, Flight>(dataset.flights.map((f: Flight) => [f.flight_id, f]));
  const spareMap = new Map(dataset.spare_aircraft.map((s) => [s.tail_id, s]));

  // 1. Check Flights against Airport IDs and valid block minutes
  for (const f of dataset.flights) {
    if (!airportMap.has(f.origin)) {
      errors.push({
        type: 'UNKNOWN_AIRPORT',
        entity_id: f.flight_id,
        message: `Flight ${f.flight_id} has unknown origin airport "${f.origin}".`,
        details: { flight_id: f.flight_id, origin: f.origin }
      });
    }
    if (!airportMap.has(f.destination)) {
      errors.push({
        type: 'UNKNOWN_AIRPORT',
        entity_id: f.flight_id,
        message: `Flight ${f.flight_id} has unknown destination airport "${f.destination}".`,
        details: { flight_id: f.flight_id, destination: f.destination }
      });
    }

    const depM = timeToMinutes(f.dep);
    const arrM = timeToMinutes(f.arr);
    if (arrM <= depM) {
      errors.push({
        type: 'AIRCRAFT_OVERLAP',
        entity_id: f.flight_id,
        message: `Flight ${f.flight_id} has arrival time (${f.arr}) <= departure time (${f.dep}).`,
        details: { flight_id: f.flight_id, dep: f.dep, arr: f.arr }
      });
    }
  }

  // 2. Check Aircraft Chains (Group flights by tail_id)
  const flightsByTail = new Map<string, typeof dataset.flights>();
  for (const f of dataset.flights) {
    const list = flightsByTail.get(f.tail_id) || [];
    list.push(f);
    flightsByTail.set(f.tail_id, list);
  }

  let totalBufferSlackMin = 0;

  for (const [tailId, rawChain] of flightsByTail.entries()) {
    // Sort by leg_order
    const chain = [...rawChain].sort((a, b) => a.leg_order - b.leg_order);

    for (let i = 0; i < chain.length; i++) {
      const current = chain[i];
      const curDep = timeToMinutes(current.dep);
      const curArr = timeToMinutes(current.arr);

      if (i > 0) {
        const prev = chain[i - 1];
        const prevArr = timeToMinutes(prev.arr);

        // A. Broken Chain: Flight N destination != Flight N+1 origin
        if (prev.destination !== current.origin) {
          errors.push({
            type: 'BROKEN_AIRCRAFT_CHAIN',
            entity_id: tailId,
            message: `Aircraft ${tailId} broken chain: ${prev.flight_id} arrives at ${prev.destination}, but ${current.flight_id} departs from ${current.origin}.`,
            details: {
              tailId,
              prevFlight: prev.flight_id,
              prevDestination: prev.destination,
              currFlight: current.flight_id,
              currOrigin: current.origin
            }
          });
        }

        // B. Aircraft Overlap: current departs before previous arrives
        if (curDep < prevArr) {
          errors.push({
            type: 'AIRCRAFT_OVERLAP',
            entity_id: tailId,
            message: `Aircraft ${tailId} overlap: ${current.flight_id} scheduled to depart at ${current.dep} before previous flight ${prev.flight_id} arrives at ${prev.arr}.`,
            details: {
              tailId,
              prevFlight: prev.flight_id,
              prevArr: prev.arr,
              currFlight: current.flight_id,
              currDep: current.dep
            }
          });
        }

        // C. Insufficient Turnaround: gap < minTurnaround
        const gap = curDep - prevArr;
        if (gap < minTurnaround) {
          errors.push({
            type: 'INSUFFICIENT_TURNAROUND',
            entity_id: current.flight_id,
            message: `Flight ${current.flight_id} has turnaround gap of ${gap}m after ${prev.flight_id}, which is less than minimum required ${minTurnaround}m.`,
            details: {
              tailId,
              prevFlight: prev.flight_id,
              currFlight: current.flight_id,
              actualGapMinutes: gap,
              requiredMinutes: minTurnaround
            }
          });
        } else {
          totalBufferSlackMin += (gap - minTurnaround);
        }
      }
    }
  }

  // 3. Check Connections
  for (const cx of dataset.connections) {
    const fromF = flightMap.get(cx.from_flight);
    const toF = flightMap.get(cx.to_flight);

    if (!fromF) {
      errors.push({
        type: 'UNKNOWN_FLIGHT_IN_CONNECTION',
        entity_id: cx.connection_id,
        message: `Connection ${cx.connection_id} references unknown inbound flight "${cx.from_flight}".`,
        details: { connection_id: cx.connection_id, from_flight: cx.from_flight }
      });
    }

    if (!toF) {
      errors.push({
        type: 'UNKNOWN_FLIGHT_IN_CONNECTION',
        entity_id: cx.connection_id,
        message: `Connection ${cx.connection_id} references unknown outbound flight "${cx.to_flight}".`,
        details: { connection_id: cx.connection_id, to_flight: cx.to_flight }
      });
    }

    if (fromF && toF) {
      if (fromF.destination !== cx.airport) {
        errors.push({
          type: 'CONNECTION_AIRPORT_MISMATCH',
          entity_id: cx.connection_id,
          message: `Connection ${cx.connection_id} airport is ${cx.airport}, but inbound ${fromF.flight_id} lands at ${fromF.destination}.`,
          details: { connection_id: cx.connection_id, airport: cx.airport, inboundDest: fromF.destination }
        });
      }

      if (toF.origin !== cx.airport) {
        errors.push({
          type: 'CONNECTION_AIRPORT_MISMATCH',
          entity_id: cx.connection_id,
          message: `Connection ${cx.connection_id} airport is ${cx.airport}, but outbound ${toF.flight_id} departs from ${toF.origin}.`,
          details: { connection_id: cx.connection_id, airport: cx.airport, outboundOrigin: toF.origin }
        });
      }

      const arrM = timeToMinutes(fromF.arr);
      const depM = timeToMinutes(toF.dep);
      const connectWindow = depM - arrM;

      if (connectWindow < cx.min_connect_minutes) {
        errors.push({
          type: 'CONNECTION_WINDOW_NEGATIVE',
          entity_id: cx.connection_id,
          message: `Connection ${cx.connection_id} scheduled transfer window (${connectWindow}m) is less than required MCT (${cx.min_connect_minutes}m).`,
          details: {
            connection_id: cx.connection_id,
            transferWindowMinutes: connectWindow,
            requiredMct: cx.min_connect_minutes
          }
        });
      }

      if (cx.passengers > fromF.pax) {
        errors.push({
          type: 'PAX_EXCEEDS_CAPACITY',
          entity_id: cx.connection_id,
          message: `Connection ${cx.connection_id} passengers (${cx.passengers}) exceed total inbound passengers (${fromF.pax}).`,
          details: { connection_id: cx.connection_id, connectingPax: cx.passengers, flightPax: fromF.pax }
        });
      }
    }
  }

  // 4. Check Crew Chains
  for (const cr of dataset.crews) {
    const crewFlights = cr.flight_ids.map(id => flightMap.get(id));
    
    // Check unknown flights
    for (let idx = 0; idx < cr.flight_ids.length; idx++) {
      if (!crewFlights[idx]) {
        errors.push({
          type: 'UNKNOWN_FLIGHT_IN_CREW',
          entity_id: cr.crew_id,
          message: `Crew ${cr.crew_id} assigned unknown flight "${cr.flight_ids[idx]}".`,
          details: { crew_id: cr.crew_id, flight_id: cr.flight_ids[idx] }
        });
      }
    }

    const validFlights = crewFlights.filter((f): f is NonNullable<typeof f> => Boolean(f));
    if (validFlights.length > 0) {
      const first = validFlights[0];
      const last = validFlights[validFlights.length - 1];

      // Base vs first flight origin
      if (first.origin !== cr.base) {
        errors.push({
          type: 'CREW_BASE_MISMATCH',
          entity_id: cr.crew_id,
          message: `Crew ${cr.crew_id} base is ${cr.base}, but their first flight ${first.flight_id} starts at ${first.origin}.`,
          details: { crew_id: cr.crew_id, base: cr.base, firstLegOrigin: first.origin }
        });
      }

      // Chain continuity for crew
      for (let i = 1; i < validFlights.length; i++) {
        const prev = validFlights[i - 1];
        const curr = validFlights[i];
        if (prev.destination !== curr.origin) {
          errors.push({
            type: 'BROKEN_CREW_CHAIN',
            entity_id: cr.crew_id,
            message: `Crew ${cr.crew_id} broken chain: arrives at ${prev.destination} on ${prev.flight_id}, but departs from ${curr.origin} on ${curr.flight_id}.`,
            details: {
              crew_id: cr.crew_id,
              prevFlight: prev.flight_id,
              prevDest: prev.destination,
              currFlight: curr.flight_id,
              currOrigin: curr.origin
            }
          });
        }
      }

      // Check baseline scheduled duty limit
      const dutyStartM = timeToMinutes(cr.duty_start);
      const lastArrM = timeToMinutes(last.arr);
      const scheduledDutyM = lastArrM - dutyStartM;

      if (scheduledDutyM > (cr.max_duty_mins || maxCrewDuty)) {
        errors.push({
          type: 'CREW_DUTY_EXCEEDED_AT_BASELINE',
          entity_id: cr.crew_id,
          message: `Crew ${cr.crew_id} scheduled duty time (${scheduledDutyM}m) exceeds limit of ${cr.max_duty_mins}m.`,
          details: {
            crew_id: cr.crew_id,
            scheduledDutyMinutes: scheduledDutyM,
            maxDutyMinutes: cr.max_duty_mins
          }
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    error_count: errors.length,
    errors,
    stats: {
      airportCount: dataset.airports.length,
      flightCount: dataset.flights.length,
      aircraftCount: flightsByTail.size,
      connectionCount: dataset.connections.length,
      crewCount: dataset.crews.length,
      spareCount: dataset.spare_aircraft.length,
      totalBufferSlackMin,
    }
  };
}
