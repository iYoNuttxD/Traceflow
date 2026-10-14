import { IndicatorCard } from './IndicatorCard.jsx';
import { describeLimitation, presentationLimitations } from '../dashboard-display.js';
import './PersonalizedDashboard.css';

export function CustomDashboard({ indicators, catalogById, suppressedLimitations = [] }) {
  const counts = new Map();
  for (const indicator of indicators)
    for (const code of presentationLimitations(indicator))
      if (!code.includes('FILTER_') && !suppressedLimitations.includes(code))
        counts.set(code, (counts.get(code) ?? 0) + 1);
  const shared = [...counts].filter(([, count]) => count > 1).map(([code]) => code);
  // Group only adjacent semantic sizes: DOM/keyboard order remains the saved order.
  const groups = [];
  for (const indicator of indicators) {
    const size = catalogById.get(indicator.metricId).customization.sizeClass;
    const previous = groups.at(-1);
    if (previous?.size === size && size !== 'full') previous.indicators.push(indicator);
    else groups.push({ size, indicators: [indicator] });
  }
  return (
    <section aria-label="Meu painel" className="custom-dashboard">
      <h3 className="sr-only">Meu painel</h3>
      {shared.length > 0 && (
        <div className="dashboard-panel__section-notice">
          {[...new Set(shared.map(describeLimitation))].map((text) => (
            <p key={text}>{text}</p>
          ))}
        </div>
      )}
      {groups.map((group) => (
        <div
          key={group.indicators[0].metricId}
          className={`custom-dashboard__group dashboard-panel__section ${group.size === 'compact' ? 'dashboard-panel__metric-grid' : 'custom-dashboard__details'}`}
        >
          {group.indicators.map((indicator, index) => {
            const span = (columns) =>
              12 /
              Math.min(columns, group.indicators.length - Math.floor(index / columns) * columns);
            const columns =
              group.indicators.length <= 4
                ? group.indicators.length
                : group.indicators.length <= 6
                  ? 3
                  : 4;
            return (
              <IndicatorCard
                key={indicator.metricId}
                indicator={indicator}
                metadata={catalogById.get(indicator.metricId)}
                sharedLimitations={[...shared, ...suppressedLimitations]}
                style={
                  group.size === 'compact'
                    ? {
                        '--metric-span-wide': span(columns),
                        '--metric-span-medium': span(3),
                        '--metric-span-small': span(2)
                      }
                    : undefined
                }
              />
            );
          })}
        </div>
      ))}
    </section>
  );
}
