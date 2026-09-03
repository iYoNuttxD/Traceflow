import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  SCHEDULE_PALETTE_SLOT_COUNT,
  assignScheduleEntitySlots,
  persistSchedulePalette,
  readSchedulePalette,
  scheduleEntityStyle
} from '../../src/features/schedule/components/schedule-palette.js';

const entities = (total) =>
  Array.from({ length: total }, (_, index) => ({ type: 'sprint', id: index + 1 }));

describe('schedule palette preference', () => {
  it('usa Padrão para preferência ausente ou inválida', () => {
    const storage = { getItem: () => 'inexistente' };
    expect(readSchedulePalette(storage)).toBe('default');
    expect(readSchedulePalette({ getItem: () => null })).toBe('default');
  });

  it('persiste apenas paletas suportadas', () => {
    const storage = { setItem: vi.fn() };
    persistSchedulePalette('contrast', storage);
    persistSchedulePalette('inexistente', storage);
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(storage.setItem).toHaveBeenCalledWith('traceflow.schedule.palette', 'contrast');
  });
});

describe('assignScheduleEntitySlots', () => {
  it('mantém associação estável independentemente da ordem de entrada', () => {
    const first = assignScheduleEntitySlots({ visible: entities(4) });
    const second = assignScheduleEntitySlots({ visible: [...entities(4)].reverse() });
    expect([...first.entries()]).toEqual([...second.entries()]);
    expect(scheduleEntityStyle(first, 'sprint', 2)).toEqual(
      scheduleEntityStyle(second, 'sprint', 2)
    );
  });

  it('não repete slots antes de esgotar a paleta', () => {
    const slots = assignScheduleEntitySlots({ visible: entities(SCHEDULE_PALETTE_SLOT_COUNT) });
    expect(new Set(slots.values()).size).toBe(SCHEDULE_PALETTE_SLOT_COUNT);
  });

  it('reutiliza slots somente depois do esgotamento', () => {
    const slots = assignScheduleEntitySlots({
      visible: entities(SCHEDULE_PALETTE_SLOT_COUNT + 1)
    });
    expect(slots.size).toBe(SCHEDULE_PALETTE_SLOT_COUNT + 1);
    expect(new Set(slots.values()).size).toBe(SCHEDULE_PALETTE_SLOT_COUNT);
  });

  it('distingue tipos que compartilham o mesmo ID público', () => {
    const slots = assignScheduleEntitySlots({
      visible: [
        { type: 'sprint', id: 1 },
        { type: 'milestone', id: 1 },
        { type: 'task', id: 1 }
      ]
    });
    expect(new Set(slots.values()).size).toBe(3);
  });
});

describe('schedule palette CSS', () => {
  const css = readFileSync('src/features/schedule/pages/ScheduleScreen.css', 'utf8');

  it('oferece dez slots nas três paletas com tokens semânticos compatíveis com Light/Dark', () => {
    for (let index = 0; index < SCHEDULE_PALETTE_SLOT_COUNT; index += 1) {
      expect(css.match(new RegExp(`--schedule-palette-${index}:`, 'g')).length).toBe(3);
    }
    expect(css).toContain("data-schedule-palette='contrast'");
    expect(css).toContain("data-schedule-palette='soft'");
    expect(css).toContain('var(--color-accent-primary)');
    expect(css).not.toContain("[data-theme='dark']");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}/i);
  });
});
