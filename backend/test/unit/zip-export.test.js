import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createJsonZip } from '../../src/modules/settings/zip.js';

describe('arquivo de portabilidade ZIP/JSON', () => {
  it('gera ZIP válido estruturalmente com manifesto e JSON parseável por consumidor independente com CRC', async () => {
    const generatedAt = new Date('2030-01-02T03:04:05.000Z');
    const zip = createJsonZip(
      {
        'manifest.json': {
          schemaVersion: '1.0',
          generatedAt: generatedAt.toISOString(),
          format: 'TRACEFLOW_USER_DATA_EXPORT',
          files: ['manifest.json', 'profile.json']
        },
        'profile.json': { name: 'João 日本語', accountStatus: 'ACTIVE' }
      },
      generatedAt
    );
    // JSZip traverses the central directory and checks every entry's CRC.
    // Do not replace this with a local-header parser: it missed corrupt exports.
    const archive = await JSZip.loadAsync(zip, { checkCRC32: true });
    expect(Object.keys(archive.files).sort()).toEqual(['manifest.json', 'profile.json']);
    const files = Object.fromEntries(
      await Promise.all(
        Object.keys(archive.files).map(async (name) => [
          name,
          JSON.parse(await archive.file(name).async('string'))
        ])
      )
    );
    expect(zip.subarray(0, 2).toString()).toBe('PK');
    expect(files['manifest.json']).toEqual({
      schemaVersion: '1.0',
      generatedAt: '2030-01-02T03:04:05.000Z',
      format: 'TRACEFLOW_USER_DATA_EXPORT',
      files: ['manifest.json', 'profile.json']
    });
    expect(files['profile.json']).toEqual({ name: 'João 日本語', accountStatus: 'ACTIVE' });
    expect(await archive.file('profile.json').async('string')).toBe(
      '{\n  "name": "João 日本語",\n  "accountStatus": "ACTIVE"\n}\n'
    );
  });

  it('recusa nome capaz de path traversal', () => {
    expect(() => createJsonZip({ '../profile.json': {} })).toThrow(/Nome de arquivo/);
  });
});
