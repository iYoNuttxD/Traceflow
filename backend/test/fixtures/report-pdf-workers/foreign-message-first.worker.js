import { parentPort } from 'node:worker_threads';
import { REPORT_PDF_MESSAGE } from '../../../src/modules/reports/report-pdf.message.js';

// Reproduz o `node --watch`: avisos de dependência chegam antes do PDF pelo mesmo canal.
parentPort.postMessage({ 'watch:import': ['file:///report-pdf.worker.js'] });
parentPort.postMessage({ type: REPORT_PDF_MESSAGE, pdf: Buffer.from('%PDF-1.7 teste') });
