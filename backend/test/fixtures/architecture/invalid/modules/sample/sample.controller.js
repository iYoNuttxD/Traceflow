import { sampleRepository } from './sample.repository.js';
// Pacote bruto, sem passar pelo client do módulo: controller-no-external-client.
import '@octokit/rest';

export const sampleController = sampleRepository;
