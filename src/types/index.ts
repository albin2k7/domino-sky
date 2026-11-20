// Domino Sky: Complete Domain, Engine, and Recovery Types

export type AirportTier = 'mega_hub' | 'regional_hub' | 'spoke';

export interface Airport {
  id: string; // 3-letter IATA code, e.g. "DEL", "BOM"
  name: string;
  city: string;
  lat: number;
  lng: number;
  tier: AirportTier;
  capacity_per_hour: number;
}

export interface Flight {
  flight_id: string; // e.g. "DS0101"
  tail_id: string; // e.g. "VT-DS01"
  leg_order: number; // 1-indexed leg sequence
  origin: string; // IATA code
  destination: string; // IATA code
  dep: string; // "HH:MM" 24h format local IST
  arr: string; // "HH:MM" 24h format local IST
  block_minutes: number; // Scheduled duration in minutes
  pax: number; // Booked passenger count
  turnaround_before_min: number | null; // Scheduled buffer before this leg (null for leg 1)
  is_cancelled?: boolean; // Set by recovery action or cascade
  hold_minutes?: number; // Intentional operational hold applied by recovery
}

export interface Aircraft {
  tail_id: string; // e.g. "VT-DS01"
  base: string; // Initial airport origin for leg 1
  is_spare: boolean;
  seats: number;
}

export interface Connection {
  connection_id: string; // e.g. "CX01"
  airport: string; // Transit airport where transfer occurs
  from_flight: string; // Inbound flight ID
  to_flight: string; // Outbound flight ID
  passengers: number; // Booked connecting passengers
  min_connect_minutes: number; // Minimum connection time (MCT) in minutes
}

export interface Crew {
  crew_id: string; // e.g. "CR01"
  tail_id: string; // Initial assigned aircraft tail
  base: string; // Crew home base airport
  duty_start: string; // "HH:MM" report time (scheduled 45m before first departure)
  max_duty_mins: number; // Maximum legal duty duration (e.g. 600 min)
  flight_ids: string[]; // List of flight IDs in duty sequence
}

export interface SpareAircraft {
  tail_id: string; // e.g. "VT-DS17"
  base: string; // Airport where standby aircraft is parked ("BLR" or "DEL")
  available_from: string; // "HH:MM" when standby becomes available (e.g. "05:00")
  seats: number; // 180
}

export interface DatasetMeta {
  dataset: string;
  operating_day: string;
  min_turnaround_minutes: number;
  seats_per_aircraft: number;
  notes: string[];
}

export interface Scenario {
  meta?: DatasetMeta;
  airports: Airport[];
  flights: Flight[];
  connections: Connection[];
  crews: Crew[];
  spare_aircraft: SpareAircraft[];
}

export type Dataset = Scenario;

// Operational & Engine Types

export interface AirportClosure {
  airport_id: string;
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
}

export type DelayCause = 
  | 'NONE'
  | 'AIRPORT_CLOSURE'
  | 'LATE_AIRCRAFT'
  | 'LATE_CREW'
  | 'CREW_DUTY_LIMIT';

export type FlightStatus = 'ON_TIME' | 'DELAYED' | 'CANCELLED';

export interface FlightSimulation {
  flight_id: string;
  tail_id: string;
  crew_id: string;
  origin: string;
  destination: string;
  scheduled_dep: string;
  scheduled_arr: string;
  actual_dep: string;
  actual_arr: string;
  scheduled_dep_min: number;
  scheduled_arr_min: number;
  actual_dep_min: number;
  actual_arr_min: number;
  delay_dep_min: number;
  delay_arr_min: number;
  status: FlightStatus;
  cause: DelayCause;
  caused_by: string | null; // flight_id or closure reference string
  causal_chain: string[]; // Full trace e.g. ["CLOSURE:BOM", "DS0204", "DS0205"]
  stranded_pax: number; // Passengers stranded specifically on this flight (local pax if cancelled)
  crew_duty_exceeded: boolean;
  actual_crew_duty_min: number;
}

export interface ConnectionSimulation {
  connection_id: string;
  airport: string;
  from_flight: string;
  to_flight: string;
  passengers: number;
  min_connect_minutes: number;
  actual_inbound_arr: string;
  actual_outbound_dep: string;
  available_transfer_min: number;
  is_broken: boolean;
  break_reason: 'INBOUND_CANCELLED' | 'OUTBOUND_CANCELLED' | 'MISSED_CONNECTION' | null;
}

export interface NetworkMetrics {
  totalFlights: number;
  flightsOnTime: number;
  flightsDelayed: number;
  flightsCancelled: number;
  totalDelayMinutes: number;
  averageDelayMinutes: number;
  maxDelayMinutes: number;
  strandedPax: number;
  brokenConnections: number;
  crewsAtLimit: number;
  airportsAffected: string[];
}

export interface SimulationResult {
  scenario_hash: string;
  closure: AirportClosure | null;
  flights: Record<string, FlightSimulation>;
  flight_list: FlightSimulation[];
  connections: Record<string, ConnectionSimulation>;
  connection_list: ConnectionSimulation[];
  metrics: NetworkMetrics;
}

// Recovery Types

export type RecoveryActionType =
  | 'CANCEL_FLIGHT'
  | 'SWAP_IN_SPARE_AIRCRAFT'
  | 'SWAP_AIRCRAFT_CHAINS'
  | 'HOLD_FOR_CONNECTION'
  | 'REPLACE_CREW'
  | 'COMPOSITE_ACTION';

export interface RecoveryAction {
  id: string; // e.g. "cancel_DS0204", "swap_DS0105_VT-DS18"
  type: RecoveryActionType;
  label: string;
  description: string;
  flight_ids: string[];
  parameters: Record<string, unknown>;
}

export interface MetricsDelta {
  deltaTotalDelayMinutes: number; // negative is good (reduced delay)
  deltaStrandedPax: number; // negative is good (fewer stranded pax)
  deltaFlightsCancelled: number;
  deltaBrokenConnections: number;
  deltaCrewsAtLimit: number;
  score: number; // Positive is overall improvement
}

export interface EvaluatedRecoveryCandidate {
  action: RecoveryAction;
  score: number;
  beforeMetrics: NetworkMetrics;
  afterMetrics: NetworkMetrics;
  deltas: MetricsDelta;
  modifiedScenario: Scenario;
}

// Validation Types
export interface ValidationError {
  type: 
    | 'AIRCRAFT_OVERLAP'
    | 'BROKEN_AIRCRAFT_CHAIN'
    | 'INSUFFICIENT_TURNAROUND'
    | 'UNKNOWN_AIRPORT'
    | 'UNKNOWN_FLIGHT_IN_CONNECTION'
    | 'CONNECTION_AIRPORT_MISMATCH'
    | 'CONNECTION_WINDOW_NEGATIVE'
    | 'PAX_EXCEEDS_CAPACITY'
    | 'UNKNOWN_FLIGHT_IN_CREW'
    | 'BROKEN_CREW_CHAIN'
    | 'CREW_BASE_MISMATCH'
    | 'CREW_DUTY_EXCEEDED_AT_BASELINE';
  entity_id: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ValidationReport {
  valid: boolean;
  error_count: number;
  errors: ValidationError[];
  stats: {
    airportCount: number;
    flightCount: number;
    aircraftCount: number;
    connectionCount: number;
    crewCount: number;
    spareCount: number;
    totalBufferSlackMin: number;
  };
}
