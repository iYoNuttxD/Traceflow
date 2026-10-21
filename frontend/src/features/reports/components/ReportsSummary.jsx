import { SummaryPanel } from '../../../shared/index.js';
import { formatDateTime } from '../../indicators/index.js';

// Mesmo painel de resumo das outras abas. Os números são do projeto inteiro: os filtros da
// lista não alteram o resumo.
export function ReportsSummary({ summary, loading }) {
  const latest = summary?.latestSucceeded;
  const metrics = [
    {
      label: 'Total',
      value: summary?.total,
      detail: summary?.total === 1 ? 'relatório gerado' : 'relatórios gerados'
    },
    { label: 'Prontos', value: summary?.succeeded, detail: 'Disponíveis para baixar em PDF' },
    {
      label: 'Em geração',
      value: summary?.active,
      detail: summary?.active ? 'Na fila ou gerando agora' : 'Nenhuma geração ativa'
    },
    {
      label: 'Com falha',
      value: summary?.failed,
      detail: 'Removidos 180 dias após a falha'
    },
    {
      label: 'Último relatório pronto',
      value: latest ? formatDateTime(latest.finishedAt) : summary ? 'Nenhum' : undefined,
      detail: latest ? `Relatório #${latest.id}` : 'Gere um relatório para começar'
    }
  ];
  return (
    <SummaryPanel
      label="Resumo dos relatórios"
      title="Visão geral dos relatórios"
      description="Retratos do planejamento, da rastreabilidade e dos indicadores do projeto."
      metrics={metrics}
      busy={loading}
    />
  );
}
