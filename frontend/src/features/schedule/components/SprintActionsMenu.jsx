import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './SprintActionsMenu.css';

export function SprintActionsMenu({
  sprintName,
  entityName = sprintName,
  entityDescriptor = 'da sprint',
  disabled = false,
  triggerRef: externalTriggerRef,
  items
}) {
  const [posicao, setPosicao] = useState(null);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const itemRefs = useRef([]);
  const aberto = posicao !== null;

  useLayoutEffect(() => {
    if (!aberto) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    const maxHeight = Math.max(0, window.innerHeight - 16);
    const height = Math.min(menu.height, maxHeight);
    const below = rect.bottom + 6;
    const above = rect.top - height - 6;
    const preferred = below + height <= window.innerHeight - 8 ? below : above;
    setPosicao({
      right: Math.max(
        8,
        Math.min(window.innerWidth - rect.right, window.innerWidth - menu.width - 8)
      ),
      top: Math.max(8, Math.min(preferred, window.innerHeight - height - 8)),
      maxHeight
    });
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return undefined;
    const foraDoMenu = (event) => {
      if (
        !containerRef.current?.contains(event.target) &&
        !menuRef.current?.contains(event.target)
      ) {
        setPosicao(null);
      }
    };
    const noEscape = (event) => {
      if (event.key !== 'Escape') return;
      setPosicao(null);
      triggerRef.current?.focus();
    };
    const aoRolar = (event) => {
      if (!menuRef.current?.contains(event.target)) setPosicao(null);
    };
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
    setPosicao({
      right: Math.max(8, window.innerWidth - rect.right),
      top: rect.bottom + 6
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
        ref={(element) => {
          triggerRef.current = element;
          if (externalTriggerRef) externalTriggerRef.current = element;
        }}
        type="button"
        className="button button-secondary sprint-menu-trigger"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`Mais ações ${entityDescriptor} ${entityName}`}
        onClick={alternar}
      >
        <span aria-hidden="true">…</span>
      </button>

      {aberto &&
        createPortal(
          <div
            ref={menuRef}
            className="sprint-menu"
            role="menu"
            aria-label={`Ações ${entityDescriptor} ${entityName}`}
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
                  triggerRef.current?.focus();
                  item.onSelect(triggerRef.current);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          containerRef.current?.closest('[role="dialog"]') || document.body
        )}
    </div>
  );
}
