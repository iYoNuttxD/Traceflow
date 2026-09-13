import { phases, macroPhase } from '../model/phase.js';
import { TraceabilityHelp } from './TraceabilityHelp.jsx';
import './TraceabilityPhaseTrail.css';
export function TraceabilityPhaseTrail({ projection }) {
  const current = macroPhase(projection?.situation);
  const sequence = Object.keys(phases);
  const index = sequence.indexOf(current);
  return (
    <div className="trace-phase-trail">
      <span className="trace-help-label">
        Fase atual <TraceabilityHelp topic="phase" />
      </span>
      <ol aria-label="Evolução das fases da rastreabilidade">
        {sequence.map((phase, i) => {
          const reached = i < index && (phase !== 'CORRECTION' || projection?.defects?.total > 0);
          const status =
            phase === current ? 'Atual' : reached ? 'Já alcançada' : 'Ainda não alcançada';
          return (
            <li
              key={phase}
              className={phase === current ? 'is-current' : reached ? 'is-reached' : ''}
              aria-current={phase === current ? 'step' : undefined}
              aria-label={`${phases[phase]}: ${status}`}
            >
              <span aria-hidden="true">{phase === current ? '●' : reached ? '✓' : '○'}</span>
              <span>{phases[phase]}</span>
              {i < sequence.length - 1 && (
                <span className="trace-phase-arrow" aria-hidden="true">
                  {phase === 'VALIDATION' ? '↔' : '→'}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
