export function macroStatus(value) {
  if (['CADASTRADO', 'APROVADO', 'PENDENTE', 'A_FAZER'].includes(value)) return 'PLANEJADO';
  if (value === 'EM_ANDAMENTO') return 'EM_IMPLEMENTACAO';
  if (value === 'VALIDADO') return 'EM_VALIDACAO';
  return value;
}
