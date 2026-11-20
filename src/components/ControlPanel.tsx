import React from 'react';
import { Sliders, AlertOctagon } from 'lucide-react';
import type { Airport, AirportClosure } from '../types';
import { minutesToTime, timeToMinutes } from '../engine/validator';

interface ControlPanelProps {
  airports: Airport[];
  closure: AirportClosure | null;
  onUpdateClosure: (closure: AirportClosure | null) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  airports,
  closure,
  onUpdateClosure,
}) => {
  const selectedAirportId = closure ? closure.airport_id : 'BOM';
  const startM = closure ? timeToMinutes(closure.start_time) : 840;
  const endM = closure ? timeToMinutes(closure.end_time) : 930;

  const handleAirportChange = (airportId: string) => {
    if (!airportId) {
      onUpdateClosure(null);
    } else {
      onUpdateClosure({
        airport_id: airportId,
        start_time: minutesToTime(startM),
        end_time: minutesToTime(endM),
      });
    }
  };

  const handleStartChange = (val: number) => {
    const newStart = Math.min(val, endM - 30);
    onUpdateClosure({
      airport_id: selectedAirportId,
      start_time: minutesToTime(newStart),
      end_time: minutesToTime(endM),
    });
  };

  const handleEndChange = (val: number) => {
    const newEnd = Math.max(val, startM + 30);
    onUpdateClosure({
      airport_id: selectedAirportId,
      start_time: minutesToTime(startM),
      end_time: minutesToTime(newEnd),
    });
  };

  const selectedAirport = airports.find(a => a.id === selectedAirportId);
  const slidersDisabled = !closure;

  return (
    <section className="glass-panel p-4" aria-label="Disruption controls">
      <div className="flex items-center justify-between mb-3 border-b border-line pb-2.5">
        <h2 className="flex items-center gap-2 text-accent font-semibold text-xs tracking-wider uppercase">
          <Sliders className="w-4 h-4" aria-hidden="true" />
          Disruption Simulation Control
        </h2>
        {closure && (
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-closed-muted text-closed border border-closed/40 animate-pulse flex items-center gap-1 font-semibold" role="alert">
            <AlertOctagon className="w-3 h-3" aria-hidden="true" />
            {closure.airport_id} CLOSED ({closure.start_time}–{closure.end_time})
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        {/* Airport Selector */}
        <div>
          <label htmlFor="airport-select" className="block text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">
            Target Closed Airport
          </label>
          <select
            id="airport-select"
            value={closure ? closure.airport_id : ''}
            onChange={(e) => handleAirportChange(e.target.value)}
            className="w-full bg-bg border border-line hover:border-line-strong rounded-lg px-3 py-2 text-sm text-primary focus:border-accent font-mono transition min-h-[44px]"
          >
            <option value="">— No Closure (Baseline Network) —</option>
            {airports.map((a) => (
              <option key={a.id} value={a.id}>
                {a.id} – {a.city} ({a.tier.replace('_', ' ').toUpperCase()})
              </option>
            ))}
          </select>
          {selectedAirport && closure && (
            <div className="text-xs text-muted mt-1 flex justify-between font-mono">
              <span>{selectedAirport.name}</span>
              <span className="text-accent">{selectedAirport.tier}</span>
            </div>
          )}
        </div>

        {/* Start Time Slider */}
        <div className={slidersDisabled ? 'opacity-40' : ''}>
          <div className="flex justify-between text-xs font-mono mb-1 text-muted">
            <label htmlFor="start-slider">Closure Start:</label>
            <output htmlFor="start-slider" className="text-accent font-bold">{minutesToTime(startM)} IST</output>
          </div>
          <input
            id="start-slider"
            type="range"
            min={360}
            max={1260}
            step={15}
            value={startM}
            onChange={(e) => handleStartChange(Number(e.target.value))}
            aria-label="Closure start time"
            aria-valuemin={360}
            aria-valuemax={1260}
            aria-valuenow={startM}
            aria-valuetext={`${minutesToTime(startM)} IST`}
            aria-disabled={slidersDisabled}
            tabIndex={slidersDisabled ? -1 : 0}
            className="w-full accent-[var(--accent)] cursor-pointer h-1.5 bg-bg rounded-lg appearance-none"
          />
          <div className="flex justify-between text-xs text-muted font-mono mt-0.5">
            <span>06:00</span><span>12:00</span><span>18:00</span><span>21:00</span>
          </div>
        </div>

        {/* End Time Slider */}
        <div className={slidersDisabled ? 'opacity-40' : ''}>
          <div className="flex justify-between text-xs font-mono mb-1 text-muted">
            <label htmlFor="end-slider">Closure Reopen:</label>
            <output htmlFor="end-slider" className="text-warn font-bold">{minutesToTime(endM)} IST</output>
          </div>
          <input
            id="end-slider"
            type="range"
            min={390}
            max={1320}
            step={15}
            value={endM}
            onChange={(e) => handleEndChange(Number(e.target.value))}
            aria-label="Closure end time"
            aria-valuemin={390}
            aria-valuemax={1320}
            aria-valuenow={endM}
            aria-valuetext={`${minutesToTime(endM)} IST`}
            aria-disabled={slidersDisabled}
            tabIndex={slidersDisabled ? -1 : 0}
            className="w-full accent-[var(--warn)] cursor-pointer h-1.5 bg-bg rounded-lg appearance-none"
          />
          <div className="flex justify-between text-xs text-muted font-mono mt-0.5">
            <span>06:30</span>
            <span>Duration: {endM - startM}m</span>
            <span>22:00</span>
          </div>
        </div>
      </div>
    </section>
  );
};
