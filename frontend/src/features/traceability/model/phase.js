// Presentation only: the backend situation remains the sole domain authority.
export const phases = {
  PLANNING: 'Planejamento',
  IMPLEMENTATION: 'Implementação',
  VALIDATION: 'Validação',
  CORRECTION: 'Correção',
  CONCLUSION: 'Conclusão'
};
export const situationPhases = Object.freeze({
  SEM_RASTREABILIDADE: 'PLANNING',
  PLANEJADO: 'PLANNING',
  EM_DESENVOLVIMENTO: 'IMPLEMENTATION',
  IMPLEMENTADO: 'IMPLEMENTATION',
  AGUARDANDO_VALIDACAO: 'VALIDATION',
  EM_VALIDACAO: 'VALIDATION',
  VALIDADO: 'VALIDATION',
  COM_FALHA: 'CORRECTION',
  EM_CORRECAO: 'CORRECTION',
  AGUARDANDO_RETESTE: 'CORRECTION',
  CONCLUIDO: 'CONCLUSION'
});
export const macroPhase = (situation) => situationPhases[situation] || null;
export const phaseLabel = (situation) => phases[macroPhase(situation)] || 'Fase indisponível';
export const traceabilityHelp = {
  progress: [
    'Progresso de implementação',
    'Calculado a partir das tarefas vinculadas ao requisito. Testes e defeitos não alteram este percentual; eles influenciam a situação de validação, correção e conclusão.'
  ],
  phase: [
    'Fase do requisito',
    'Agrupa a situação atual em uma etapa maior da rastreabilidade: planejamento, implementação, validação, correção ou conclusão.'
  ],
  situation: [
    'Situação da rastreabilidade',
    'Estado atual calculado pelo backend a partir do planejamento, tarefas, artefatos técnicos, testes, defeitos, correções e retestes relacionados ao requisito.'
  ],
  evidence: [
    'Evidências',
    'Implementação considera PRs ou commits vinculados ao trabalho. Validação considera execuções da versão atual dos casos ativos. Correção considera artefatos e reteste aprovado no ciclo atual quando houve defeito. Evidência presente não significa, sozinha, requisito concluído.'
  ]
};
