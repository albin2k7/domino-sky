import React, { useState } from 'react';
import { Search, AlertTriangle, ArrowRight, CornerDownRight } from 'lucide-react';
import type { FlightSimulation } from '../types';

interface FlightTableProps {
  flights: FlightSimulation[];
  selectedFlight: FlightSimulation | null;
  onSelectFlight: (flight: FlightSimulation | null) => void;
}

type Filter = 'ALL' | 'DELAYED' | 'CANCELLED' | 'ON_TIME';

const StatusBadge: React.FC<{ status: FlightSimulation['status']; delay?: number }> = ({ status, delay }) => {
  const cls =
    status === 'CANCELLED' ? 'bg-danger-muted text-danger border-danger/40' :
    status === 'DELAYED' ? 'bg-warn-muted text-warn border-warn/40' :
    'bg-ok-muted text-ok border-ok/40';

  const icon = status === 'CANCELLED' ? '✕ ' : status === 'DELAYED' ? '▲ ' : '● ';

  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-bold border ${cls}`}>
      {icon}{status}{delay && delay > 0 ? ` +${delay}m` : ''}
    </span>
  );
};

export const FlightTable: React.FC<FlightTableProps> = ({ flights, selectedFlight, onSelectFlight }) => {
  const [filterStatus, setFilterStatus] = useState<Filter>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = flights.filter(f => {
    if (filterStatus !== 'ALL' && f.status !== filterStatus) return false;
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      return (
        f.flight_id.toLowerCase().includes(t) ||
        f.tail_id.toLowerCase().includes(t) ||
        f.origin.toLowerCase().includes(t) ||
        f.destination.toLowerCase().includes(t) ||
        f.cause.toLowerCase().includes(t)
      );
    }
    return true;
  });

  const filterBtns: { key: Filter; label: string; activeCls: string }[] = [
    { key: 'ALL', label: 'ALL', activeCls: 'bg-panel text-primary border-line-strong font-bold' },
    { key: 'DELAYED', label: '▲ DELAYED', activeCls: 'bg-warn-muted text-warn border-warn/40 font-bold' },
    { key: 'CANCELLED', label: '✕ CANCELLED', activeCls: 'bg-danger-muted text-danger border-danger/40 font-bold' },
    { key: 'ON_TIME', label: '● ON TIME', activeCls: 'bg-ok-muted text-ok border-ok/40 font-bold' },
  ];

  const handleRowKey = (e: React.KeyboardEvent, f: FlightSimulation) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const isSelected = selectedFlight?.flight_id === f.flight_id;
      onSelectFlight(isSelected ? null : f);
    }
  };

  return (
    <section className="glass-panel p-4 flex flex-col" aria-label="Flight roster">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent" aria-hidden="true" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Network Flight Roster ({filtered.length}/{flights.length})
          </h3>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter tabs */}
          <div className="flex bg-bg border border-line rounded-lg p-0.5 text-xs font-mono gap-0.5" role="tablist" aria-label="Filter flights by status">
            {filterBtns.map(btn => (
              <button
                key={btn.key}
                onClick={() => setFilterStatus(btn.key)}
                role="tab"
                aria-selected={filterStatus === btn.key}
                aria-label={`Show ${btn.key === 'ALL' ? 'all' : btn.key.toLowerCase().replace('_', ' ')} flights`}
                className={`px-2.5 py-1 rounded-md border transition min-h-[44px] ${
                  filterStatus === btn.key ? btn.activeCls : 'text-muted border-transparent hover:text-primary'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search flight, tail, airport…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search flights by ID, aircraft, airport, or cause"
              className="bg-bg border border-line focus:border-accent rounded-lg pl-8 pr-3 py-1 text-xs text-primary placeholder-muted focus:outline-none font-mono transition min-h-[44px]"
            />
          </div>
        </div>
      </div>

      {/* Selected flight causal chain banner */}
      {selectedFlight && (
        <div className="mb-3 p-3 bg-accent-muted border border-accent/30 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs animate-domino-item" role="region" aria-label={`Selected flight: ${selectedFlight.flight_id}`}>
          <div>
            <div className="flex items-center gap-2 font-mono font-bold text-accent flex-wrap">
              <span>{selectedFlight.flight_id} ({selectedFlight.origin} → {selectedFlight.destination})</span>
              <span className="text-muted">Tail: {selectedFlight.tail_id}</span>
              <span className="text-muted">Crew: {selectedFlight.crew_id}</span>
              <StatusBadge status={selectedFlight.status} delay={selectedFlight.delay_dep_min} />
            </div>

            {selectedFlight.causal_chain && selectedFlight.causal_chain.length > 1 ? (
              <div className="flex items-center gap-1.5 mt-2 flex-wrap text-xs font-mono">
                <span className="text-muted flex items-center gap-1 font-semibold">
                  <CornerDownRight className="w-3 h-3 text-accent" aria-hidden="true" /> Causal Trace:
                </span>
                {selectedFlight.causal_chain.map((node, i) => (
                  <React.Fragment key={i}>
                    <span className={`px-1.5 py-0.5 rounded border text-xs font-bold ${
                      node.startsWith('CLOSURE:')
                        ? 'bg-closed-muted text-closed border-closed/40'
                        : node === selectedFlight.flight_id
                        ? 'bg-accent-muted text-accent border-accent/40'
                        : 'bg-panel text-muted border-line'
                    }`}>
                      {node}
                    </span>
                    {i < selectedFlight.causal_chain.length - 1 && (
                      <ArrowRight className="w-3 h-3 text-muted" aria-hidden="true" />
                    )}
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <div className="text-xs text-muted mt-1 font-mono">
                Root cause: {selectedFlight.cause} {selectedFlight.delay_dep_min === 0 ? '(On schedule)' : ''}
              </div>
            )}
          </div>
          <button
            onClick={() => onSelectFlight(null)}
            aria-label="Clear flight selection"
            className="text-xs px-2.5 py-1 rounded-lg bg-panel hover:border-line-strong border border-line text-muted transition min-h-[44px]"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto max-h-[360px] border border-line rounded-xl">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-bg text-muted border-b border-line sticky top-0 z-10 uppercase text-xs tracking-wider">
            <tr>
              <th scope="col" className="py-2.5 px-3">Flight</th>
              <th scope="col" className="py-2.5 px-3">Tail</th>
              <th scope="col" className="py-2.5 px-3">Sector</th>
              <th scope="col" className="py-2.5 px-3">Scheduled</th>
              <th scope="col" className="py-2.5 px-3">Actual</th>
              <th scope="col" className="py-2.5 px-3 text-right">Delay</th>
              <th scope="col" className="py-2.5 px-3 text-center">Status</th>
              <th scope="col" className="py-2.5 px-3">Why Late</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/40">
            {filtered.map((f, rowIdx) => {
              const isSelected = selectedFlight?.flight_id === f.flight_id;
              return (
                <tr
                  key={f.flight_id}
                  onClick={() => onSelectFlight(isSelected ? null : f)}
                  onKeyDown={(e) => handleRowKey(e, f)}
                  tabIndex={0}
                  aria-selected={isSelected}
                  className={`cursor-pointer transition-colors animate-domino-item ${
                    isSelected
                      ? 'bg-accent-muted text-primary'
                      : f.status === 'CANCELLED'
                      ? 'hover:bg-danger-muted text-muted'
                      : f.status === 'DELAYED'
                      ? 'hover:bg-warn-muted text-muted'
                      : 'hover:bg-panel text-muted'
                  }`}
                  style={{ animationDelay: `${rowIdx * 15}ms` }}
                >
                  <td className="py-2 px-3 font-bold text-primary">{f.flight_id}</td>
                  <td className="py-2 px-3 text-muted">{f.tail_id}</td>
                  <td className="py-2 px-3 font-semibold text-primary">{f.origin} → {f.destination}</td>
                  <td className="py-2 px-3 text-muted">{f.scheduled_dep} – {f.scheduled_arr}</td>
                  <td className="py-2 px-3 font-medium">
                    {f.status === 'CANCELLED'
                      ? <span className="text-danger line-through">CANCELLED</span>
                      : `${f.actual_dep} – ${f.actual_arr}`
                    }
                  </td>
                  <td className={`py-2 px-3 text-right font-bold ${f.delay_dep_min > 0 ? 'text-warn' : 'text-muted'}`}>
                    {f.delay_dep_min > 0 ? `+${f.delay_dep_min}m` : '0m'}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <StatusBadge status={f.status} />
                  </td>
                  <td className="py-2 px-3 text-xs">
                    {f.cause !== 'NONE' ? (
                      <span className="flex items-center gap-1.5 text-warn">
                        <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
                        <span>{f.cause}</span>
                        {f.caused_by && <span className="text-muted text-xs">({f.caused_by})</span>}
                      </span>
                    ) : (
                      <span className="text-muted opacity-50">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};
