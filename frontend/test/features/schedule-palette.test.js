import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SCHEDULE_COLOR_SLOT_COUNT,
  assignScheduleEntitySlots,
  scheduleEntityKey,
  scheduleEntityStyle
} from '../../src/features/schedule/components/schedule-palette.js';

const entities = (total) =>
  Array.from({ length: total }, (_, index) => ({ type: 'sprint', id: index + 1 }));

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
    const slots = assignScheduleEntitySlots({ visible: entities(SCHEDULE_COLOR_SLOT_COUNT) });
    expect(new Set(slots.values()).size).toBe(SCHEDULE_COLOR_SLOT_COUNT);
  });

  it('reutiliza slots somente depois do esgotamento', () => {
    const slots = assignScheduleEntitySlots({
      visible: entities(SCHEDULE_COLOR_SLOT_COUNT + 1)
    });
    expect(slots.size).toBe(SCHEDULE_COLOR_SLOT_COUNT + 1);
    expect(new Set(slots.values()).size).toBe(SCHEDULE_COLOR_SLOT_COUNT);
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

  it('preserva o slot de entidades compartilhadas ao navegar entre meses', () => {
    const september = assignScheduleEntitySlots({
      visible: [
        { type: 'sprint', id: 4 },
        { type: 'milestone', id: 20 }
      ]
    });
    const october = assignScheduleEntitySlots({
      visible: [
        { type: 'sprint', id: 4 },
        { type: 'task', id: 30 }
      ],
      previousSlots: september,
      previousVisibleKeys: new Set([
        scheduleEntityKey('sprint', 4),
        scheduleEntityKey('milestone', 20)
      ])
    });

    expect(october.get(scheduleEntityKey('sprint', 4))).toBe(
      september.get(scheduleEntityKey('sprint', 4))
    );
    expect(october.get(scheduleEntityKey('task', 30))).not.toBe(
      october.get(scheduleEntityKey('sprint', 4))
    );
  });
});

describe('schedule automatic color CSS', () => {
  const css = readFileSync('src/features/schedule/pages/ScheduleScreen.css', 'utf8');

  it('oferece dez slots semânticos compatíveis com Light/Dark sem patches locais', () => {
    for (let index = 0; index < SCHEDULE_COLOR_SLOT_COUNT; index += 1) {
      expect(css.match(new RegExp(`--schedule-color-${index}:`, 'g'))).toHaveLength(1);
    }
    expect(css).toContain('var(--color-accent-primary)');
    expect(css).toContain('var(--color-success-text)');
    expect(css).not.toContain('data-schedule-palette');
    expect(css).not.toContain('schedule-palette-select');
    expect(css).not.toContain("[data-theme='dark']");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it('define grid responsivo e altura limitada para próximos prazos', () => {
    expect(css).toContain('grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr))');
    expect(css).toMatch(/\.schedule-upcoming\s*\{[^}]*max-height:/s);
    expect(css).toMatch(/\.schedule-upcoming__list\s*\{[^}]*overflow-y: auto;/s);
  });
});
