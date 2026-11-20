import type {
  Scenario,
  AirportClosure,
  SimulationResult,
  FlightSimulation,
  ConnectionSimulation,
  NetworkMetrics,
  DelayCause,
  FlightStatus,
} from '../types/index.ts';
import { DEFAULT_ASSUMPTIONS } from '../config/assumptions.ts';
import type { SystemAssumptions } from '../config/assumptions.ts';
import { timeToMinutes, minutesToTime } from './validator.ts';

/**
 * Pure deterministic simulation engine for Domino Sky.
 * 
 * Takes an immutable scenario and an optional airport closure,
 * topologically propagates delays along aircraft and crew chains,
 * attributes causal links back to the root closure, and calculates
 * exact non-double-counted passenger stranding numbers.
 */
export function simulate(
  scenario: Scenario,
  closure: AirportClosure | null = null,
  assumptions: SystemAssumptions = DEFAULT_ASSUMPTIONS
): SimulationResult {
  const closureStartM = closure ? timeToMinutes(closure.start_time) : -1;
  const closureEndM = closure ? timeToMinutes(closure.end_time) : -1;
  const closedAirport = closure ? closure.airport_id : null;

  // 1. Build fast lookup maps
  const flightsById = new Map(scenario.flights.map(f => [f.flight_id, f]));
  const crewByFlightId = new Map<string, typeof scenario.crews[0]>();
  for (const cr of scenario.crews) {
    for (const fid of cr.flight_ids) {
      crewByFlightId.set(fid, cr);
    }
  }

  // Predecessor lookups for aircraft chains
  const prevAircraftLeg = new Map<string, string>(); // flight_id -> prev_flight_id
  const flightsByTail = new Map<string, typeof scenario.flights>();
  for (const f of scenario.flights) {
    const list = flightsByTail.get(f.tail_id) || [];
    list.push(f);
    flightsByTail.set(f.tail_id, list);
  }
  for (const [, rawChain] of flightsByTail.entries()) {
    const chain = [...rawChain].sort((a, b) => a.leg_order - b.leg_order);
    for (let i = 1; i < chain.length; i++) {
      prevAircraftLeg.set(chain[i].flight_id, chain[i - 1].flight_id);
    }
  }

  // Predecessor lookups for crew chains
  const prevCrewLeg = new Map<string, string>(); // flight_id -> prev_flight_id
  for (const cr of scenario.crews) {
    for (let i = 1; i < cr.flight_ids.length; i++) {
      prevCrewLeg.set(cr.flight_ids[i], cr.flight_ids[i - 1]);
    }
  }

  // 2. Sort flights topologically by scheduled departure time, tie-breaking by flight_id
  const sortedFlights = [...scenario.flights].sort((a, b) => {
    const depDiff = timeToMinutes(a.dep) - timeToMinutes(b.dep);
    if (depDiff !== 0) return depDiff;
    return a.flight_id.localeCompare(b.flight_id);
  });

  const simulatedFlights: Record<string, FlightSimulation> = {};
  const flightList: FlightSimulation[] = [];

  // 3. Process each flight in scheduled order
  for (const f of sortedFlights) {
    const schedDepM = timeToMinutes(f.dep);
    const schedArrM = timeToMinutes(f.arr);
    const blockM = f.block_minutes;
    const crew = crewByFlightId.get(f.flight_id);
    const crewId = crew ? crew.crew_id : 'UNASSIGNED';
    const crewDutyStartM = crew ? timeToMinutes(crew.duty_start) : schedDepM - 45;
    const maxDutyM = crew ? crew.max_duty_mins : assumptions.MAX_CREW_DUTY_MIN;

    // Check if explicitly cancelled in scenario
    if (f.is_cancelled) {
      const cancelledSim: FlightSimulation = {
        flight_id: f.flight_id,
        tail_id: f.tail_id,
        crew_id: crewId,
        origin: f.origin,
        destination: f.destination,
        scheduled_dep: f.dep,
        scheduled_arr: f.arr,
        actual_dep: f.dep,
        actual_arr: f.arr,
        scheduled_dep_min: schedDepM,
        scheduled_arr_min: schedArrM,
        actual_dep_min: schedDepM,
        actual_arr_min: schedArrM,
        delay_dep_min: 0,
        delay_arr_min: 0,
        status: 'CANCELLED',
        cause: 'NONE',
        caused_by: null,
        causal_chain: [f.flight_id],
        stranded_pax: 0, // Calculated in passenger step
        crew_duty_exceeded: false,
        actual_crew_duty_min: 0,
      };
      simulatedFlights[f.flight_id] = cancelledSim;
      flightList.push(cancelledSim);
      continue;
    }

    // A. Check Aircraft Predecessor
    const prevAcFid = prevAircraftLeg.get(f.flight_id);
    const prevAcSim = prevAcFid ? simulatedFlights[prevAcFid] : null;

    let readyFromAcM = 0;
    let acCascadeCancelled = false;

    if (prevAcSim) {
      if (prevAcSim.status === 'CANCELLED') {
        if (assumptions.AIRCRAFT_CHAIN_SEMANTICS.PROPAGATE_CANCELLATION_DOWN_CHAIN_IF_NO_AIRCRAFT) {
          acCascadeCancelled = true;
        }
      } else {
        readyFromAcM = prevAcSim.actual_arr_min + assumptions.MIN_TURNAROUND;
      }
    }

    // B. Check Crew Predecessor
    const prevCrewFid = prevCrewLeg.get(f.flight_id);
    const prevCrewSim = prevCrewFid ? simulatedFlights[prevCrewFid] : null;

    let readyFromCrewM = 0;
    let crewCascadeCancelled = false;

    if (prevCrewSim) {
      if (prevCrewSim.status === 'CANCELLED') {
        crewCascadeCancelled = true;
      } else {
        readyFromCrewM = prevCrewSim.actual_arr_min + assumptions.MIN_CREW_TURN;
      }
    }

    // If upstream aircraft or crew was cancelled, downstream cannot fly
    if (acCascadeCancelled || crewCascadeCancelled) {
      const parentSim = acCascadeCancelled ? prevAcSim! : prevCrewSim!;
      const cascadeCause: DelayCause = acCascadeCancelled ? 'LATE_AIRCRAFT' : 'LATE_CREW';
      const cascadeSim: FlightSimulation = {
        flight_id: f.flight_id,
        tail_id: f.tail_id,
        crew_id: crewId,
        origin: f.origin,
        destination: f.destination,
        scheduled_dep: f.dep,
        scheduled_arr: f.arr,
        actual_dep: f.dep,
        actual_arr: f.arr,
        scheduled_dep_min: schedDepM,
        scheduled_arr_min: schedArrM,
        actual_dep_min: schedDepM,
        actual_arr_min: schedArrM,
        delay_dep_min: 0,
        delay_arr_min: 0,
        status: 'CANCELLED',
        cause: cascadeCause,
        caused_by: parentSim.flight_id,
        causal_chain: [...parentSim.causal_chain, f.flight_id],
        stranded_pax: 0,
        crew_duty_exceeded: false,
        actual_crew_duty_min: 0,
      };
      simulatedFlights[f.flight_id] = cascadeSim;
      flightList.push(cascadeSim);
      continue;
    }

    // C. Evaluate intentional hold (recovery action)
    const holdM = f.hold_minutes || 0;
    const baseTargetDepM = schedDepM + holdM;

    // D. Evaluate Origin Airport Closure
    let readyFromOriginClosureM = 0;
    if (closedAirport === f.origin && assumptions.CLOSURE_SEMANTICS.DEPARTURES_HELD_UNTIL_REOPEN) {
      if (baseTargetDepM < closureEndM && baseTargetDepM >= closureStartM) {
        readyFromOriginClosureM = closureEndM;
      }
    }

    // E. Evaluate Destination Airport Closure (Ground Delay Program)
    let readyFromDestClosureM = 0;
    if (closedAirport === f.destination && assumptions.CLOSURE_SEMANTICS.HOLD_ARRIVAL_VIA_ORIGIN_GROUND_DELAY) {
      const scheduledArrival = baseTargetDepM + blockM;
      if (scheduledArrival < closureEndM && scheduledArrival >= closureStartM) {
        readyFromDestClosureM = closureEndM - blockM;
      }
    }

    // Calculate actual departure time (binding constraint)
    const actualDepM = Math.max(
      baseTargetDepM,
      readyFromAcM,
      readyFromCrewM,
      readyFromOriginClosureM,
      readyFromDestClosureM
    );

    const delayDepM = actualDepM - schedDepM;
    const actualArrM = actualDepM + blockM;
    const delayArrM = actualArrM - schedArrM;

    // Determine Winning Cause and Causal Pointer
    let cause: DelayCause = 'NONE';
    let causedBy: string | null = null;
    let causalChain: string[] = [];

    if (delayDepM > 0) {
      if (readyFromOriginClosureM === actualDepM || readyFromDestClosureM === actualDepM) {
        cause = 'AIRPORT_CLOSURE';
        causedBy = `CLOSURE:${closedAirport}`;
        causalChain = [causedBy, f.flight_id];
      } else if (readyFromAcM === actualDepM && prevAcSim) {
        cause = 'LATE_AIRCRAFT';
        causedBy = prevAcSim.flight_id;
        causalChain = [...prevAcSim.causal_chain, f.flight_id];
      } else if (readyFromCrewM === actualDepM && prevCrewSim) {
        cause = 'LATE_CREW';
        causedBy = prevCrewSim.flight_id;
        causalChain = [...prevCrewSim.causal_chain, f.flight_id];
      } else if (holdM > 0 && baseTargetDepM === actualDepM) {
        cause = 'NONE';
        causedBy = 'OPERATIONAL_HOLD';
        causalChain = [f.flight_id];
      } else {
        cause = 'NONE';
      }
    }

    // Check crew duty overrun
    const actualDutyM = actualArrM - crewDutyStartM;
    const crewDutyExceeded = actualDutyM > maxDutyM;

    // Determine Status (Cancelled vs Delayed vs On-Time)
    let status: FlightStatus = 'ON_TIME';
    if (delayDepM >= assumptions.CANCEL_THRESHOLD_MIN) {
      status = 'CANCELLED';
    } else if (delayDepM > 0) {
      status = 'DELAYED';
    }

    simulatedFlights[f.flight_id] = {
      flight_id: f.flight_id,
      tail_id: f.tail_id,
      crew_id: crewId,
      origin: f.origin,
      destination: f.destination,
      scheduled_dep: f.dep,
      scheduled_arr: f.arr,
      actual_dep: minutesToTime(actualDepM),
      actual_arr: minutesToTime(actualArrM),
      scheduled_dep_min: schedDepM,
      scheduled_arr_min: schedArrM,
      actual_dep_min: actualDepM,
      actual_arr_min: actualArrM,
      delay_dep_min: delayDepM,
      delay_arr_min: delayArrM,
      status,
      cause,
      caused_by: causedBy,
      causal_chain: causalChain.length > 0 ? causalChain : [f.flight_id],
      stranded_pax: 0, // Populated below
      crew_duty_exceeded: crewDutyExceeded,
      actual_crew_duty_min: actualDutyM,
    };

    flightList.push(simulatedFlights[f.flight_id]);
  }

  // 4. Passenger Connection Evaluation & Stranding Calculation (No double-counting)
  const simulatedConnections: Record<string, ConnectionSimulation> = {};
  const connectionList: ConnectionSimulation[] = [];

  // Group outbound connections per flight to separate connecting pax from local terminating pax
  const outboundCxByFlight = new Map<string, typeof scenario.connections>();
  for (const cx of scenario.connections) {
    const list = outboundCxByFlight.get(cx.from_flight) || [];
    list.push(cx);
    outboundCxByFlight.set(cx.from_flight, list);
  }

  let totalStrandedPax = 0;
  let totalBrokenConnections = 0;

  for (const cx of scenario.connections) {
    const inboundSim = simulatedFlights[cx.from_flight];
    const outboundSim = simulatedFlights[cx.to_flight];

    let isBroken = false;
    let breakReason: ConnectionSimulation['break_reason'] = null;
    let transferWindow = 0;

    if (!inboundSim || inboundSim.status === 'CANCELLED') {
      isBroken = true;
      breakReason = 'INBOUND_CANCELLED';
    } else if (!outboundSim || outboundSim.status === 'CANCELLED') {
      isBroken = true;
      breakReason = 'OUTBOUND_CANCELLED';
    } else {
      transferWindow = outboundSim.actual_dep_min - inboundSim.actual_arr_min;
      if (transferWindow < cx.min_connect_minutes) {
        isBroken = true;
        breakReason = 'MISSED_CONNECTION';
      }
    }

    if (isBroken) {
      totalBrokenConnections++;
      totalStrandedPax += cx.passengers;
    }

    const cxSim: ConnectionSimulation = {
      connection_id: cx.connection_id,
      airport: cx.airport,
      from_flight: cx.from_flight,
      to_flight: cx.to_flight,
      passengers: cx.passengers,
      min_connect_minutes: cx.min_connect_minutes,
      actual_inbound_arr: inboundSim ? inboundSim.actual_arr : 'N/A',
      actual_outbound_dep: outboundSim ? outboundSim.actual_dep : 'N/A',
      available_transfer_min: transferWindow,
      is_broken: isBroken,
      break_reason: breakReason,
    };

    simulatedConnections[cx.connection_id] = cxSim;
    connectionList.push(cxSim);
  }

  // Calculate local passenger stranding for cancelled flights
  for (const f of scenario.flights) {
    const fSim = simulatedFlights[f.flight_id];
    if (fSim.status === 'CANCELLED') {
      const outCxs = outboundCxByFlight.get(f.flight_id) || [];
      const connectingPaxSum = outCxs.reduce((sum, c) => sum + c.passengers, 0);
      const localPax = Math.max(0, f.pax - connectingPaxSum);
      fSim.stranded_pax = localPax;
      totalStrandedPax += localPax;
    }
  }

  // 5. Network Metrics Aggregation
  let flightsOnTime = 0;
  let flightsDelayed = 0;
  let flightsCancelled = 0;
  let totalDelayMinutes = 0;
  let maxDelayMinutes = 0;
  const affectedAirportsSet = new Set<string>();
  const crewsAtLimitSet = new Set<string>();

  for (const f of flightList) {
    if (f.status === 'CANCELLED') {
      flightsCancelled++;
      affectedAirportsSet.add(f.origin);
      affectedAirportsSet.add(f.destination);
    } else if (f.status === 'DELAYED') {
      flightsDelayed++;
      totalDelayMinutes += f.delay_dep_min;
      if (f.delay_dep_min > maxDelayMinutes) {
        maxDelayMinutes = f.delay_dep_min;
      }
      affectedAirportsSet.add(f.origin);
      affectedAirportsSet.add(f.destination);
    } else {
      flightsOnTime++;
    }

    if (f.crew_duty_exceeded) {
      crewsAtLimitSet.add(f.crew_id);
    }
  }

  const metrics: NetworkMetrics = {
    totalFlights: flightList.length,
    flightsOnTime,
    flightsDelayed,
    flightsCancelled,
    totalDelayMinutes,
    averageDelayMinutes: flightList.length > 0 ? Math.round((totalDelayMinutes / flightList.length) * 10) / 10 : 0,
    maxDelayMinutes,
    strandedPax: totalStrandedPax,
    brokenConnections: totalBrokenConnections,
    crewsAtLimit: crewsAtLimitSet.size,
    airportsAffected: Array.from(affectedAirportsSet).sort(),
  };

  const scenarioHash = `${scenario.flights.length}_${closure ? `${closure.airport_id}_${closure.start_time}_${closure.end_time}` : 'baseline'}`;

  return {
    scenario_hash: scenarioHash,
    closure,
    flights: simulatedFlights,
    flight_list: flightList,
    connections: simulatedConnections,
    connection_list: connectionList,
    metrics,
  };
}
