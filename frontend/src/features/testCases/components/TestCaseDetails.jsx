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
export function TestCaseDetails({ testCase, canWrite, onView, onDelete }) {
  const latest = testCase.latestExecution;
  const version = testCase;
  return (
    <div className="tc-stack">
      {canWrite && (
        <div className="tc-actions">
          <button
            className="button button-primary"
            disabled={testCase.status === 'INATIVO'}
            onClick={() => onView('execute')}
          >
            Executar
          </button>
          <button className="button button-secondary" onClick={() => onView('edit')}>
            Editar
          </button>
          <button className="button button-danger" data-delete-case onClick={onDelete}>
            Excluir caso
          </button>
        </div>
      )}
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
              {testCase.requirement
                ? requirementLabel(testCase.requirement)
                : 'Sem requisito vinculado'}
            </p>
          </Surface>
          <Surface title="Tarefas" count={testCase.tasks.length}>
            <ul className="tc-selected">
              {testCase.tasks.map((task) => (
                <li key={task.id}>{taskLabel(task)}</li>
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
      <p className="field-help">
        Histórico de execuções. Alterações do cadastro e auditoria são conceitos distintos.
      </p>
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
        <h3>{execution.displayId} · Informações da execução</h3>
        <p>{version.title}</p>
        <Information
          items={[
            ['Resultado', <Badge key="result" value={execution.result} raw />],
            ['Executor', execution.executedByDisplayNameSnapshot],
            ['Ambiente', environments[execution.environment]],
            ['Executado em', new Date(execution.executedAt).toLocaleString('pt-BR')],
            ['Versão do caso', `Caso v${execution.testCaseVersion}`],
            ['Versão testada', referenceLabel(execution.testedReferenceSnapshot)]
          ]}
        />
      </section>
      <Surface title="Versão testada">
        <p>{referenceLabel(execution.testedReferenceSnapshot)}</p>
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
