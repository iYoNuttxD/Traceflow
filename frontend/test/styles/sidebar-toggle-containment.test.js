import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { conditionalRules, parseStylesheet, ruleDeclarations } from '../helpers/css-rules.js';

const shell = parseStylesheet(readFileSync(resolve('src/app/layout/AppShell.css'), 'utf8'));
const panel = parseStylesheet(
  readFileSync(resolve('src/features/notifications/components/NotificationsPanel.css'), 'utf8')
);
const collapsed = ".trace-shell[data-sidebar-state='collapsed']";

describe('sidebar toggle containment beside the notifications modal', () => {
  it('animates the panel from the content side without crossing the sidebar boundary', () => {
    const motion = conditionalRules(panel, 'media', '(prefers-reduced-motion: no-preference)');
    const animation = Array.from(motion.cssRules).find(
      (rule) => rule.name === 'notifications-panel-in'
    );
    expect(animation).toBeDefined();
    const start = Array.from(animation.cssRules).find((rule) => rule.keyText === '0%');
    expect(start.style.getPropertyValue('transform')).toBe('translateX(var(--space-6))');
  });

  it('settles the sidebar width when the modal opens during a collapse transition', () => {
    expect(ruleDeclarations(shell, ".trace-shell[data-notifications-state='open']")).toMatchObject({
      transition: 'none'
    });
  });

  it('reserves separate header rows instead of protruding into the modal by half a target', () => {
    const toggle = ruleDeclarations(shell, `${collapsed} .trace-shell__collapse`);
    expect(toggle).not.toHaveProperty('position');
    expect(toggle).not.toHaveProperty('right');
    expect(toggle).not.toHaveProperty('top');
    expect(ruleDeclarations(shell, `${collapsed} .trace-shell__sidebar-header`)).toMatchObject({
      'flex-direction': 'column',
      'min-height': 'calc((2 * var(--size-touch-target)) + (2 * var(--space-1)))',
      gap: '0px'
    });
  });

  it('restores the mobile header row and its dedicated close control', () => {
    const mobile = conditionalRules(shell, 'media', '(max-width: 720px)');
    expect(ruleDeclarations(mobile, `${collapsed} .trace-shell__sidebar-header`)).toMatchObject({
      'flex-direction': 'row',
      'min-height': '5rem'
    });
    expect(ruleDeclarations(mobile, '.trace-shell__collapse')).toMatchObject({ display: 'none' });
    expect(ruleDeclarations(mobile, '.trace-shell__mobile-close')).toMatchObject({
      display: 'inline-grid'
    });
  });
});
