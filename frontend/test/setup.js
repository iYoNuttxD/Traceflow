import { afterEach, vi } from 'vitest';

let cleanup;

afterEach(() => {
  cleanup?.();
  vi.clearAllMocks();
});

if (typeof window !== 'undefined') {
  // Pure Node suites do not need React's renderer, DOM queries or matchers.
  await import('@testing-library/jest-dom/vitest');
  ({ cleanup } = await import('@testing-library/react'));

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  });

  class ResizeObserverStub {
    observe() {}

    unobserve() {}

    disconnect() {}
  }

  globalThis.ResizeObserver = ResizeObserverStub;

  window.scrollTo = vi.fn();
}
