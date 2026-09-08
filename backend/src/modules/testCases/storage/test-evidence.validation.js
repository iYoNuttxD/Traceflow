import { extname } from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { fail } from '../test-case.schema.js';
const MiB = 1024 * 1024;
export const EVIDENCE_DEFAULTS = Object.freeze({
  fileBytes: 10 * MiB,
  videoBytes: 50 * MiB,
  perStep: 3,
  general: 5,
  files: 20,
  totalBytes: 100 * MiB
});
export function evidenceLimits(environment = process.env) {
  const names = {
    fileBytes: 'FILE_BYTES',
    videoBytes: 'VIDEO_BYTES',
    perStep: 'PER_STEP',
    general: 'GENERAL',
    files: 'FILES',
    totalBytes: 'TOTAL_BYTES'
  };
  return Object.fromEntries(
    Object.entries(names).map(([key, suffix]) => {
      const value =
        environment[`TEST_EVIDENCE_MAX_${suffix}`] === undefined
          ? EVIDENCE_DEFAULTS[key]
          : Number(environment[`TEST_EVIDENCE_MAX_${suffix}`]);
      if (!Number.isSafeInteger(value) || value < 1 || value > EVIDENCE_DEFAULTS[key])
        throw fail(
          'Configuração de evidências inválida.',
          503,
          'TEST_EVIDENCE_STORAGE_UNAVAILABLE'
        );
      return [key, value];
    })
  );
}
export function evidenceField(field) {
  if (field === 'evidence') return { scope: 'EXECUTION', position: null };
  const match = /^stepEvidence\.([1-9]\d?)$|^stepEvidence\.(100)$/.exec(field);
  if (!match) throw fail('Campo de evidência inválido.');
  return { scope: 'STEP', position: Number(match[1] || match[2]) };
}
export function safeFilename(name) {
  return (
    String(name)
      .replaceAll('\\', '/')
      .split('/')
      .at(-1)
      .replace(/[\p{Cc}\p{Cf}<>:"|?*]/gu, '_')
      .replace(/^\.+/, '')
      .trim()
      .slice(-200) || 'evidence'
  );
}
const formats = {
  '.png': ['png', 'image/png', 'IMAGE'],
  '.jpg': ['jpg', 'image/jpeg', 'IMAGE'],
  '.jpeg': ['jpg', 'image/jpeg', 'IMAGE'],
  '.webp': ['webp', 'image/webp', 'IMAGE'],
  '.mp4': ['mp4', 'video/mp4', 'VIDEO'],
  '.webm': ['webm', 'video/webm', 'VIDEO'],
  '.mov': ['mov', 'video/quicktime', 'VIDEO'],
  '.pdf': ['pdf', 'application/pdf', 'DOCUMENT'],
  '.txt': [null, 'text/plain', 'TEXT'],
  '.log': [null, 'text/plain', 'TEXT'],
  '.json': [null, 'application/json', 'DATA']
};
export function declaredFormat(name, scope) {
  const format = formats[extname(name).toLowerCase()];
  if (!format || (scope === 'STEP' && !['IMAGE', 'VIDEO'].includes(format[2])))
    throw fail('Formato de evidência não permitido.');
  return format;
}
export async function validateEvidenceBytes(bytes, name, scope, limits = EVIDENCE_DEFAULTS) {
  const [ext, mimeType, kind] = declaredFormat(name, scope);
  if (!bytes.length || bytes.length > (kind === 'VIDEO' ? limits.videoBytes : limits.fileBytes))
    throw fail('Tamanho de evidência inválido.', 413, 'TEST_EVIDENCE_LIMIT_EXCEEDED');
  if (ext) {
    let detected;
    try {
      detected = await fileTypeFromBuffer(bytes);
    } catch {
      throw fail('Conteúdo de evidência inválido.');
    }
    if (detected?.ext !== ext) throw fail('O conteúdo não corresponde ao formato do arquivo.');
  } else {
    let value;
    try {
      value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw fail('O arquivo deve conter texto UTF-8 válido.');
    }
    if (
      [...value].some((char) => {
        const n = char.codePointAt(0);
        return (n < 32 && ![9, 10, 13].includes(n)) || n === 127;
      })
    )
      throw fail('Conteúdo binário não permitido como texto.');
    if (kind === 'DATA') {
      try {
        JSON.parse(value);
      } catch {
        throw fail('JSON inválido.');
      }
    }
    // Active formats disguised as plain text are not accepted. Downloads remain attachments.
    if (kind === 'TEXT' && /<\s*(?:!doctype\s+html|html|script|svg)\b/i.test(value))
      throw fail('Conteúdo ativo não permitido.');
  }
  return { mimeType, kind };
}
