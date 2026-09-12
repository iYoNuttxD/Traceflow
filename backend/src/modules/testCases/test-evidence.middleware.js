import multer from 'multer';
import { testEvidenceStorage } from './storage/local-test-evidence.storage.js';
import { executionSchema, fail, parse } from './test-case.schema.js';
import { evidenceField, declaredFormat } from './storage/test-evidence.validation.js';

export function createEvidenceUpload(storage = testEvidenceStorage) {
  const parser = multer({
    storage: {
      _handleFile(req, file, callback) {
        storage.receive(req.evidenceAttempt, file).then((info) => callback(null, info), callback);
      },
      _removeFile(_req, _file, callback) {
        callback(null);
      }
    },
    limits: {
      files: storage.limits.files,
      fields: 1,
      // Busboy emits partsLimit on reaching the count; reserve the terminal boundary.
      parts: storage.limits.files + 2,
      // Exact byte limits are inclusive and enforced by the storage stream counter.
      fileSize: Math.max(storage.limits.fileBytes, storage.limits.videoBytes) + 1,
      fieldSize: 6 * 1024 * 1024,
      fieldNameSize: 100,
      headerPairs: 100
    },
    fileFilter(_req, file, callback) {
      try {
        const { scope } = evidenceField(file.fieldname);
        declaredFormat(file.originalname, scope);
        callback(null, true);
      } catch (error) {
        callback(error);
      }
    }
  }).fields([
    { name: 'evidence', maxCount: storage.limits.general },
    ...Array.from({ length: 100 }, (_, i) => ({
      name: `stepEvidence.${i + 1}`,
      maxCount: storage.limits.perStep
    }))
  ]);
  return async function upload(req, res, next) {
    if (!req.is('multipart/form-data'))
      return next(
        fail('Use multipart/form-data para registrar a execução.', 415, 'UNSUPPORTED_MEDIA_TYPE')
      );
    try {
      req.evidenceAttempt = await storage.begin();
      await new Promise((resolve, reject) =>
        parser(req, res, (error) => (error ? reject(error) : resolve()))
      );
      if (Object.keys(req.body).length !== 1 || typeof req.body.payload !== 'string')
        throw fail('Envie exatamente um campo payload JSON.');
      let payload;
      try {
        payload = JSON.parse(req.body.payload);
      } catch {
        throw fail('Payload JSON inválido.');
      }
      req.body = parse(executionSchema, payload);
      next();
    } catch (error) {
      try {
        await storage.cleanup(req.evidenceAttempt);
      } catch (cleanupError) {
        return next(cleanupError);
      }
      next(
        error instanceof multer.MulterError
          ? fail(
              'Multipart inválido ou limite de upload excedido.',
              error.code === 'LIMIT_UNEXPECTED_FILE' ? 400 : 413,
              'TEST_EVIDENCE_LIMIT_EXCEEDED'
            )
          : error
      );
    }
  };
}
