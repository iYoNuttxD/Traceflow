import { useEffect, useRef, useState } from 'react';

const ALTURA_ESTIMADA = 240;

export function SprintActionsMenu({ sprintName, disabled = false, items }) {
  const [posicao, setPosicao] = useState(null);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const itemRefs = useRef([]);
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
    window.requestAnimationFrame(() => itemRefs.current.find((item) => !item?.disabled)?.focus());
  };

  const moveFocus = (event) => {
    const enabled = itemRefs.current.filter((item) => item && !item.disabled);
    if (!enabled.length) return;
    const current = enabled.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      setPosicao(null);
      triggerRef.current?.focus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      enabled[(current + 1) % enabled.length].focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      enabled[(current <= 0 ? enabled.length : current) - 1].focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      enabled[0].focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      enabled.at(-1).focus();
    }
  };

  return (
    <div className="sprint-actions-menu" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="button button-secondary sprint-menu-trigger"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`Mais ações da sprint ${sprintName}`}
        onClick={alternar}
      >
        <span aria-hidden="true">•••</span>
      </button>

      {aberto && (
        <div
          className="sprint-menu"
          role="menu"
          aria-label={`Ações da sprint ${sprintName}`}
          style={posicao}
          onKeyDown={moveFocus}
        >
          {items.map((item, index) => (
            <button
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              key={item.key}
              type="button"
              className={`sprint-menu-item${item.danger ? ' sprint-menu-item-danger' : ''}`}
              role="menuitem"
              disabled={item.disabled}
              aria-label={item.ariaLabel}
              title={item.title}
              onClick={() => {
                setPosicao(null);
                item.onSelect(triggerRef.current);
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
