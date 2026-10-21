export * from './api/traceability.api.js';
export { useOpenAlertIndex } from './hooks/useOpenAlertIndex.js';
export { TaskInconsistencySection } from './components/TaskInconsistencySection.jsx';
export { AlertDetails } from './components/AlertDetails.jsx';
// S2-06: o relatório usa os mesmos rótulos de situação da aba Rastreabilidade.
export { situationLabel, situations } from './model/requirement-view.js';
