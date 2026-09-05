import { sampleRepository } from './sample.repository.js';
// Client externo pelo arquivo do módulo: route-no-external-client.
import './sample.client.js';

export const sampleRoutes = sampleRepository;
