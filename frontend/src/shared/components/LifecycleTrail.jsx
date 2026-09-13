import './LifecycleTrail.css';
export function LifecycleTrail({
  steps,
  currentIndex,
  label,
  isReached = (index) => index < currentIndex
}) {
  return (
    <ol className="lifecycle-trail" aria-label={label}>
      {steps.map((label, index) => {
        const current = index === currentIndex,
          reached = isReached(index);
        return (
          <li
            key={label}
            className={current ? 'is-current' : reached ? 'is-reached' : ''}
            aria-current={current ? 'step' : undefined}
            aria-label={`${label}: ${current ? 'Atual' : reached ? 'Já alcançada' : 'Ainda não alcançada'}`}
          >
            <span aria-hidden="true">{current ? '●' : reached ? '✓' : '○'}</span>
            <span>{label}</span>
            {index < steps.length - 1 && <span aria-hidden="true">→</span>}
          </li>
        );
      })}
    </ol>
  );
}
