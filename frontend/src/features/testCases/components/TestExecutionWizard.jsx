import { useCallback, useEffect, useRef, useState } from 'react';
import { SearchCombobox } from '../../../shared/index.js';
import { testCasesApi } from '../api/test-cases.api.js';
import {
  referenceOption,
  referenceOptionLabel,
  environments,
  LIMITS,
  resultOf,
  stepError,
  executionFormData
} from '../model/test-cases.js';
import { Badge, EvidenceList, EvidencePicker, Field, SelectControl } from './Parts.jsx';

export function TestExecutionWizard({ testCase, onRegister, onCancel, busy, blocked, retest }) {
  const version = testCase;
  const [draft, setDraft] = useState({
    retest: retest
      ? {
          defectId: retest.id,
          correctionCycle: retest.currentCorrectionCycle,
          expectedRevision: retest.revision
        }
      : undefined,
    testCaseId: testCase.id,
    testCaseVersion: testCase.currentVersion,
    testedReference: null,
    environment: '',
    stepResults: version.steps.map((step) => ({
      position: step.position,
      result: '',
      observedResult: '',
      evidences: []
    })),
    evidences: []
  });
  const [position, setPosition] = useState(0);
  const [review, setReview] = useState(false);
  const [errors, setErrors] = useState({});
  const headingRef = useRef(null);
  const panelRef = useRef(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [position, review]);
  const searchReferences = useCallback(
    async (search, signal) =>
      (await testCasesApi.references(testCase.id, search, { signal }, retest?.id)).items.map(
        referenceOption
      ),
    [testCase.id, retest?.id]
  );
  const canRegister = Boolean(
    draft.testedReference &&
    draft.environment &&
    draft.stepResults.every((item) => !stepError(item))
  );
  const step = version.steps[position];
  const result = draft.stepResults[position];
  const executionEvidences = [
    ...draft.evidences,
    ...draft.stepResults.flatMap((item) => item.evidences)
  ];
  function updateResult(patch) {
    setDraft({
      ...draft,
      stepResults: draft.stepResults.map((item, i) =>
        i === position ? { ...item, ...patch } : item
      )
    });
  }
  function validateContext() {
    return {
      ...(!draft.testedReference ? { reference: 'Selecione a versão testada.' } : {}),
      ...(!draft.environment ? { environment: 'Selecione o ambiente.' } : {})
    };
  }
  function next() {
    const found = stepError(result);
    setErrors(found ? { step: found } : {});
    if (found) return;
    if (position === version.steps.length - 1) {
      setReview(true);
      setErrors(validateContext());
    } else setPosition(position + 1);
  }
  function register() {
    const found = validateContext();
    if (draft.stepResults.some((item) => stepError(item)))
      found.step = 'Complete os resultados de todos os passos.';
    setErrors(found);
    if (Object.keys(found).length) {
      queueMicrotask(() => panelRef.current?.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    if (!busy && !blocked) onRegister(executionFormData(draft));
  }
  return (
    <fieldset ref={panelRef} className="tc-form-controls tc-stack" disabled={busy}>
      {retest && (
        <p className="tc-notice">
          Reteste do {retest.displayId} · {testCase.displayId} · {testCase.title}. Detecção
          original: caso v{retest.detection.testCase.version}. Reteste atual: caso v
          {testCase.currentVersion}.
        </p>
      )}
      <section className="tc-surface">
        <div className="tc-context-heading">
          <h3>Contexto da execução</h3>
          <span className="field-help">
            Versão do caso <strong>v{testCase.currentVersion}</strong>
          </span>
        </div>
        <div className="tc-columns">
          <SearchCombobox
            id="exec-reference"
            label="Versão testada"
            required
            placeholder="Pesquisar PR ou commit..."
            onSearch={searchReferences}
            minQueryLength={0}
            openOnFocus={false}
            popoverPlacement="fixed"
            getOptionLabel={referenceOptionLabel}
            disabled={busy}
            selectedOption={draft.testedReference}
            onSelect={(reference) => setDraft({ ...draft, testedReference: reference })}
            onClear={() => setDraft({ ...draft, testedReference: null })}
            error={review && !draft.testedReference ? 'Selecione a versão testada.' : undefined}
            renderOption={(reference) => (
              <span className="tc-candidate">
                <strong>{reference.label}</strong>
                <small>
                  {reference.relatedTaskIds.length
                    ? `Das tarefas relacionadas · ${reference.relatedTaskIds.join(', ')}`
                    : 'Outros artefatos do projeto'}
                </small>
              </span>
            )}
          />
          <Field
            id="exec-environment"
            label="Ambiente *"
            error={review && !draft.environment ? 'Selecione o ambiente.' : undefined}
          >
            <SelectControl
              id="exec-environment"
              value={draft.environment}
              aria-invalid={review && !draft.environment}
              aria-describedby={review && !draft.environment ? 'exec-environment-error' : undefined}
              onChange={(event) => setDraft({ ...draft, environment: event.target.value })}
            >
              <option value="">Selecione o ambiente</option>
              {Object.entries(environments).map(([value, name]) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
            </SelectControl>
          </Field>
        </div>
      </section>
      {review ? (
        <section className="tc-stack tc-execution-summary">
          <h3 tabIndex={-1} ref={headingRef}>
            Resumo da execução
          </h3>
          <dl className="tc-info tc-execution-metrics">
            {[
              ['Passos', version.steps.length],
              ['Aprovados', draft.stepResults.filter((s) => s.result === 'PASS').length],
              ['Falhas', draft.stepResults.filter((s) => s.result === 'FAIL').length],
              ['Bloqueados', draft.stepResults.filter((s) => s.result === 'BLOCKED').length],
              ['Pendentes', draft.stepResults.filter((s) => !s.result).length]
            ].map(([label, count]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{count}</dd>
              </div>
            ))}
          </dl>
          <p>
            Resultado dos passos: <Badge value={resultOf(draft.stepResults)} raw />
          </p>
          {!canRegister && (
            <p role="status" className="tc-notice">
              Contexto incompleto. Selecione a versão testada e o ambiente para registrar a
              execução.
            </p>
          )}
          <p>Versão testada: {draft.testedReference?.label || 'Não selecionada'}</p>
          <p>Ambiente: {environments[draft.environment] || 'Não selecionado'}</p>
          <EvidencePicker
            evidences={draft.evidences}
            executionEvidences={executionEvidences}
            onChange={(evidences) => setDraft({ ...draft, evidences })}
          />
          {draft.stepResults.some((item) => item.evidences.length) && (
            <section className="tc-surface">
              <h3>Evidências por passo</h3>
              {draft.stepResults.map(
                (item, i) =>
                  item.evidences.length > 0 && (
                    <div key={item.position}>
                      <h4>Passo {i + 1}</h4>
                      <EvidenceList evidences={item.evidences} />
                    </div>
                  )
              )}
            </section>
          )}
          <p className="field-help">Evidências: {executionEvidences.length} arquivos</p>
          {errors.step && <p role="alert">{errors.step}</p>}
          <footer className="tc-footer">
            <button
              className="button button-secondary"
              onClick={() => {
                setReview(false);
                setErrors({});
              }}
            >
              Voltar aos passos
            </button>
            <button
              className="button button-primary"
              disabled={!canRegister || busy || blocked}
              onClick={register}
            >
              Registrar execução
            </button>
          </footer>
        </section>
      ) : (
        <>
          <div className="tc-step-indicators" aria-label="Progresso dos passos">
            {draft.stepResults.map((item, i) => (
              <span key={item.position} aria-current={i === position ? 'step' : undefined}>
                <b>{i + 1}</b> <Badge value={item.result || 'PENDING'} />
              </span>
            ))}
          </div>
          <section className="tc-surface tc-execution-step">
            <h3 tabIndex={-1} ref={headingRef} aria-live="polite">
              Passo {position + 1} de {version.steps.length}
            </h3>
            <h4>{step.action}</h4>
            <p>
              <strong>Resultado esperado</strong>
              <br />
              {step.expectedResult}
            </p>
            <fieldset
              className="tc-result-options"
              aria-describedby={errors.step ? 'exec-observed-error' : undefined}
            >
              <legend>Resultado do passo</legend>
              {['PASS', 'FAIL', 'BLOCKED'].map((value) => (
                <button
                  type="button"
                  key={value}
                  className="button button-secondary"
                  aria-pressed={result.result === value}
                  onClick={() => updateResult({ result: value })}
                >
                  <Badge value={value} />
                </button>
              ))}
            </fieldset>
            <Field
              id="exec-observed"
              label={`Resultado observado${['FAIL', 'BLOCKED'].includes(result.result) ? ' *' : ' (opcional)'}`}
              error={errors.step}
            >
              <textarea
                id="exec-observed"
                value={result.observedResult}
                maxLength={LIMITS.observedResult}
                aria-invalid={Boolean(errors.step)}
                aria-describedby={errors.step ? 'exec-observed-error' : undefined}
                onChange={(event) => updateResult({ observedResult: event.target.value })}
              />
            </Field>
            <EvidencePicker
              key={step.position}
              perStep
              evidences={result.evidences}
              executionEvidences={executionEvidences}
              onChange={(evidences) => updateResult({ evidences })}
            />
          </section>
          <footer className="tc-footer">
            <button className="button button-secondary" onClick={onCancel}>
              Cancelar
            </button>
            <button
              className="button button-secondary"
              disabled={position === 0}
              onClick={() => {
                setPosition(position - 1);
                setErrors({});
              }}
            >
              Anterior
            </button>
            <button className="button button-primary" onClick={next}>
              {position === version.steps.length - 1 ? 'Revisar execução' : 'Próximo'}
            </button>
          </footer>
        </>
      )}
    </fieldset>
  );
}
