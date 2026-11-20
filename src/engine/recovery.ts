import type {
  Scenario,
  AirportClosure,
  RecoveryAction,
  EvaluatedRecoveryCandidate,
  MetricsDelta,
  SimulationResult,
} from '../types/index.ts';
import { DEFAULT_ASSUMPTIONS } from '../config/assumptions.ts';
import type { SystemAssumptions } from '../config/assumptions.ts';
import { simulate } from './simulate.ts';
import { timeToMinutes } from './validator.ts';

/**
 * Deep clone a scenario to ensure pure functional transformations without mutations.
 */
export function cloneScenario(scenario: Scenario): Scenario {
  return JSON.parse(JSON.stringify(scenario));
}

/**
 * Recovery Action 1: Cancel Flight
 * Pure function: marks a specific flight as cancelled.
 */
export function cancelFlight(scenario: Scenario, flightId: string): Scenario {
  const modified = cloneScenario(scenario);
  const flight = modified.flights.find(f => f.flight_id === flightId);
  if (flight) {
    flight.is_cancelled = true;
  }
  return modified;
}

/**
 * Recovery Action 2: Swap in Spare Aircraft
 * Pure function: assigns a spare aircraft (e.g. VT-DS17 at BLR or VT-DS18 at DEL)
 * to take over an aircraft's schedule starting from targetFlightId onwards.
 */
export function swapInSpareAircraft(
  scenario: Scenario,
  spareTailId: string,
  targetFlightId: string
): Scenario {
  const modified = cloneScenario(scenario);
  const targetFlight = modified.flights.find(f => f.flight_id === targetFlightId);
  if (!targetFlight) return modified;

  const originalTailId = targetFlight.tail_id;
  const targetLegOrder = targetFlight.leg_order;

  // Swap target flight and subsequent legs on the same original tail to the spare aircraft
  for (const f of modified.flights) {
    if (f.tail_id === originalTailId && f.leg_order >= targetLegOrder) {
      f.tail_id = spareTailId;
    }
  }

  return modified;
}

/**
 * Recovery Action 3: Hold Outbound Flight for Connection
 * Pure function: holds an outbound flight by N minutes to protect connecting passengers.
 */
export function holdForConnections(
  scenario: Scenario,
  toFlightId: string,
  holdMinutes: number
): Scenario {
  const modified = cloneScenario(scenario);
  const flight = modified.flights.find(f => f.flight_id === toFlightId);
  if (flight) {
    flight.hold_minutes = (flight.hold_minutes || 0) + holdMinutes;
  }
  return modified;
}

/**
 * Evaluates a single recovery action against the baseline scenario and closure.
 * Returns an EvaluatedRecoveryCandidate with exact before/after metrics and score.
 */
export function evaluateAction(
  baselineResult: SimulationResult,
  scenario: Scenario,
  closure: AirportClosure | null,
  action: RecoveryAction,
  assumptions: SystemAssumptions = DEFAULT_ASSUMPTIONS
): EvaluatedRecoveryCandidate {
  let modifiedScenario = scenario;

  if (action.type === 'CANCEL_FLIGHT') {
    modifiedScenario = cancelFlight(scenario, action.flight_ids[0]);
  } else if (action.type === 'SWAP_IN_SPARE_AIRCRAFT') {
    const spareTail = action.parameters.spareTailId as string;
    modifiedScenario = swapInSpareAircraft(scenario, spareTail, action.flight_ids[0]);
  } else if (action.type === 'HOLD_FOR_CONNECTION') {
    const holdMin = action.parameters.holdMinutes as number;
    modifiedScenario = holdForConnections(scenario, action.flight_ids[0], holdMin);
  }

  const afterResult = simulate(modifiedScenario, closure, assumptions);

  const deltaTotalDelayMinutes = afterResult.metrics.totalDelayMinutes - baselineResult.metrics.totalDelayMinutes;
  const deltaStrandedPax = afterResult.metrics.strandedPax - baselineResult.metrics.strandedPax;
  const deltaFlightsCancelled = afterResult.metrics.flightsCancelled - baselineResult.metrics.flightsCancelled;
  const deltaBrokenConnections = afterResult.metrics.brokenConnections - baselineResult.metrics.brokenConnections;
  const deltaCrewsAtLimit = afterResult.metrics.crewsAtLimit - baselineResult.metrics.crewsAtLimit;

  // Objective function: positive score = net improvement
  const score = -1 * (
    deltaStrandedPax * assumptions.RECOVERY_WEIGHTS.STRANDED_PAX_PENALTY +
    deltaTotalDelayMinutes * assumptions.RECOVERY_WEIGHTS.DELAY_MINUTE_PENALTY +
    deltaFlightsCancelled * assumptions.RECOVERY_WEIGHTS.CANCELLATION_PENALTY +
    deltaCrewsAtLimit * assumptions.RECOVERY_WEIGHTS.CREW_VIOLATION_PENALTY
  );

  const deltas: MetricsDelta = {
    deltaTotalDelayMinutes,
    deltaStrandedPax,
    deltaFlightsCancelled,
    deltaBrokenConnections,
    deltaCrewsAtLimit,
    score: Math.round(score * 10) / 10,
  };

  return {
    action,
    score: Math.round(score * 10) / 10,
    beforeMetrics: baselineResult.metrics,
    afterMetrics: afterResult.metrics,
    deltas,
    modifiedScenario,
  };
}

/**
 * Generates and ranks all valid single recovery actions and greedily finds composite actions.
 */
export function generateRecoveryCandidates(
  scenario: Scenario,
  closure: AirportClosure | null,
  assumptions: SystemAssumptions = DEFAULT_ASSUMPTIONS
): EvaluatedRecoveryCandidate[] {
  const baseResult = simulate(scenario, closure, assumptions);
  if (baseResult.metrics.flightsDelayed === 0 && baseResult.metrics.flightsCancelled === 0) {
    return []; // Network is already operating smoothly
  }

  const candidates: EvaluatedRecoveryCandidate[] = [];
  const evaluatedActionIds = new Set<string>();

  // 1. Candidate Spare Swaps
  // Spares: VT-DS17 at BLR, VT-DS18 at DEL
  for (const spare of scenario.spare_aircraft) {
    const spareAvailM = timeToMinutes(spare.available_from);

    for (const f of scenario.flights) {
      const sim = baseResult.flights[f.flight_id];
      // Flight must originate at spare base, be delayed or cancelled, and depart after spare is available
      if (
        f.origin === spare.base &&
        (sim.status === 'DELAYED' || sim.status === 'CANCELLED') &&
        timeToMinutes(f.dep) >= spareAvailM
      ) {
        const actionId = `swap_${f.flight_id}_${spare.tail_id}`;
        if (!evaluatedActionIds.has(actionId)) {
          evaluatedActionIds.add(actionId);
          const action: RecoveryAction = {
            id: actionId,
            type: 'SWAP_IN_SPARE_AIRCRAFT',
            label: `Deploy Spare ${spare.tail_id} for ${f.flight_id} at ${spare.base}`,
            description: `Swap fresh standby aircraft ${spare.tail_id} at ${spare.base} into flight ${f.flight_id} to cut cascading delays downstream.`,
            flight_ids: [f.flight_id],
            parameters: { spareTailId: spare.tail_id, flightId: f.flight_id },
          };
          candidates.push(evaluateAction(baseResult, scenario, closure, action, assumptions));
        }
      }
    }
  }

  // 2. Candidate Connection Holds
  for (const cx of scenario.connections) {
    const cxSim = baseResult.connections[cx.connection_id];
    if (cxSim && cxSim.is_broken && cxSim.break_reason === 'MISSED_CONNECTION') {
      const inboundSim = baseResult.flights[cx.from_flight];
      const outboundSim = baseResult.flights[cx.to_flight];
      if (inboundSim && outboundSim && inboundSim.status !== 'CANCELLED' && outboundSim.status !== 'CANCELLED') {
        const neededHold = (inboundSim.actual_arr_min + cx.min_connect_minutes) - outboundSim.actual_dep_min;
        if (neededHold > 0 && neededHold <= 30) {
          const actionId = `hold_${cx.to_flight}_${neededHold}m_for_${cx.connection_id}`;
          if (!evaluatedActionIds.has(actionId)) {
            evaluatedActionIds.add(actionId);
            const action: RecoveryAction = {
              id: actionId,
              type: 'HOLD_FOR_CONNECTION',
              label: `Hold ${cx.to_flight} by ${neededHold}m at ${cx.airport}`,
              description: `Hold outbound flight ${cx.to_flight} by ${neededHold} minutes to protect ${cx.passengers} connecting passengers from ${cx.from_flight}.`,
              flight_ids: [cx.to_flight],
              parameters: { flightId: cx.to_flight, holdMinutes: neededHold, connectionId: cx.connection_id },
            };
            candidates.push(evaluateAction(baseResult, scenario, closure, action, assumptions));
          }
        }
      }
    }
  }

  // 3. Candidate Flight Cancellations
  // Test cancelling heavily delayed flights (e.g. delay > 60m)
  for (const f of scenario.flights) {
    const sim = baseResult.flights[f.flight_id];
    if (sim && sim.status === 'DELAYED' && sim.delay_dep_min >= 45) {
      const actionId = `cancel_${f.flight_id}`;
      if (!evaluatedActionIds.has(actionId)) {
        evaluatedActionIds.add(actionId);
        const action: RecoveryAction = {
          id: actionId,
          type: 'CANCEL_FLIGHT',
          label: `Cancel ${f.flight_id} (${f.origin} -> ${f.destination})`,
          description: `Cancel heavily delayed flight ${f.flight_id} (${sim.delay_dep_min}m late) to halt downstream knock-on delays.`,
          flight_ids: [f.flight_id],
          parameters: { flightId: f.flight_id },
        };
        candidates.push(evaluateAction(baseResult, scenario, closure, action, assumptions));
      }
    }
  }

  // Sort candidates by score descending
  candidates.sort((a, b) => b.score - a.score);

  // 4. Greedy 2-Action Composite Search
  // If we have at least one winning action, try pairing it with a second complementary action
  if (candidates.length > 0 && candidates[0].score > 0) {
    const bestFirst = candidates[0];
    const scenarioStage1 = bestFirst.modifiedScenario;
    const stage1Result = simulate(scenarioStage1, closure, assumptions);

    // Look for second action from remaining candidates
    for (let i = 1; i < Math.min(candidates.length, 5); i++) {
      const secondCandidate = candidates[i];
      // Skip if modifying the same flight
      if (secondCandidate.action.flight_ids[0] === bestFirst.action.flight_ids[0]) continue;

      let scenarioStage2 = scenarioStage1;
      if (secondCandidate.action.type === 'HOLD_FOR_CONNECTION') {
        const holdMin = secondCandidate.action.parameters.holdMinutes as number;
        scenarioStage2 = holdForConnections(scenarioStage1, secondCandidate.action.flight_ids[0], holdMin);
      } else if (secondCandidate.action.type === 'SWAP_IN_SPARE_AIRCRAFT') {
        const spareTail = secondCandidate.action.parameters.spareTailId as string;
        scenarioStage2 = swapInSpareAircraft(scenarioStage1, spareTail, secondCandidate.action.flight_ids[0]);
      } else if (secondCandidate.action.type === 'CANCEL_FLIGHT') {
        scenarioStage2 = cancelFlight(scenarioStage1, secondCandidate.action.flight_ids[0]);
      }

      const stage2Result = simulate(scenarioStage2, closure, assumptions);
      const deltaTotalDelayMinutes = stage2Result.metrics.totalDelayMinutes - baseResult.metrics.totalDelayMinutes;
      const deltaStrandedPax = stage2Result.metrics.strandedPax - baseResult.metrics.strandedPax;
      const deltaFlightsCancelled = stage2Result.metrics.flightsCancelled - baseResult.metrics.flightsCancelled;
      const deltaBrokenConnections = stage2Result.metrics.brokenConnections - baseResult.metrics.brokenConnections;
      const deltaCrewsAtLimit = stage2Result.metrics.crewsAtLimit - baseResult.metrics.crewsAtLimit;

      const compositeScore = -1 * (
        deltaStrandedPax * assumptions.RECOVERY_WEIGHTS.STRANDED_PAX_PENALTY +
        deltaTotalDelayMinutes * assumptions.RECOVERY_WEIGHTS.DELAY_MINUTE_PENALTY +
        deltaFlightsCancelled * assumptions.RECOVERY_WEIGHTS.CANCELLATION_PENALTY +
        deltaCrewsAtLimit * assumptions.RECOVERY_WEIGHTS.CREW_VIOLATION_PENALTY
      );

      // If composite outperforms best single action, add it
      if (compositeScore > bestFirst.score) {
        const compositeAction: RecoveryAction = {
          id: `composite_${bestFirst.action.id}__${secondCandidate.action.id}`,
          type: 'COMPOSITE_ACTION',
          label: `${bestFirst.action.label} + ${secondCandidate.action.label}`,
          description: `Combined Recovery: 1) ${bestFirst.action.description} 2) ${secondCandidate.action.description}`,
          flight_ids: [...bestFirst.action.flight_ids, ...secondCandidate.action.flight_ids],
          parameters: {
            firstAction: bestFirst.action,
            secondAction: secondCandidate.action,
          },
        };

        candidates.unshift({
          action: compositeAction,
          score: Math.round(compositeScore * 10) / 10,
          beforeMetrics: baseResult.metrics,
          afterMetrics: stage2Result.metrics,
          deltas: {
            deltaTotalDelayMinutes,
            deltaStrandedPax,
            deltaFlightsCancelled,
            deltaBrokenConnections,
            deltaCrewsAtLimit,
            score: Math.round(compositeScore * 10) / 10,
          },
          modifiedScenario: scenarioStage2,
        });
        break; // Keep best composite
      }
    }
  }

  return candidates;
}
