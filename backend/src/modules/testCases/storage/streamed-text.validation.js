import { Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parser } from 'stream-json/parser.js';
import { fail } from '../test-case.schema.js';
import { declaredFormat, EVIDENCE_READ_BYTES } from './test-evidence.validation.js';

// Validate UTF-8/content and JSON syntax without assembling the file, strings,
// numbers or object tree. The same validator serves legacy and resumable uploads.
export async function validateStoredText(handle, size, name, scope, limits, hash) {
  const [, mimeType, kind] = declaredFormat(name, scope);
  if (!size || size > limits.fileBytes)
    throw fail('Tamanho de evidência inválido.', 413, 'TEST_EVIDENCE_LIMIT_EXCEEDED');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let tail = '';
  function inspect(value) {
    for (const char of value) {
      const code = char.codePointAt(0);
      if ((code < 32 && ![9, 10, 13].includes(code)) || code === 127)
        throw fail('Conteúdo binário não permitido como texto.');
    }
    if (kind === 'TEXT') {
      // Collapse arbitrarily long whitespace across boundaries before retaining a bounded suffix.
      const scan = (tail + value).replace(/\s+/gu, ' ');
      if (/<\s*(?:!doctype\s+html|html|script|svg)\b/i.test(scan))
        throw fail('Conteúdo ativo não permitido.');
      tail = scan.slice(-64);
    }
  }
  const check = new Transform({
    transform(chunk, _encoding, callback) {
      try {
        hash.update(chunk);
        const value = decoder.decode(chunk, { stream: true });
        inspect(value);
        callback(null, value);
      } catch (error) {
        callback(error.statusCode ? error : fail('O arquivo deve conter texto UTF-8 válido.'));
      }
    },
    flush(callback) {
      try {
        const value = decoder.decode();
        inspect(value);
        if (value) this.push(value);
        callback();
      } catch {
        callback(fail('O arquivo deve conter texto UTF-8 válido.'));
      }
    }
  });
  const sink = new Writable({
    objectMode: true,
    write(_chunk, _encoding, done) {
      done();
    }
  });
  try {
    const stages = [
      handle.createReadStream({ autoClose: false, start: 0, highWaterMark: EVIDENCE_READ_BYTES }),
      check
    ];
    if (kind === 'DATA') stages.push(parser.asStream({ packValues: false }));
    await pipeline(...stages, sink);
  } catch (error) {
    if (error.statusCode || error.code) throw error;
    throw fail(kind === 'DATA' ? 'JSON inválido.' : 'Conteúdo inválido.');
  }
  return { mimeType, kind };
}
