import React, { useState, useMemo, useEffect, useRef } from 'react';
import rawDataset from '../data/dataset.json';
import type {
  Scenario,
  AirportClosure,
  FlightSimulation,
  EvaluatedRecoveryCandidate,
} from './types';
import { simulate } from './engine/simulate';
import { generateRecoveryCandidates } from './engine/recovery';
import { Header } from './components/Header';
import { ControlPanel } from './components/ControlPanel';
import { KPICards } from './components/KPICards';
import { NetworkMap } from './components/NetworkMap';
import { GanttChart } from './components/GanttChart';
import { FlightTable } from './components/FlightTable';
import { AIDispatcherPanel } from './components/AIDispatcherPanel';
import { BeforeAfterComparison } from './components/BeforeAfterComparison';
import { AssumptionsDrawer } from './components/AssumptionsDrawer';

const initialScenario = rawDataset as unknown as Scenario;

export default function App() {
  const [closure, setClosure] = useState<AirportClosure | null>({
    airport_id: 'BOM',
    start_time: '14:00',
    end_time: '15:30',
  });

  const [selectedFlight, setSelectedFlight] = useState<FlightSimulation | null>(null);
  const [appliedCandidate, setAppliedCandidate] = useState<EvaluatedRecoveryCandidate | null>(null);
  const [isAssumptionsOpen, setIsAssumptionsOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  // Sync reduced-motion preference to DOM
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = reducedMotion ? 'true' : 'false';
  }, [reducedMotion]);

  const activeScenario = useMemo(() =>
    appliedCandidate ? appliedCandidate.modifiedScenario : initialScenario,
    [appliedCandidate]
  );

  const simulation = useMemo(() => simulate(activeScenario, closure), [activeScenario, closure]);

  const recoveryCandidates = useMemo(() =>
    generateRecoveryCandidates(initialScenario, closure),
    [closure]
  );

  // Screen-reader announcement when simulation changes
  const prevAnnouncementRef = useRef('');
  useEffect(() => {
    const m = simulation.metrics;
    let text: string;
    if (closure) {
      text = `${closure.airport_id} closed ${closure.start_time} to ${closure.end_time}. ${m.flightsDelayed} flights delayed, ${m.flightsCancelled} cancelled, ${m.strandedPax} passengers stranded, ${m.totalDelayMinutes} minutes total delay.`;
    } else {
      text = `No closure active. Network operating normally. ${m.totalFlights} flights on schedule.`;
    }
    // Only announce if text actually changed to avoid repeat announcements
    if (text !== prevAnnouncementRef.current) {
      prevAnnouncementRef.current = text;
      setAnnouncement(text);
    }
  }, [simulation, closure]);

  const handleSelectPreset = (presetId: string) => {
    setAppliedCandidate(null);
    setSelectedFlight(null);
    if (presetId === 'preset_mumbai_storm') {
      setClosure({ airport_id: 'BOM', start_time: '14:00', end_time: '15:30' });
    } else if (presetId === 'preset_delhi_fog') {
      setClosure({ airport_id: 'DEL', start_time: '06:00', end_time: '08:30' });
    } else if (presetId === 'preset_blr_surge') {
      setClosure({ airport_id: 'BLR', start_time: '12:00', end_time: '14:00' });
    }
  };

  const handleResetClosure = () => {
    setClosure(null);
    setAppliedCandidate(null);
    setSelectedFlight(null);
  };

  return (
    <div className="min-h-screen bg-bg text-primary flex flex-col font-sans relative">
      {/* Subtle grid background overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        aria-hidden="true"
        style={{
          backgroundImage: `
            linear-gradient(var(--line) 1px, transparent 1px),
            linear-gradient(90deg, var(--line) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
          opacity: 0.18,
        }}
      />

      {/* Screen reader live region */}
      <div className="sr-only" aria-live="polite" aria-atomic="true" role="status">
        {announcement}
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        <Header
          closure={closure}
          onSelectPreset={handleSelectPreset}
          onReset={handleResetClosure}
          onOpenAssumptions={() => setIsAssumptionsOpen(true)}
          onToggleReducedMotion={() => setReducedMotion(p => !p)}
        />

        <main id="main-content" aria-label="Simulation dashboard" className="flex-1 p-4 md:p-6 max-w-[1440px] mx-auto w-full space-y-4">
          <ControlPanel
            airports={initialScenario.airports}
            closure={closure}
            onUpdateClosure={(c) => { setClosure(c); setAppliedCandidate(null); }}
          />

          {appliedCandidate && (
            <BeforeAfterComparison
              candidate={appliedCandidate}
              onRevert={() => setAppliedCandidate(null)}
            />
          )}

          <KPICards metrics={simulation.metrics} previewDeltas={appliedCandidate?.deltas} />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 h-[420px]">
              <NetworkMap
                airports={initialScenario.airports}
                closure={closure}
                simulation={simulation}
                selectedFlight={selectedFlight}
                onSelectAirport={(airportId) => {
                  setClosure({
                    airport_id: airportId,
                    start_time: closure?.start_time ?? '12:00',
                    end_time: closure?.end_time ?? '14:00',
                  });
                  setAppliedCandidate(null);
                }}
              />
            </div>

            <div className="lg:col-span-5 h-[420px]">
              <AIDispatcherPanel
                simulation={simulation}
                candidates={recoveryCandidates}
                appliedActionId={appliedCandidate?.action.id ?? null}
                onApplyAction={setAppliedCandidate}
                onRevertAction={() => setAppliedCandidate(null)}
              />
            </div>
          </div>

          <GanttChart
            simulation={simulation}
            closure={closure}
            selectedFlight={selectedFlight}
            onSelectFlight={setSelectedFlight}
          />

          <FlightTable
            flights={simulation.flight_list}
            selectedFlight={selectedFlight}
            onSelectFlight={setSelectedFlight}
          />
        </main>

        <footer className="border-t border-line bg-surface/60 backdrop-blur-sm px-6 py-3 text-center text-xs text-muted font-mono tracking-wider">
          DOMINO SKY · DETERMINISTIC DISRUPTION SIMULATOR · DGCA COMPLIANT · GUARDRAILS ACTIVE
        </footer>
      </div>

      <AssumptionsDrawer
        isOpen={isAssumptionsOpen}
        onClose={() => setIsAssumptionsOpen(false)}
      />
    </div>
  );
}
