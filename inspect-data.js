const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'data', 'dataset.json');
const raw = fs.readFileSync(dataPath, 'utf8');
const data = JSON.parse(raw);

console.log('=== METADATA ===');
console.log(data.meta);

console.log('\n=== COUNTS ===');
console.log('Airports:', data.airports.length);
console.log('Flights:', data.flights.length);
console.log('Connections:', data.connections.length);
console.log('Crews:', data.crews.length);
console.log('Spare Aircraft:', data.spare_aircraft.length);

console.log('\n=== AIRPORT SCHEMA SAMPLE ===');
console.log(data.airports[0]);

console.log('\n=== FLIGHT SCHEMA SAMPLE ===');
console.log(data.flights[0]);

console.log('\n=== CONNECTION SCHEMA SAMPLE ===');
console.log(data.connections[0]);

console.log('\n=== CREW SCHEMA SAMPLE ===');
console.log(data.crews[0]);

console.log('\n=== SPARE AIRCRAFT SCHEMA SAMPLE ===');
console.log(data.spare_aircraft[0]);

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// 1. Check unique IDs
const airportIds = new Set(data.airports.map(a => a.id));
const flightIds = new Set(data.flights.map(f => f.flight_id));
const crewIds = new Set(data.crews.map(c => c.crew_id));
const spareTailIds = new Set(data.spare_aircraft.map(s => s.tail_id));

console.log('\n=== VALIDATION CHECKS ===');

// Check airport references in flights
const unknownAirportsInFlights = [];
data.flights.forEach(f => {
  if (!airportIds.has(f.origin)) unknownAirportsInFlights.push(`${f.flight_id} origin ${f.origin}`);
  if (!airportIds.has(f.destination)) unknownAirportsInFlights.push(`${f.flight_id} destination ${f.destination}`);
});
console.log('Unknown airports in flights:', unknownAirportsInFlights);

// Check tail_ids
const tailFlights = {};
data.flights.forEach(f => {
  if (!tailFlights[f.tail_id]) tailFlights[f.tail_id] = [];
  tailFlights[f.tail_id].push(f);
});
console.log('Total aircraft tails in flights:', Object.keys(tailFlights).length);

// Check flights per aircraft: leg_order, chain continuity, turnarounds, overlaps
const aircraftIssues = [];
Object.entries(tailFlights).forEach(([tail, flights]) => {
  // sort by leg_order
  flights.sort((a, b) => a.leg_order - b.leg_order);
  
  for (let i = 0; i < flights.length; i++) {
    const f = flights[i];
    const depM = toMinutes(f.dep);
    const arrM = toMinutes(f.arr);
    
    // Check block minutes
    const calculatedBlock = arrM - depM;
    if (calculatedBlock !== f.block_minutes) {
      aircraftIssues.push(`[BlockMismatch] Flight ${f.flight_id}: dep ${f.dep} arr ${f.arr} diff ${calculatedBlock} != block_minutes ${f.block_minutes}`);
    }

    if (i > 0) {
      const prev = flights[i - 1];
      const prevArrM = toMinutes(prev.arr);
      
      // Chain continuity
      if (prev.destination !== f.origin) {
        aircraftIssues.push(`[BrokenChain] ${tail}: ${prev.flight_id} ends at ${prev.destination} but ${f.flight_id} starts at ${f.origin}`);
      }
      
      // Turnaround gap
      const gap = depM - prevArrM;
      if (f.turnaround_before_min !== null && f.turnaround_before_min !== gap) {
        aircraftIssues.push(`[TurnaroundMismatch] ${tail}: gap between ${prev.flight_id} (${prev.arr}) and ${f.flight_id} (${f.dep}) is ${gap}m, but turnaround_before_min is ${f.turnaround_before_min}m`);
      }
      if (gap < 30) {
        aircraftIssues.push(`[InsufficientTurnaround] ${tail}: gap between ${prev.flight_id} and ${f.flight_id} is ${gap}m (< 30m minimum)`);
      }
      if (depM < prevArrM) {
        aircraftIssues.push(`[Overlap] ${tail}: ${f.flight_id} departs ${f.dep} before ${prev.flight_id} arrives ${prev.arr}`);
      }
    } else {
      if (f.turnaround_before_min !== null) {
        aircraftIssues.push(`[FirstLegTurnaroundNotNull] ${tail}: first leg ${f.flight_id} has turnaround_before_min ${f.turnaround_before_min}`);
      }
    }
  }
});

console.log('\nAircraft chain issues:');
if (aircraftIssues.length === 0) console.log('None! All aircraft chains are continuous, non-overlapping, and respect turnaround.');
else aircraftIssues.forEach(iss => console.log(' -', iss));

// Check connections
const connectionIssues = [];
data.connections.forEach(cx => {
  const fFrom = data.flights.find(f => f.flight_id === cx.from_flight);
  const fTo = data.flights.find(f => f.flight_id === cx.to_flight);
  
  if (!fFrom) {
    connectionIssues.push(`[UnknownFromFlight] ${cx.connection_id}: from_flight ${cx.from_flight} not found`);
  }
  if (!fTo) {
    connectionIssues.push(`[UnknownToFlight] ${cx.connection_id}: to_flight ${cx.to_flight} not found`);
  }
  if (fFrom && fTo) {
    if (fFrom.destination !== cx.airport) {
      connectionIssues.push(`[AirportMismatch] ${cx.connection_id}: from_flight ${fFrom.flight_id} destination ${fFrom.destination} != connection airport ${cx.airport}`);
    }
    if (fTo.origin !== cx.airport) {
      connectionIssues.push(`[AirportMismatch] ${cx.connection_id}: to_flight ${fTo.flight_id} origin ${fTo.origin} != connection airport ${cx.airport}`);
    }
    const fromArr = toMinutes(fFrom.arr);
    const toDep = toMinutes(fTo.dep);
    const connectTime = toDep - fromArr;
    if (connectTime < cx.min_connect_minutes) {
      connectionIssues.push(`[TightConnection] ${cx.connection_id}: connect time ${connectTime}m < min_connect_minutes ${cx.min_connect_minutes}m`);
    }
    // Pax capacity checks
    if (cx.passengers > fFrom.pax) {
      connectionIssues.push(`[PaxOverInbound] ${cx.connection_id}: cx pax ${cx.passengers} > inbound flight pax ${fFrom.pax}`);
    }
    if (cx.passengers > fTo.pax) {
      connectionIssues.push(`[PaxOverOutbound] ${cx.connection_id}: cx pax ${cx.passengers} > outbound flight pax ${fTo.pax}`);
    }
  }
});

console.log('\nConnection issues:');
if (connectionIssues.length === 0) console.log('None! All connections valid and meet min_connect_minutes.');
else connectionIssues.forEach(iss => console.log(' -', iss));

// Check crews
const crewIssues = [];
data.crews.forEach(cr => {
  const cFlights = cr.flight_ids.map(fid => data.flights.find(f => f.flight_id === fid));
  
  // check unknown flight
  cFlights.forEach((f, idx) => {
    if (!f) crewIssues.push(`[UnknownFlight] Crew ${cr.crew_id} references unknown flight ${cr.flight_ids[idx]}`);
  });
  
  const validFlights = cFlights.filter(Boolean);
  if (validFlights.length > 0) {
    const firstFlight = validFlights[0];
    const lastFlight = validFlights[validFlights.length - 1];
    
    // Check base vs first flight origin
    if (firstFlight.origin !== cr.base) {
      crewIssues.push(`[CrewBaseMismatch] Crew ${cr.crew_id} base ${cr.base} != first flight origin ${firstFlight.origin} (${firstFlight.flight_id})`);
    }
    
    // Check duty start vs first flight departure
    const dutyStartM = toMinutes(cr.duty_start);
    const firstDepM = toMinutes(firstFlight.dep);
    const reportTime = firstDepM - dutyStartM;
    if (dutyStartM > firstDepM) {
      crewIssues.push(`[DutyStartAfterDep] Crew ${cr.crew_id} duty start ${cr.duty_start} is after first flight dep ${firstFlight.dep}`);
    }
    
    // Check total duty
    const lastArrM = toMinutes(lastFlight.arr);
    const scheduledDutyM = lastArrM - dutyStartM;
    if (scheduledDutyM > cr.max_duty_mins) {
      crewIssues.push(`[ScheduledDutyExceeded] Crew ${cr.crew_id} scheduled duty ${scheduledDutyM}m > max ${cr.max_duty_mins}m`);
    }
    
    // Geographic continuity and aircraft matching
    for (let i = 0; i < validFlights.length; i++) {
      const f = validFlights[i];
      if (cr.tail_id && f.tail_id !== cr.tail_id) {
        crewIssues.push(`[CrewAircraftMismatch] Crew ${cr.crew_id} assigned tail ${cr.tail_id} but flight ${f.flight_id} is on ${f.tail_id}`);
      }
      if (i > 0) {
        const prev = validFlights[i - 1];
        if (prev.destination !== f.origin) {
          crewIssues.push(`[CrewBrokenChain] Crew ${cr.crew_id} leg ${prev.flight_id} ends at ${prev.destination} but next ${f.flight_id} starts at ${f.origin}`);
        }
      }
    }
  }
});

console.log('\nCrew issues:');
if (crewIssues.length === 0) console.log('None! All crew chains continuous, respect duty limits, and match base.');
else crewIssues.forEach(iss => console.log(' -', iss));

// Check spare aircraft
console.log('\n=== SPARE AIRCRAFT DETAILS ===');
data.spare_aircraft.forEach(s => {
  console.log(`Spare ${s.tail_id} at ${s.base}, available from ${s.available_from}, seats: ${s.seats}`);
});

// Check connecting passenger sum vs outbound flight capacity / total passengers
console.log('\n=== PASSENGER CONNECTION LOAD CHECKS ===');
const inboundConnectingPax = {};
const outboundConnectingPax = {};
data.connections.forEach(c => {
  inboundConnectingPax[c.from_flight] = (inboundConnectingPax[c.from_flight] || 0) + c.passengers;
  outboundConnectingPax[c.to_flight] = (outboundConnectingPax[c.to_flight] || 0) + c.passengers;
});

let paxSumIssues = [];
Object.entries(inboundConnectingPax).forEach(([fid, pax]) => {
  const f = data.flights.find(fl => fl.flight_id === fid);
  if (pax > f.pax) paxSumIssues.push(`Inbound flight ${fid} total pax ${f.pax} < sum of connecting pax ${pax}`);
});
Object.entries(outboundConnectingPax).forEach(([fid, pax]) => {
  const f = data.flights.find(fl => fl.flight_id === fid);
  if (pax > f.pax) paxSumIssues.push(`Outbound flight ${fid} total pax ${f.pax} < sum of connecting pax ${pax}`);
});
if (paxSumIssues.length === 0) console.log('Passenger connection loads are all valid (connections sum <= flight pax).');
else paxSumIssues.forEach(iss => console.log(' -', iss));
