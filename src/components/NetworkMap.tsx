import React from 'react';
import type { Airport, AirportClosure, SimulationResult, FlightSimulation } from '../types';

interface NetworkMapProps {
  airports: Airport[];
  closure: AirportClosure | null;
  simulation: SimulationResult;
  selectedFlight: FlightSimulation | null;
  onSelectAirport: (airportId: string) => void;
}

export const NetworkMap: React.FC<NetworkMapProps> = ({
  airports,
  closure,
  simulation,
  selectedFlight,
  onSelectAirport,
}) => {
  const width = 640;
  const height = 480;

  const minLat = 7.5, maxLat = 32.5, minLng = 71.0, maxLng = 93.5;

  const project = (lat: number, lng: number) => ({
    x: ((lng - minLng) / (maxLng - minLng)) * (width - 80) + 40,
    y: ((maxLat - lat) / (maxLat - minLat)) * (height - 80) + 40,
  });

  const airportCoords = new Map<string, { x: number; y: number }>();
  airports.forEach(a => airportCoords.set(a.id, project(a.lat, a.lng)));

  // Per-airport delay count
  const delayedAtAirport = new Map<string, number>();
  simulation.flight_list.forEach(f => {
    if (f.status === 'DELAYED' || f.status === 'CANCELLED') {
      delayedAtAirport.set(f.origin, (delayedAtAirport.get(f.origin) || 0) + 1);
      delayedAtAirport.set(f.destination, (delayedAtAirport.get(f.destination) || 0) + 1);
    }
  });

  // Unique routes
  const routes = new Map<string, { origin: string; destination: string; flights: FlightSimulation[] }>();
  simulation.flight_list.forEach(f => {
    const key = [f.origin, f.destination].sort().join('-');
    const ex = routes.get(key) || { origin: f.origin, destination: f.destination, flights: [] };
    ex.flights.push(f);
    routes.set(key, ex);
  });

  const handleAirportKey = (e: React.KeyboardEvent, airportId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelectAirport(airportId);
    }
  };

  return (
    <div className="glass-panel p-4 flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent inline-block" aria-hidden="true" />
          Indian Airspace Network
        </h3>
        <div className="flex items-center gap-3 text-xs font-mono text-muted" role="legend" aria-label="Map legend">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-ok inline-block" aria-hidden="true" />● Normal</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warn inline-block" aria-hidden="true" />▲ Delayed</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-closed inline-block" aria-hidden="true" />✕ Closed</span>
        </div>
      </div>

      <div className="relative flex-1 bg-bg border border-line rounded-xl overflow-hidden flex items-center justify-center">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full max-h-[380px]"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-labelledby="map-title map-desc"
        >
          <title id="map-title">Indian Airspace Network Map</title>
          <desc id="map-desc">
            Interactive network map showing {airports.length} airports across India.
            {closure ? ` ${closure.airport_id} is currently closed.` : ' No closures active.'}
            {` ${simulation.metrics.flightsDelayed} flights delayed, ${simulation.metrics.flightsCancelled} cancelled.`}
          </desc>
          <defs>
            {/* Subtle grid */}
            <pattern id="ds-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--line)" strokeWidth="0.5" strokeOpacity="0.4" />
            </pattern>
            {/* Glow filters */}
            <filter id="glow-warn" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="glow-danger" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <rect width={width} height={height} fill="url(#ds-grid)" />

          {/* Edges */}
          {Array.from(routes.values()).map(r => {
            const p1 = airportCoords.get(r.origin);
            const p2 = airportCoords.get(r.destination);
            if (!p1 || !p2) return null;

            const hasCancelled = r.flights.some(f => f.status === 'CANCELLED');
            const hasDelayed = r.flights.some(f => f.status === 'DELAYED');
            const isSelected = selectedFlight && (
              (selectedFlight.origin === r.origin && selectedFlight.destination === r.destination) ||
              (selectedFlight.origin === r.destination && selectedFlight.destination === r.origin)
            );

            let stroke = 'var(--ok)';
            let sw = 1.2;
            let dash: string | undefined;
            let filter: string | undefined;
            let opacity = 0.55;

            if (isSelected) { stroke = 'var(--accent)'; sw = 3; opacity = 1; filter = 'url(#glow-warn)'; }
            else if (hasCancelled) { stroke = 'var(--closed)'; sw = 1.8; dash = '4,4'; opacity = 0.75; }
            else if (hasDelayed) { stroke = 'var(--warn)'; sw = 1.8; opacity = 0.75; filter = 'url(#glow-warn)'; }

            const dx = p2.x - p1.x, dy = p2.y - p1.y;
            const cx = (p1.x + p2.x) / 2 - dy * 0.12;
            const cy = (p1.y + p2.y) / 2 + dx * 0.12;

            return (
              <path
                key={`${r.origin}-${r.destination}`}
                d={`M ${p1.x} ${p1.y} Q ${cx} ${cy} ${p2.x} ${p2.y}`}
                fill="none"
                stroke={stroke}
                strokeWidth={sw}
                strokeDasharray={dash}
                strokeOpacity={opacity}
                filter={filter}
              />
            );
          })}

          {/* Airport Nodes */}
          {airports.map(a => {
            const pos = airportCoords.get(a.id);
            if (!pos) return null;

            const isClosed = closure?.airport_id === a.id;
            const delayedCount = delayedAtAirport.get(a.id) || 0;
            const isMegaHub = a.tier === 'mega_hub';
            const r = isMegaHub ? 8 : a.tier === 'regional_hub' ? 6.5 : 5;

            const fill = isClosed ? 'var(--closed)' : delayedCount > 0 ? 'var(--warn)' : 'var(--ok)';
            const textFill = isClosed ? 'var(--closed)' : delayedCount > 0 ? 'var(--warn)' : 'var(--muted)';
            const statusText = isClosed ? 'closed' : delayedCount > 0 ? `${delayedCount} affected flights` : 'normal';

            return (
              <g
                key={a.id}
                onClick={() => onSelectAirport(a.id)}
                onKeyDown={(e) => handleAirportKey(e, a.id)}
                className="cursor-pointer group"
                tabIndex={0}
                role="button"
                aria-label={`${a.id} ${a.city}, ${statusText}`}
              >
                {/* Pulsing closed halo */}
                {isClosed && (
                  <circle
                    cx={pos.x} cy={pos.y} r={r * 2.8}
                    fill="var(--closed)" fillOpacity="0.2"
                    className="animate-radar-ping"
                  />
                )}
                {/* Outer ring */}
                <circle cx={pos.x} cy={pos.y} r={r + 3} fill="none" stroke={fill} strokeWidth="1.5" strokeOpacity="0.5" />
                {/* Core */}
                <circle
                  cx={pos.x} cy={pos.y} r={r}
                  fill={fill}
                  filter={isClosed ? 'url(#glow-danger)' : undefined}
                  className="transition-transform group-hover:scale-125"
                />
                {/* Label */}
                <text
                  x={pos.x} y={pos.y - r - 5}
                  textAnchor="middle"
                  fontSize="10"
                  fontFamily="'JetBrains Mono', monospace"
                  fontWeight="700"
                  fill={textFill}
                  className="select-none"
                >
                  {a.id}
                </text>
                {/* Delay count badge */}
                {delayedCount > 0 && !isClosed && (
                  <text
                    x={pos.x} y={pos.y + r + 11}
                    textAnchor="middle"
                    fontSize="8"
                    fontFamily="'JetBrains Mono', monospace"
                    fill="var(--warn)"
                    className="select-none"
                  >
                    +{delayedCount}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        <div className="absolute bottom-2 left-3 text-xs text-muted font-mono opacity-60">
          Click or press Enter on any node to set disruption epicenter
        </div>
      </div>
    </div>
  );
};
