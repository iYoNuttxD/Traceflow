import { describe, expect, it } from 'vitest';
import { createJsonZip } from '../../src/modules/settings/zip.js';

function readStoredJsonFiles(zip) {
  const files = {};
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const size = zip.readUInt32LE(offset + 18);
    const filenameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const contentStart = nameStart + filenameLength + extraLength;
    const name = zip.subarray(nameStart, nameStart + filenameLength).toString('utf8');
    files[name] = JSON.parse(zip.subarray(contentStart, contentStart + size).toString('utf8'));
    offset = contentStart + size;
  }
  return files;
}

describe('arquivo de portabilidade ZIP/JSON', () => {
  it('gera ZIP válido estruturalmente com manifesto e JSON parseável', () => {
    const generatedAt = new Date('2030-01-02T03:04:05.000Z');
    const zip = createJsonZip(
      {
        'manifest.json': {
          schemaVersion: '1.0',
          generatedAt: generatedAt.toISOString(),
          format: 'TRACEFLOW_USER_DATA_EXPORT',
          files: ['manifest.json', 'profile.json']
        },
        'profile.json': { name: 'Pessoa', accountStatus: 'ACTIVE' }
      },
      generatedAt
    );
    const files = readStoredJsonFiles(zip);
    expect(zip.subarray(0, 2).toString()).toBe('PK');
    expect(files['manifest.json']).toEqual({
      schemaVersion: '1.0',
      generatedAt: '2030-01-02T03:04:05.000Z',
      format: 'TRACEFLOW_USER_DATA_EXPORT',
      files: ['manifest.json', 'profile.json']
    });
    expect(files['profile.json']).toEqual({ name: 'Pessoa', accountStatus: 'ACTIVE' });
  });

  it('recusa nome capaz de path traversal', () => {
    expect(() => createJsonZip({ '../profile.json': {} })).toThrow(/Nome de arquivo/);
  });
});
