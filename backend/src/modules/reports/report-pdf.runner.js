import { Worker } from 'node:worker_threads';
import { AppError } from '../../shared/errors/index.js';
import { REPORT_PDF_MESSAGE } from './report-pdf.message.js';

// Cada PDF é montado numa worker thread própria: o layout do pdfmake é síncrono e, no
// teto de volume do relatório (2.000 requisitos, 100 Sprints), passa de um segundo de
// CPU. Fora da thread principal a API continua respondendo; o prazo encerra a worker.
export const REPORT_PDF_TIMEOUT_MS = 30 * 1000;
export const REPORT_PDF_MAX_CONCURRENT = 2;
const WORKER_HEAP_MB = 512;

let running = 0;

export function reportPdfError(code, message, statusCode) {
  return new AppError({ message, code, statusCode, exposeTechnicalDetails: true });
}

export async function renderReportPdfInWorker(
  report,
  options = {},
  {
    timeoutMs = REPORT_PDF_TIMEOUT_MS,
    maxConcurrent = REPORT_PDF_MAX_CONCURRENT,
    workerUrl = new URL('./report-pdf.worker.js', import.meta.url)
  } = {}
) {
  if (running >= maxConcurrent)
    throw reportPdfError(
      'REPORT_PDF_BUSY',
      'Outros PDFs estão sendo gerados agora. Tente novamente em instantes.',
      503
    );
  running += 1;
  let worker;
  try {
    // Dentro do try: falha ao criar a worker (ou ao copiar os dados) também libera a vaga.
    worker = new Worker(workerUrl, {
      workerData: { report, options },
      resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB }
    });
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          reportPdfError('REPORT_PDF_TIMEOUT', 'A montagem do PDF excedeu o tempo máximo.', 500)
        );
      }, timeoutMs);
      timer.unref?.();
      // Mensagens de outro tipo (como as do `node --watch`) são ignoradas; um envelope
      // inválido vira falha da exportação, nunca uma exceção solta no evento.
      worker.on('message', (data) => {
        if (data?.type !== REPORT_PDF_MESSAGE) return;
        clearTimeout(timer);
        if (!ArrayBuffer.isView(data.pdf)) {
          reject(new Error('A worker do PDF devolveu um resultado inválido.'));
          return;
        }
        resolve(Buffer.from(data.pdf.buffer, data.pdf.byteOffset, data.pdf.byteLength));
      });
      worker.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      worker.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`A worker do PDF terminou sem resultado (código ${code}).`));
      });
    });
  } finally {
    running -= 1;
    await worker?.terminate();
  }
}
