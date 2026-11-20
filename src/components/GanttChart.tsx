import React from 'react';
import type { SimulationResult, FlightSimulation, AirportClosure } from '../types';
import { timeToMinutes, minutesToTime } from '../engine/validator';

interface GanttChartProps {
  simulation: SimulationResult;
  closure: AirportClosure | null;
  selectedFlight: FlightSimulation | null;
  onSelectFlight: (flight: FlightSimulation | null) => void;
}

export const GanttChart: React.FC<GanttChartProps> = ({
  simulation,
  closure,
  selectedFlight,
  onSelectFlight,
}) => {
  const timelineStartM = 300;
  const timelineEndM = 1350;
  const totalDurationM = timelineEndM - timelineStartM;
  const labelWidth = 90;
  const chartWidth = 950;
  const rowHeight = 32;
  const rowGap = 4;

  const tails = Array.from(new Set(simulation.flight_list.map(f => f.tail_id))).sort();

  const timeToX = (timeM: number) => {
    const clamped = Math.max(timelineStartM, Math.min(timelineEndM, timeM));
    return labelWidth + ((clamped - timelineStartM) / totalDurationM) * chartWidth;
  };

  const hours: number[] = [];
  for (let m = 360; m <= 1320; m += 60) hours.push(m);

  let closureBandX1 = 0, closureBandWidth = 0;
  if (closure) {
    const cStart = timeToMinutes(closure.start_time);
    const cEnd = timeToMinutes(closure.end_time);
    closureBandX1 = timeToX(cStart);
    closureBandWidth = Math.max(0, timeToX(cEnd) - closureBandX1);
  }

  const svgHeight = 40 + tails.length * (rowHeight + rowGap) + 10;
  const totalSvgWidth = labelWidth + chartWidth + 20;

  const handleBarKey = (e: React.KeyboardEvent, f: FlightSimulation) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const isSelected = selectedFlight?.flight_id === f.flight_id;
      onSelectFlight(isSelected ? null : f);
    }
  };

  return (
    <div className="glass-panel p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent" aria-hidden="true" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Aircraft Rotation — Scheduled vs Actual
          </h3>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 text-xs font-mono text-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-2.5 rounded border border-dashed border-muted bg-transparent inline-block" aria-hidden="true" />
            Scheduled
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-2.5 rounded bg-ok inline-block" aria-hidden="true" />
            On Time
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-2.5 rounded bg-warn inline-block" aria-hidden="true" />
            Delayed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-2.5 rounded bg-danger inline-block" aria-hidden="true" />
            Cancelled
          </span>
          {closure && (
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-2.5 rounded bg-closed-muted border border-closed/40 inline-block" aria-hidden="true" />
              {closure.airport_id} Closure
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto bg-bg border border-line rounded-xl p-2">
        <svg
          viewBox={`0 0 ${totalSvgWidth} ${svgHeight}`}
          className="w-full min-w-[900px] h-auto select-none"
          role="img"
          aria-label={`Aircraft rotation timeline showing ${tails.length} aircraft and ${simulation.flight_list.length} flights. ${closure ? `${closure.airport_id} closure shown as red band.` : 'No closures.'}`}
        >
          <defs>
            {/* Diagonal stripe pattern for closure band */}
            <pattern id="ds-stripe" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="8" stroke="var(--closed)" strokeWidth="2.5" strokeOpacity="0.25" />
            </pattern>
          </defs>

          {/* Time Axis */}
          <g>
            <line x1={labelWidth} y1={28} x2={labelWidth + chartWidth} y2={28}
              stroke="var(--line)" strokeWidth="1" />
            {hours.map(m => {
              const x = timeToX(m);
              return (
                <g key={m}>
                  <line x1={x} y1={24} x2={x} y2={svgHeight}
                    stroke="var(--line)" strokeWidth="1" strokeDasharray="2,3" strokeOpacity="0.5" />
                  <text x={x} y={18} textAnchor="middle"
                    fontSize="10" fontFamily="'JetBrains Mono',monospace"
                    fill="var(--muted)" fontWeight="600">
                    {minutesToTime(m)}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Closure Band */}
          {closure && closureBandWidth > 0 && (
            <g>
              <rect x={closureBandX1} y={28} width={closureBandWidth} height={svgHeight - 28}
                fill="url(#ds-stripe)" />
              <rect x={closureBandX1} y={28} width={closureBandWidth} height={svgHeight - 28}
                fill="var(--closed)" fillOpacity="0.08" />
              <line x1={closureBandX1} y1={28} x2={closureBandX1} y2={svgHeight}
                stroke="var(--closed)" strokeWidth="1.5" strokeDasharray="4,4" />
              <line x1={closureBandX1 + closureBandWidth} y1={28} x2={closureBandX1 + closureBandWidth} y2={svgHeight}
                stroke="var(--closed)" strokeWidth="1.5" strokeDasharray="4,4" />
              <text x={closureBandX1 + closureBandWidth / 2} y={42}
                textAnchor="middle" fontSize="9"
                fontFamily="'JetBrains Mono',monospace"
                fill="var(--closed)" fontWeight="700" fillOpacity="0.8">
                ✕ {closure.airport_id}
              </text>
            </g>
          )}

          {/* Rows */}
          {tails.map((tail, idx) => {
            const y = 36 + idx * (rowHeight + rowGap);
            const tailFlights = simulation.flight_list.filter(f => f.tail_id === tail);
            const rowBg = idx % 2 === 0 ? 'var(--surface)' : 'var(--bg)';

            return (
              <g key={tail} className="animate-domino-item" style={{ animationDelay: `${idx * 30}ms` }}>
                <rect x={0} y={y} width={totalSvgWidth} height={rowHeight}
                  fill={rowBg} rx="3" />

                <text x={labelWidth - 8} y={y + rowHeight / 2 + 4} textAnchor="end"
                  fontSize="11" fontFamily="'JetBrains Mono',monospace"
                  fontWeight="700" fill="var(--muted)">
                  {tail}
                </text>

                {tailFlights.map(f => {
                  const isSelected = selectedFlight?.flight_id === f.flight_id;

                  const sX1 = timeToX(f.scheduled_dep_min);
                  const sX2 = timeToX(f.scheduled_arr_min);
                  const sWidth = Math.max(2, sX2 - sX1);

                  const aX1 = timeToX(f.actual_dep_min);
                  const aX2 = timeToX(f.actual_arr_min);
                  const aWidth = Math.max(3, aX2 - aX1);

                  // Gradient bar colour by delay severity
                  const gradId = `g-${f.flight_id.replace(/\W/g, '')}`;
                  let barFill = `url(#${gradId})`;
                  let gradFrom = 'var(--ok)', gradTo = 'var(--ok)';
                  if (f.status === 'CANCELLED') { gradFrom = 'var(--danger)'; gradTo = 'var(--closed)'; }
                  else if (f.delay_dep_min > 120) { gradFrom = 'var(--warn)'; gradTo = 'var(--danger)'; }
                  else if (f.delay_dep_min > 30) { gradFrom = 'var(--ok)'; gradTo = 'var(--warn)'; }
                  else { gradFrom = 'var(--ok)'; gradTo = 'var(--ok)'; barFill = 'var(--ok)'; }

                  const barTitle = `${f.flight_id}: ${f.origin}→${f.destination}, ${f.status}${f.delay_dep_min > 0 ? `, +${f.delay_dep_min}m delay` : ''}, scheduled ${f.scheduled_dep}–${f.scheduled_arr}`;

                  return (
                    <g key={f.flight_id}
                      onClick={() => onSelectFlight(isSelected ? null : f)}
                      onKeyDown={(e) => handleBarKey(e, f)}
                      className="cursor-pointer group"
                      tabIndex={0}
                      role="button"
                      aria-label={barTitle}
                    >
                      <title>{barTitle}</title>

                      {/* Gradient def */}
                      {gradFrom !== gradTo && (
                        <defs>
                          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor={gradFrom} />
                            <stop offset="100%" stopColor={gradTo} />
                          </linearGradient>
                        </defs>
                      )}

                      {/* Ghost bar */}
                      {f.delay_dep_min > 0 && (
                        <rect x={sX1} y={y + 3} width={sWidth} height={rowHeight - 6}
                          fill="none" stroke="var(--line-strong)" strokeWidth="1"
                          strokeDasharray="3,2" rx="3" opacity="0.7" />
                      )}

                      {/* Actual bar */}
                      <rect x={aX1} y={y + 4} width={aWidth} height={rowHeight - 8}
                        fill={barFill}
                        fillOpacity={f.status === 'CANCELLED' ? 0.4 : 0.9}
                        stroke={isSelected ? 'var(--accent)' : 'transparent'}
                        strokeWidth={isSelected ? 2.5 : 0}
                        rx="3"
                        className="transition-all"
                      />

                      {/* Label */}
                      {aWidth > 32 && (
                        <text x={aX1 + 4} y={y + rowHeight / 2 + 3.5}
                          fontSize="9" fontFamily="'JetBrains Mono',monospace"
                          fontWeight="700"
                          fill={f.status === 'CANCELLED' ? 'var(--text)' : 'var(--bg)'}
                          className="pointer-events-none select-none">
                          {f.flight_id}{aWidth > 75 ? ` (${f.origin}→${f.destination})` : ''}
                        </text>
                      )}

                      {/* Delay tag */}
                      {f.delay_dep_min > 0 && aWidth > 50 && (
                        <text x={aX2 - 4} y={y + rowHeight / 2 + 3.5}
                          textAnchor="end" fontSize="8"
                          fontFamily="'JetBrains Mono',monospace"
                          fontWeight="700"
                          fill={f.status === 'CANCELLED' ? 'var(--text)' : 'var(--bg)'}
                          className="pointer-events-none select-none">
                          +{f.delay_dep_min}m
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
