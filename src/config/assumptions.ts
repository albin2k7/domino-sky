/**
 * Domino Sky - Core Operational Assumptions & Tunable Rules
 * 
 * Every parameter that governs deterministic flight propagation, crew duty limits,
 * airport closure semantics, cancellation thresholds, and passenger stranding is
 * centralized here.
 * 
 * Rule: Pure functions in /src/engine read these rules directly; no logic should
 * hardcode arbitrary numbers outside this configuration.
 */

export interface SystemAssumptions {
  /**
   * Minimum ground turnaround time for an aircraft (in minutes).
   * Physical constraint: deplaning, cleaning, refueling, boarding, and baggage loading.
   * Dataset baseline specifies 30 minutes.
   */
  MIN_TURNAROUND: number;

  /**
   * Minimum turnaround time for crew when changing aircraft or continuing duty (in minutes).
   * In baseline data, crews fly dedicated aircraft legs with >= 30m gap.
   * If crew swaps or continues, minimum briefing and transfer time is 30 minutes.
   */
  MIN_CREW_TURN: number;

  /**
   * Default Minimum Connection Time (MCT) for passengers transferring between flights (in minutes).
   * Specific connections in the dataset specify 40m or 45m.
   * If an unlisted connection occurs, this fallback is applied.
   */
  DEFAULT_MIN_CONNECTION_TIME: number;

  /**
   * Flight cancellation threshold (in minutes of cumulative departure or arrival delay).
   * In commercial airline operations, once a flight delay exceeds 240 minutes (4 hours),
   * passenger compensation, crew duty expiry, and airport slot expiration make
   * operating the flight unviable, triggering an operational cancellation.
   */
  CANCEL_THRESHOLD_MIN: number;

  /**
   * Maximum allowable crew flight duty period (FDP) in minutes from duty_start.
   * Indian DGCA standard: 600 minutes (10 hours) for standard domestic multi-sector operations.
   * If a delayed flight's actual arrival would push duty beyond 600 minutes,
   * the crew exceeds duty limit and cannot operate without replacement.
   */
  MAX_CREW_DUTY_MIN: number;

  /**
   * Maximum airborne holding duration before an arrival must divert or be ground-held (in minutes).
   * Standard fuel reserve holding policy: up to 30 minutes of terminal area holding.
   */
  MAX_AIRBORNE_HOLD_MIN: number;

  /**
   * Airport Closure Semantics:
   * How airport closures interact with scheduled flights.
   */
  CLOSURE_SEMANTICS: {
    /**
     * Departures scheduled during closure:
     * Flights on the ground at a closed airport are held until the closure window ends.
     * actualDep = max(scheduledDep, closureEnd, prevLegReadyTime)
     */
    DEPARTURES_HELD_UNTIL_REOPEN: boolean;

    /**
     * Arrivals scheduled during closure (Ground Delay Program / GDP):
     * Under realistic air traffic flow management, inbound flights are NOT launched
     * into endless holding; their departures at the origin airport are delayed so that
     * they arrive after the destination airport reopens:
     * actualArr >= closureEnd.
     */
    HOLD_ARRIVAL_VIA_ORIGIN_GROUND_DELAY: boolean;

    /**
     * Airborne flights already en route when closure begins:
     * If a flight is airborne when closure begins and would arrive during closure,
     * it may hold up to MAX_AIRBORNE_HOLD_MIN. If closure duration exceeds this,
     * the flight cannot land and must be cancelled/diverted.
     */
    ALLOW_AIRBORNE_HOLD_UP_TO_LIMIT: boolean;
  };

  /**
   * Aircraft Chain Cancellation Semantics:
   * How a cancelled flight affects downstream legs of the same aircraft.
   */
  AIRCRAFT_CHAIN_SEMANTICS: {
    /**
     * If flight N is cancelled, the aircraft remains at flight N's origin airport.
     * It does NOT magically teleport to flight N's destination.
     * Therefore, flight N+1 cannot operate with that aircraft from flight N's destination
     * unless a spare aircraft is swapped in or a recovery ferry is scheduled.
     * If neither occurs, flight N+1 is cascade-cancelled due to missing aircraft.
     */
    PROPAGATE_CANCELLATION_DOWN_CHAIN_IF_NO_AIRCRAFT: boolean;
  };

  /**
   * Multi-objective weights used by the Recovery Engine to score recovery candidates.
   * Higher score = better recovery outcome (greater net reduction in penalty).
   */
  RECOVERY_WEIGHTS: {
    /** Penalty weight per stranded passenger */
    STRANDED_PAX_PENALTY: number;
    /** Penalty weight per minute of total network delay */
    DELAY_MINUTE_PENALTY: number;
    /** Penalty weight per flight cancellation */
    CANCELLATION_PENALTY: number;
    /** Penalty weight per crew duty violation */
    CREW_VIOLATION_PENALTY: number;
  };
}

export const DEFAULT_ASSUMPTIONS: SystemAssumptions = {
  MIN_TURNAROUND: 30,
  MIN_CREW_TURN: 30,
  DEFAULT_MIN_CONNECTION_TIME: 45,
  CANCEL_THRESHOLD_MIN: 240,
  MAX_CREW_DUTY_MIN: 600,
  MAX_AIRBORNE_HOLD_MIN: 30,

  CLOSURE_SEMANTICS: {
    DEPARTURES_HELD_UNTIL_REOPEN: true,
    HOLD_ARRIVAL_VIA_ORIGIN_GROUND_DELAY: true,
    ALLOW_AIRBORNE_HOLD_UP_TO_LIMIT: true,
  },

  AIRCRAFT_CHAIN_SEMANTICS: {
    PROPAGATE_CANCELLATION_DOWN_CHAIN_IF_NO_AIRCRAFT: true,
  },

  RECOVERY_WEIGHTS: {
    STRANDED_PAX_PENALTY: 10.0,      // Heaviest weight: passenger experience & compensation
    CANCELLATION_PENALTY: 1000.0,    // High penalty: cancelling a whole flight is costly
    DELAY_MINUTE_PENALTY: 1.0,       // 1 penalty unit per flight delay minute
    CREW_VIOLATION_PENALTY: 500.0,   // Strict regulatory penalty for duty violation
  },
};
