const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'dataset.json'), 'utf8'));

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

console.log('=== CREW SCHEDULE DETAILS ===');
data.crews.forEach(cr => {
  const flights = cr.flight_ids.map(id => data.flights.find(f => f.flight_id === id));
  const dutyStart = toMinutes(cr.duty_start);
  const firstDep = toMinutes(flights[0].dep);
  const lastArr = toMinutes(flights[flights.length - 1].arr);
  const dutyDuration = lastArr - dutyStart;
  const slackToMaxDuty = cr.max_duty_mins - dutyDuration;
  console.log(`Crew ${cr.crew_id} (${cr.tail_id}) Base: ${cr.base} | Duty: ${cr.duty_start}-${flights[flights.length - 1].arr} (${dutyDuration} min / ${cr.max_duty_mins} min max) | Slack before duty limit: ${slackToMaxDuty} min | Legs: ${flights.length}`);
});

console.log('\n=== FLIGHT SLACK (SCHEDULED TURNAROUND VS MIN 30 MIN) ===');
const tailFlights = {};
data.flights.forEach(f => {
  if (!tailFlights[f.tail_id]) tailFlights[f.tail_id] = [];
  tailFlights[f.tail_id].push(f);
});

let totalSlackMin = 0;
Object.entries(tailFlights).forEach(([tail, flights]) => {
  flights.sort((a, b) => a.leg_order - b.leg_order);
  let tailSlack = 0;
  for (let i = 1; i < flights.length; i++) {
    const prev = flights[i - 1];
    const curr = flights[i];
    const turn = toMinutes(curr.dep) - toMinutes(prev.arr);
    const slack = turn - 30; // 30 is MIN_TURNAROUND
    tailSlack += slack;
  }
  totalSlackMin += tailSlack;
  console.log(`Tail ${tail}: ${flights.length} legs, total buffer/slack above 30m: ${tailSlack} min`);
});
console.log('Total network buffer slack above 30m turnaround:', totalSlackMin, 'min');

console.log('\n=== CONNECTIONS SLACK ===');
data.connections.forEach(c => {
  const fFrom = data.flights.find(f => f.flight_id === c.from_flight);
  const fTo = data.flights.find(f => f.flight_id === c.to_flight);
  const schFromArr = toMinutes(fFrom.arr);
  const schToDep = toMinutes(fTo.dep);
  const window = schToDep - schFromArr;
  const slack = window - c.min_connect_minutes;
  console.log(`${c.connection_id} at ${c.airport}: ${c.from_flight} -> ${c.to_flight} (${c.passengers} pax) | Window: ${window} min | MCT: ${c.min_connect_minutes} min | Slack: ${slack} min`);
});
