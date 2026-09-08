import { Link } from 'react-router';
import { GithubExternalAction } from '../../tasks/index.js';
import { TraceFlowIcon } from '../../../shared/index.js';
import { PersistedEvidence } from './PersistedEvidence.jsx';
import { requirementLabel, taskLabel, environments, referenceLabel } from '../model/test-cases.js';
import { Badge, Latest } from './Parts.jsx';

function Information({ items }) {
  return (
    <dl className="tc-info">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
function Surface({ title, count, children }) {
  return (
    <section className={`tc-surface${count !== undefined ? ' tc-traceability-card' : ''}`}>
      <h3>
        {title}
        {count !== undefined && <span className="tc-count">({count})</span>}
      </h3>
      {children}
    </section>
  );
}
function Steps({ version, execution }) {
  return (
    <ol className="tc-definition">
      {version.steps.map((step, index) => {
        const result = execution?.steps.find((item) => item.position === step.position);
        return (
          <li className="tc-step-result" key={step.position}>
            <header className="tc-step-heading">
              <h4>Passo {index + 1}</h4>
              {result && <Badge value={result.result} raw />}
            </header>
            <div className={result ? 'tc-step-result-content' : undefined}>
              <div className="tc-step-definition">
                <div>
                  <small>Ação</small>
                  <p className="tc-step-action">{result ? result.actionSnapshot : step.action}</p>
                </div>
                <div>
                  <small>Resultado esperado</small>
                  <p>{result ? result.expectedResultSnapshot : step.expectedResult}</p>
                </div>
              </div>
              {result && (
                <div className="tc-step-observed">
                  <small>Resultado observado</small>
                  <p>{result.observedResult || 'Não informado'}</p>
                </div>
              )}
            </div>
            {result && execution.evidence.some((file) => file.executionStepId === result.id) && (
              <div className="tc-step-evidence">
                <h4>Evidências do passo</h4>
                <PersistedEvidence
                  evidence={execution.evidence.filter((file) => file.executionStepId === result.id)}
                />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
export function TestCaseDetails({ testCase, projectId, onView, onCancel }) {
  const latest = testCase.latestExecution;
  const version = testCase;
  return (
    <div className="tc-stack">
      <Surface title="Descrição">
        <p>{testCase.description || 'Sem descrição.'}</p>
      </Surface>
      <section className="tc-section">
        <h3>Informações</h3>
        <Information
          items={[
            ['Status', <Badge key="status" value={testCase.status} />],
            ['Responsável', testCase.responsible.name],
            ['Versão atual', `v${testCase.currentVersion}`],
            ['Criado em', new Date(testCase.createdAt).toLocaleDateString('pt-BR')]
          ]}
        />
      </section>
      <section className="tc-section">
        <h3>Rastreabilidade</h3>
        {!testCase.requirementId && !testCase.tasks.length && <p>Sem rastreabilidade</p>}
        <div className="tc-columns">
          <Surface title="Requisito" count={testCase.requirementId ? 1 : 0}>
            <p>
              {testCase.requirement ? (
                <Link
                  className="tc-entity-link"
                  to={`/projects/${projectId}/requirements`}
                  onClick={onCancel}
                  aria-label={`Abrir ${requirementLabel(testCase.requirement)} em Requisitos`}
                >
                  <TraceFlowIcon name="branch" />
                  {requirementLabel(testCase.requirement)}
                </Link>
              ) : (
                'Sem requisito vinculado'
              )}
            </p>
          </Surface>
          <Surface title="Tarefas" count={testCase.tasks.length}>
            <ul className="tc-selected">
              {testCase.tasks.map((task) => (
                <li key={task.id}>
                  <Link
                    className="tc-entity-link"
                    to={`/projects/${projectId}/tasks`}
                    onClick={onCancel}
                    aria-label={`Abrir ${taskLabel(task)} em Tarefas`}
                  >
                    <TraceFlowIcon name="code" />
                    {taskLabel(task)}
                  </Link>
                </li>
              ))}
            </ul>
            {!testCase.tasks.length && <p>Sem tarefas vinculadas</p>}
          </Surface>
        </div>
      </section>
      <Surface title="Pré-condições">
        <p className="tc-preformatted">{version.preconditions}</p>
      </Surface>
      <section className="tc-section">
        <h3>Passos</h3>
        <Steps version={version} />
      </section>
      <Surface title="Resultado esperado">
        <p>{version.expectedResult}</p>
      </Surface>
      <Surface title="Última execução">
        <Latest execution={latest} />
        {latest && (
          <p>
            {latest.displayId} · {new Date(latest.executedAt).toLocaleString('pt-BR')} ·{' '}
            {latest.executedByDisplayNameSnapshot} · Caso v{latest.testCaseVersion}
          </p>
        )}
        <button className="button button-secondary" onClick={() => onView('history')}>
          Ver histórico
        </button>
      </Surface>
    </div>
  );
}
export function TestExecutionHistory({ executions, onSelect }) {
  return (
    <>
      <p className="field-help">Registros das execuções realizadas para este caso.</p>
      {!executions.length && <p role="status">Este caso nunca foi executado.</p>}
      {executions.map((execution) => (
        <article className="tc-history-row" key={execution.displayId}>
          <div>
            <strong>{execution.displayId}</strong> <Badge value={execution.result} raw />
            <p>
              {new Date(execution.executedAt).toLocaleString('pt-BR')} ·{' '}
              {execution.executedByDisplayNameSnapshot}
            </p>
            <p>
              {environments[execution.environment]} · {referenceLabel(execution.testedReference)} ·
              Caso v{execution.testCaseVersion}
            </p>
          </div>
          <button
            className="button button-secondary"
            aria-label={`Ver execução ${execution.displayId}`}
            onClick={() => onSelect(execution.id)}
          >
            Ver execução
          </button>
        </article>
      ))}
    </>
  );
}
export function ExecutionDetails({ execution }) {
  const version = execution.caseVersionSnapshot;
  return (
    <div className="tc-stack">
      <section className="tc-section">
        <h3>Informações da execução</h3>
        <Information
          items={[
            ['Resultado', <Badge key="result" value={execution.result} raw />],
            ['Executor', execution.executedByDisplayNameSnapshot],
            ['Ambiente', environments[execution.environment]],
            ['Executado em', new Date(execution.executedAt).toLocaleString('pt-BR')],
            ['Versão do caso', `Caso v${execution.testCaseVersion}`]
          ]}
        />
      </section>
      <Surface title="Versão testada">
        <div className="tc-tested-reference">
          <strong>
            {execution.testedReferenceSnapshot.type === 'PULL_REQUEST'
              ? `Pull Request #${execution.testedReferenceSnapshot.number}`
              : execution.testedReferenceSnapshot.shortHash ||
                execution.testedReferenceSnapshot.hash?.slice(0, 7)}
          </strong>
          <p>
            {execution.testedReferenceSnapshot.title || execution.testedReferenceSnapshot.message}
          </p>
          {execution.testedReferenceSnapshot.githubUrl && (
            <GithubExternalAction href={execution.testedReferenceSnapshot.githubUrl} />
          )}
        </div>
      </Surface>
      <Surface title="Pré-condições da versão executada">
        <p className="tc-preformatted">{version.preconditions}</p>
      </Surface>
      <section className="tc-section">
        <h3>Resultados dos passos</h3>
        <Steps version={version} execution={execution} />
      </section>
      <Surface title="Resultado esperado do caso">
        <p>{version.expectedResult}</p>
      </Surface>
      <Surface title="Evidências da execução">
        {!execution.evidence.some((file) => file.executionStepId === null) && (
          <p>Nenhuma evidência anexada.</p>
        )}
        <PersistedEvidence
          evidence={execution.evidence.filter((file) => file.executionStepId === null)}
        />
      </Surface>
    </div>
  );
}
