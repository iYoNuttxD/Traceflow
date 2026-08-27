import { useEffect, useRef, useState } from 'react';

const ALTURA_ESTIMADA = 240;

export function SprintActionsMenu({ sprintName, disabled = false, items }) {
  const [posicao, setPosicao] = useState(null);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const aberto = posicao !== null;

  useEffect(() => {
    if (!aberto) return undefined;
    const foraDoMenu = (event) => {
      if (!containerRef.current?.contains(event.target)) setPosicao(null);
    };
    const noEscape = (event) => {
      if (event.key !== 'Escape') return;
      setPosicao(null);
      triggerRef.current?.focus();
    };
    const aoRolar = () => setPosicao(null);
    document.addEventListener('pointerdown', foraDoMenu);
    document.addEventListener('keydown', noEscape);
    window.addEventListener('scroll', aoRolar, true);
    window.addEventListener('resize', aoRolar);
    return () => {
      document.removeEventListener('pointerdown', foraDoMenu);
      document.removeEventListener('keydown', noEscape);
      window.removeEventListener('scroll', aoRolar, true);
      window.removeEventListener('resize', aoRolar);
    };
  }, [aberto]);

  const alternar = () => {
    if (aberto) {
      setPosicao(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const paraCima = rect.bottom + ALTURA_ESTIMADA > window.innerHeight;
    setPosicao({
      right: Math.max(8, window.innerWidth - rect.right),
      top: paraCima ? 'auto' : rect.bottom + 6,
      bottom: paraCima ? window.innerHeight - rect.top + 6 : 'auto'
    });
  };

  return (
    <div className="sprint-actions-menu" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="button button-secondary sprint-menu-trigger"
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={aberto}
        aria-label={`Mais ações da sprint ${sprintName}`}
        onClick={alternar}
      >
        Mais ações{' '}
        <span className="sprint-menu-caret" aria-hidden="true">
          ▼
        </span>
      </button>

      {aberto && (
        <div
          className="sprint-menu"
          role="group"
          aria-label={`Ações da sprint ${sprintName}`}
          style={posicao}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`sprint-menu-item${item.danger ? ' sprint-menu-item-danger' : ''}`}
              disabled={item.disabled}
              aria-label={item.ariaLabel}
              aria-expanded={item.expanded}
              title={item.title}
              onClick={() => {
                setPosicao(null);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
