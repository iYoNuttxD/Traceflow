import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { KANBAN_COLUMNS } from './kanban-display.js';

export function TaskMoveMenu({ task, disabled = false, onMove }) {
  const menuId = useId();
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const itemRefs = useRef([]);
  const open = position !== null;
  const targets = KANBAN_COLUMNS.filter((column) => column.status !== task.status);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (triggerRef.current?.contains(event.target) || menuRef.current?.contains(event.target))
        return;
      setPosition(null);
    };
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setPosition(null);
      triggerRef.current?.focus();
    };
    const closeOnViewportChange = () => setPosition(null);
    document.addEventListener('pointerdown', closeOutside, true);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', closeOnViewportChange);
    window.addEventListener('scroll', closeOnViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', closeOnViewportChange);
      window.removeEventListener('scroll', closeOnViewportChange, true);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setPosition(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const estimatedHeight = targets.length * 44 + 8;
    const above = rect.bottom + estimatedHeight > window.innerHeight && rect.top > estimatedHeight;
    setPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 224)),
      top: above ? Math.max(8, rect.top - estimatedHeight - 4) : rect.bottom + 4
    });
    window.requestAnimationFrame(() => itemRefs.current[0]?.focus());
  }

  function moveFocus(event) {
    const items = itemRefs.current.filter(Boolean);
    if (!items.length) return;
    const current = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(current + 1) % items.length].focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(current <= 0 ? items.length : current) - 1].focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0].focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items.at(-1).focus();
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="kanban-task__action kanban-task__move-trigger"
        data-task-move
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Mover tarefa ${task.title}`}
        title="Mover tarefa"
        onClick={toggle}
      >
        <span aria-hidden="true">↔</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            className="kanban-task__move-menu"
            role="menu"
            aria-label={`Mover tarefa ${task.title}`}
            style={position}
            onKeyDown={moveFocus}
          >
            {targets.map((column, index) => (
              <button
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                key={column.status}
                type="button"
                role="menuitem"
                onClick={() => {
                  setPosition(null);
                  void Promise.resolve(onMove(task, column.status, triggerRef.current)).finally(
                    () => {
                      window.requestAnimationFrame(() => {
                        if (triggerRef.current?.isConnected) triggerRef.current.focus();
                      });
                    }
                  );
                }}
              >
                Mover para {column.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
