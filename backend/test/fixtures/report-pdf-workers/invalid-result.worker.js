import { parentPort } from 'node:worker_threads';
import { REPORT_PDF_MESSAGE } from '../../../src/modules/reports/report-pdf.message.js';

parentPort.postMessage({ type: REPORT_PDF_MESSAGE, pdf: 'não é um PDF' });
