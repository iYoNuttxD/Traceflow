import { expect, it, vi } from 'vitest';

const randomBytes = vi.hoisted(() => vi.fn());
vi.mock('node:crypto', async (importOriginal) => ({ ...(await importOriginal()), randomBytes }));
const { createAccessCode } =
  await import('../../src/modules/projects/services/project-access-code.service.js');

it('formats every byte of a fresh 128-bit crypto capability', () => {
  randomBytes.mockReturnValueOnce(Buffer.from('00112233445566778899aabbccddeeff', 'hex'));
  randomBytes.mockReturnValueOnce(Buffer.from('ffeeddccbbaa99887766554433221100', 'hex'));
  expect(createAccessCode()).toBe('TRC-00112233445566778899AABBCCDDEEFF');
  expect(createAccessCode()).toBe('TRC-FFEEDDCCBBAA99887766554433221100');
  expect(randomBytes.mock.calls).toEqual([[16], [16]]);
});
