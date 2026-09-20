import { SprintDialog } from '../../schedule/index.js';
import { ArtifactCategory, taskStatusLabels, TaskTraceabilityGrid } from '../../tasks/index.js';
import { defectSeverities, defectStatuses } from '../../defects/index.js';
import { DescriptionSurface, EntityRow, ErrorState, LoadingState } from '../../../shared/index.js';

const typeLabels = {
  FUNCIONAL: 'Funcional',
  NAO_FUNCIONAL: 'Não funcional',
  REGRA_NEGOCIO: 'Regra de negócio'
};

const statusLabels = {
  PLANEJADO: 'Planejado',
  EM_IMPLEMENTACAO: 'Em implementação',
  EM_VALIDACAO: 'Em validação',
  EM_CORRECAO: 'Em correção',
  CONCLUIDO: 'Concluído',
  CADASTRADO: 'Cadastrado',
  APROVADO: 'Aprovado',
  VALIDADO: 'Validado',
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento',
  CANCELADO: 'Cancelado'
};

function dateTime(value) {
  return value ? new Date(value).toLocaleString('pt-BR') : 'Não informado';
}

function nodesOf(graph, type) {
  return (graph?.nodes || []).filter((node) => node.type === type);
}

function RelationList({ nodes, empty, render }) {
  if (!nodes.length) return <p>{empty}</p>;
  return <div className="task-detail-artifact-list">{nodes.map(render)}</div>;
}

export function RequirementDetails({
  projectId,
  requirement,
  projection,
  graph,
  canWrite,
  busy,
  returnFocusRef,
  onClose,
  onRetry,
  onEdit,
  onDelete,
  onCreateTestCase,
  onOpenGraph
}) {
  const tasks = nodesOf(graph.data, 'TASK');
  const testCases = nodesOf(graph.data, 'TEST_CASE');
  const defects = nodesOf(graph.data, 'DEFECT');
  const fallbackTasks = requirement.tasks || [];
  const taskCount = fallbackTasks.length;
  const status = projection?.requirement?.status || requirement.status;
  const defectCount = graph.data?.summary?.defects.total ?? projection?.defects.total ?? 0;

  return (
    <SprintDialog
      open
      size="large"
      className="requirement-details-dialog"
      title={`REQ-${requirement.id} · ${requirement.title}`}
      description={statusLabels[status] || status}
      busy={busy}
      returnFocusRef={returnFocusRef}
      onClose={onClose}
      headerActions={
        canWrite ? (
          <>
            <button
              type="button"
              className="button button-secondary button-compact"
              disabled={busy}
              onClick={onEdit}
            >
              Editar
            </button>
            <button
              type="button"
              className="button button-danger button-compact"
              disabled={busy}
              onClick={onDelete}
            >
              {busy ? 'Excluindo...' : 'Excluir requisito'}
            </button>
          </>
        ) : undefined
      }
    >
      <div className="requirement-details-stack">
        <DescriptionSurface>{requirement.description}</DescriptionSurface>

        <section className="task-detail-section" aria-labelledby="requirement-information-title">
          <h3 id="requirement-information-title">Informações</h3>
          <dl className="task-detail-grid requirement-information-grid">
            <div>
              <dt>Tipo</dt>
              <dd>{typeLabels[requirement.type] || requirement.type}</dd>
            </div>
            <div>
              <dt>Status macro</dt>
              <dd>
                <span className={`status-badge status-${status.toLowerCase()}`}>
                  {statusLabels[status] || status}
                </span>
              </dd>
            </div>
            <div>
              <dt>Criado em</dt>
              <dd>{dateTime(requirement.createdAt)}</dd>
            </div>
            <div>
              <dt>Atualizado em</dt>
              <dd>{dateTime(requirement.updatedAt)}</dd>
            </div>
          </dl>
        </section>

        <TaskTraceabilityGrid title="Tarefas vinculadas" className="requirement-task-relations">
          <ArtifactCategory label="Tarefas" count={taskCount}>
            <RelationList
              nodes={fallbackTasks.map(
                (task) => tasks.find((node) => node.entityId === task.id) || task
              )}
              empty="Nenhuma tarefa vinculada."
              render={(entry) => {
                const task = entry.data || entry;
                return (
                  <EntityRow
                    key={task.id}
                    identity={`TASK-${task.id}`}
                    title={task.title}
                    to={`/projects/${projectId}/kanban?task=${task.id}`}
                    onClick={onClose}
                  >
                    {taskStatusLabels[task.status] || task.status}
                  </EntityRow>
                );
              }}
            />
          </ArtifactCategory>
        </TaskTraceabilityGrid>

        <button type="button" className="requirement-traceability-action" onClick={onOpenGraph}>
          Ver rastreabilidade completa <span aria-hidden="true">→</span>
        </button>

        {graph.loading && <LoadingState message="Carregando relações do requisito..." />}
        {graph.error && <ErrorState message={graph.error.message} onRetry={onRetry} />}

        <TaskTraceabilityGrid title="Qualidade" className="requirement-quality-relations">
          <ArtifactCategory
            label="Casos de teste"
            count={projection?.validation.testCasesTotal}
            footer={
              canWrite && (
                <button
                  type="button"
                  className="button button-secondary button-compact"
                  onClick={onCreateTestCase}
                >
                  + Criar caso de teste
                </button>
              )
            }
          >
            <RelationList
              nodes={testCases}
              empty="Nenhum caso de teste relacionado."
              render={(node) => (
                <EntityRow
                  key={node.id}
                  identity={node.data.displayId || `TC-${node.entityId}`}
                  title={node.data.title}
                  to={`/projects/${projectId}/test-cases?case=${node.entityId}`}
                  onClick={onClose}
                />
              )}
            />
          </ArtifactCategory>

          <ArtifactCategory label="Defeitos" count={defectCount}>
            <RelationList
              nodes={defects}
              empty="Nenhum defeito relacionado."
              render={(node) => {
                const metadata = [
                  defectSeverities[node.data.severity],
                  defectStatuses[node.data.status] || node.data.status
                ].filter(Boolean);
                return (
                  <EntityRow
                    key={node.id}
                    identity={node.data.displayId || `DEF-${node.entityId}`}
                    title={node.data.title}
                    to={`/projects/${projectId}/defects?defect=${node.entityId}`}
                    onClick={onClose}
                  >
                    {metadata.join(' · ')}
                  </EntityRow>
                );
              }}
            />
          </ArtifactCategory>
        </TaskTraceabilityGrid>
      </div>
    </SprintDialog>
  );
}
