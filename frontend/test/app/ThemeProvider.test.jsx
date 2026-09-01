import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from '../../src/app/theme/ThemeProvider.jsx';
import { THEME_STORAGE_KEY } from '../../src/app/theme/theme-preference.js';

function mockSystemTheme({ dark = false, legacy = false } = {}) {
  let changeHandler;
  const media = {
    matches: dark,
    media: '(prefers-color-scheme: dark)'
  };

  if (legacy) {
    media.addListener = vi.fn((handler) => {
      changeHandler = handler;
    });
    media.removeListener = vi.fn((handler) => {
      if (changeHandler === handler) changeHandler = undefined;
    });
  } else {
    media.addEventListener = vi.fn((_event, handler) => {
      changeHandler = handler;
    });
    media.removeEventListener = vi.fn((_event, handler) => {
      if (changeHandler === handler) changeHandler = undefined;
    });
  }

  window.matchMedia = vi.fn().mockReturnValue(media);

  return {
    media,
    emit(nextDark) {
      media.matches = nextDark;
      act(() => changeHandler?.({ matches: nextDark }));
    }
  };
}

function ThemeProbe() {
  const { themePreference, resolvedTheme, cycleTheme, selectTheme } = useTheme();
  return (
    <>
      <output data-testid="theme-state">
        {themePreference}/{resolvedTheme}
      </output>
      <button type="button" onClick={cycleTheme}>
        Ciclar tema
      </button>
      <button type="button" onClick={() => selectTheme('light')}>
        Selecionar claro
      </button>
      <button type="button" onClick={() => selectTheme('dark')}>
        Selecionar escuro
      </button>
    </>
  );
}

function renderTheme() {
  return render(
    <ThemeProvider>
      <ThemeProbe />
    </ThemeProvider>
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('usa Sistema como padrão e resolve Light quando o sistema está claro', () => {
    mockSystemTheme();
    renderTheme();

    expect(screen.getByTestId('theme-state')).toHaveTextContent('system/light');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('resolve Dark quando Sistema acompanha um sistema escuro', () => {
    mockSystemTheme({ dark: true });
    renderTheme();

    expect(screen.getByTestId('theme-state')).toHaveTextContent('system/dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it.each([
    ['light', true, 'light'],
    ['dark', false, 'dark']
  ])('preserva a preferência manual %s sobre o sistema', (preference, systemDark, expected) => {
    mockSystemTheme({ dark: systemDark });
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    renderTheme();

    expect(screen.getByTestId('theme-state')).toHaveTextContent(`${preference}/${expected}`);
    expect(document.documentElement).toHaveAttribute('data-theme', expected);
  });

  it('cicla Sistema → Claro → Escuro → Sistema com persistência explícita', async () => {
    mockSystemTheme({ dark: true });
    const user = userEvent.setup();
    renderTheme();

    expect(screen.getByTestId('theme-state')).toHaveTextContent('system/dark');
    await user.click(screen.getByRole('button', { name: 'Ciclar tema' }));
    expect(screen.getByTestId('theme-state')).toHaveTextContent('light/light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    await user.click(screen.getByRole('button', { name: 'Ciclar tema' }));
    expect(screen.getByTestId('theme-state')).toHaveTextContent('dark/dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'Ciclar tema' }));
    expect(screen.getByTestId('theme-state')).toHaveTextContent('system/dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
  });

  it('acompanha mudanças Light↔Dark do sistema enquanto a preferência é Sistema', () => {
    const system = mockSystemTheme();
    renderTheme();

    system.emit(true);
    expect(screen.getByTestId('theme-state')).toHaveTextContent('system/dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');

    system.emit(false);
    expect(screen.getByTestId('theme-state')).toHaveTextContent('system/light');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });

  it.each([
    ['light', true],
    ['dark', false]
  ])('ignora mudanças do sistema na preferência manual %s', (preference, nextSystemDark) => {
    const system = mockSystemTheme({ dark: !nextSystemDark });
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    renderTheme();

    system.emit(nextSystemDark);
    expect(screen.getByTestId('theme-state')).toHaveTextContent(`${preference}/${preference}`);
  });

  it('remove o listener do sistema ao selecionar uma preferência manual', async () => {
    const system = mockSystemTheme();
    const user = userEvent.setup();
    renderTheme();

    await user.click(screen.getByRole('button', { name: 'Selecionar escuro' }));
    expect(system.media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    system.emit(false);
    expect(screen.getByTestId('theme-state')).toHaveTextContent('dark/dark');
  });

  it('usa Sistema para storage inválido', () => {
    mockSystemTheme({ dark: true });
    window.localStorage.setItem(THEME_STORAGE_KEY, 'banana');
    renderTheme();

    expect(screen.getByTestId('theme-state')).toHaveTextContent('system/dark');
  });

  it('resolve Sistema como Light sem matchMedia e não quebra', () => {
    window.matchMedia = undefined;
    renderTheme();

    expect(screen.getByTestId('theme-state')).toHaveTextContent('system/light');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });

  it('usa addListener/removeListener como fallback compatível', () => {
    const system = mockSystemTheme({ legacy: true });
    const view = renderTheme();

    expect(system.media.addListener).toHaveBeenCalledWith(expect.any(Function));
    system.emit(true);
    expect(screen.getByTestId('theme-state')).toHaveTextContent('system/dark');
    view.unmount();
    expect(system.media.removeListener).toHaveBeenCalledWith(expect.any(Function));
  });
});
