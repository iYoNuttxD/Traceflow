import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { fail, parse } from '../test-case.schema.js';
import {
  declaredFormat,
  evidenceField,
  evidenceLimits,
  safeFilename
} from '../storage/test-evidence.validation.js';

export const CHUNK_BYTES = 8 * 1024 * 1024;
export const PAYLOAD_BYTES = 6 * 1024 * 1024;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const SHA256 = /^[0-9a-f]{64}$/;
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const uploadError = (message, status = 409, code = 'UPLOAD_CONFLICT') =>
  fail(message, status, code);
export const unavailable = () =>
  uploadError('Armazenamento temporário indisponível.', 503, 'UPLOAD_STORAGE_UNAVAILABLE');
export const busy = () =>
  uploadError('Upload ocupado. Tente novamente em instantes.', 429, 'UPLOAD_BUSY');

export function uploadLimits(source = process.env) {
  const defaults = {
    TTL_SECONDS: 86400,
    ACTIVE_USER: 3,
    ACTIVE_PROJECT: 10,
    ACTIVE_GLOBAL: 32,
    TEMP_USER_BYTES: 256 * 1024 * 1024,
    TEMP_GLOBAL_BYTES: 1024 * 1024 * 1024,
    MIN_FREE_BYTES: 512 * 1024 * 1024,
    CONCURRENT_USER: 2,
    CONCURRENT_GLOBAL: 4
  };
  const values = Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => {
      const value = Number(source[`TEST_UPLOAD_${key}`] ?? fallback);
      if (
        !Number.isSafeInteger(value) ||
        value < 1 ||
        (key === 'MIN_FREE_BYTES' ? value < fallback : value > fallback)
      )
        throw uploadError('Configuração de uploads inválida.', 503, 'UPLOAD_CONFIGURATION_INVALID');
      return [key, value];
    })
  );
  return {
    ...values,
    maxParts: 40,
    chunkMs: 45000,
    leaseMs: 90000,
    completeMs: 60000,
    retentionMs: 7 * 86400000
  };
}
const schema = z
  .object({
    idempotencyKey: z.string().regex(UUID),
    testCaseVersion: z.number().int().positive(),
    files: z
      .array(
        z
          .object({
            name: z.string().min(1).max(200),
            field: z.string().max(32),
            sizeBytes: z.number().int().positive(),
            sha256: z.string().regex(SHA256)
          })
          .strict()
      )
      .min(1)
      .max(20)
  })
  .strict();

export function manifest(input, limits = evidenceLimits(), maximumParts = 40) {
  if (Array.isArray(input?.files) && input.files.length > limits.files)
    throw uploadError('Muitas evidências.', 413, 'TEST_EVIDENCE_LIMIT_EXCEEDED');
  const data = parse(schema, input);
  let totalBytes = 0,
    totalParts = 0;
  const destinations = new Map();
  const files = data.files.map((file) => {
    const { scope, position } = evidenceField(file.field);
    const originalName = safeFilename(file.name);
    const kind = declaredFormat(originalName, scope)[2];
    const count = (destinations.get(file.field) || 0) + 1;
    destinations.set(file.field, count);
    totalBytes += file.sizeBytes;
    totalParts += Math.ceil(file.sizeBytes / CHUNK_BYTES);
    if (
      file.sizeBytes > (kind === 'VIDEO' ? limits.videoBytes : limits.fileBytes) ||
      count > (scope === 'STEP' ? limits.perStep : limits.general)
    )
      throw uploadError('Limite de evidências excedido.', 413, 'TEST_EVIDENCE_LIMIT_EXCEEDED');
    return {
      id: randomUUID(),
      storageKey: randomUUID(),
      originalName,
      field: file.field,
      scope,
      position,
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
      parts: {}
    };
  });
  if (totalBytes > limits.totalBytes || files.length > limits.files || totalParts > maximumParts)
    throw uploadError('Limite de evidências excedido.', 413, 'TEST_EVIDENCE_LIMIT_EXCEEDED');
  // Fixed ordering and explicit fields keep request replay independent of JSON key ordering.
  const manifestHash = digest(
    JSON.stringify({
      testCaseVersion: data.testCaseVersion,
      files: files.map(({ originalName, field, sizeBytes, sha256 }) => ({
        originalName,
        field,
        sizeBytes,
        sha256
      }))
    })
  );
  return {
    files,
    manifestHash,
    totalBytes,
    testCaseVersion: data.testCaseVersion,
    idempotencyKey: data.idempotencyKey
  };
}
export function partContract(row, fileId, index, checksum, offset) {
  const file = row.filesJson.find((item) => item.id === fileId);
  if (!file) throw uploadError('Upload não encontrado.', 404, 'RESOURCE_NOT_FOUND');
  if (
    !Number.isSafeInteger(index) ||
    index < 0 ||
    index >= Math.ceil(file.sizeBytes / CHUNK_BYTES) ||
    !SHA256.test(checksum || '') ||
    offset !== index * CHUNK_BYTES
  )
    throw uploadError('Parte, offset ou checksum inválido.', 400, 'UPLOAD_PART_INVALID');
  return { file, size: Math.min(CHUNK_BYTES, file.sizeBytes - offset), prior: file.parts[index] };
}
export function progress(row) {
  return {
    uploadId: row.id,
    testCaseVersion: row.testCaseVersion,
    sessionStatus: row.status,
    chunkSize: CHUNK_BYTES,
    expiresAt: row.expiresAt,
    executionId: row.executionId,
    files: row.filesJson.map(({ id, originalName, field, sizeBytes, sha256, parts }) => ({
      id,
      name: originalName,
      field,
      sizeBytes,
      sha256,
      receivedParts: Object.entries(parts).map(([index, part]) => ({
        index: Number(index),
        sizeBytes: part.sizeBytes,
        sha256: part.sha256
      }))
    })),
    confirmedBytes: row.filesJson.reduce(
      (sum, file) => sum + Object.values(file.parts).reduce((n, part) => n + part.sizeBytes, 0),
      0
    ),
    totalBytes: row.totalBytes
  };
}
