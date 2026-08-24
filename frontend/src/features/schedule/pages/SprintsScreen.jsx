import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { scheduleApi } from '../api/schedule.api.js';
import { ProjectSectionNav } from '../../projects/index.js';
import {
  FeedbackRegion,
  LoadingState,
  ErrorState,
  ForbiddenState,
  useAbortableRequest,
  useConfirm
} from '../../../shared/index.js';
import { SprintForm, emptySprintForm, validateSprintForm } from '../components/SprintForm.jsx';
import { SprintList } from '../components/SprintList.jsx';
import { SprintTasksPanel } from '../components/SprintTasksPanel.jsx';
import { SprintProgressPanel } from '../components/SprintProgressPanel.jsx';
import {
  fromDateTimeLocalInput,
  isTerminalTransition,
  sprintTerminalConfirm,
  toDateTimeLocalInput
} from '../components/schedule-display.js';
import { useScheduleData } from '../hooks/useScheduleData.js';

export function SprintsScreen() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  // Uma instância por painel: os dois carregam sob demanda e em paralelo, então
  // compartilhar o controlador faria a abertura de um cancelar a carga do outro.
  const sprintTasksRequest = useAbortableRequest();
  const progressRequest = useAbortableRequest();
  // A seleção vigente no momento em que a resposta chega. Abrir A e logo B fazia
  // a resposta lenta de A sobrescrever B: a tela mostrava B com as tarefas de A,
  // e salvar enviava esses IDs para B — alterando o recurso errado.
  const selectedSprintRef = useRef(null);
  const progressSprintRef = useRef(null);

  const {
    project,
    schedule,
    sprints,
    milestones,
    setSprints,
    somenteLeitura,
    loading,
    forbidden,
    error,
    success,
    loadAll,
    refreshSchedule,
    refreshSprints,
    refreshMilestones,
    feedback,
    handleFailure
  } = useScheduleData(projectId);

  const [sprintForm, setSprintForm] = useState(emptySprintForm);
  const [sprintErrors, setSprintErrors] = useState({});
  const [editingSprintId, setEditingSprintId] = useState(null);

  const [selectedSprint, setSelectedSprint] = useState(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [projectTasks, setProjectTasks] = useState([]);
  // Composição registrada na sprint, com o contexto da participação. Vem da API
  // e não do cruzamento com as tarefas do projeto: numa sprint encerrada a
  // tarefa pode já ter seguido adiante, e o registro daqui não muda por isso.
  const [sprintTasks, setSprintTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [progressSprint, setProgressSprint] = useState(null);
  const [progress, setProgress] = useState(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busySprintId, setBusySprintId] = useState(null);

  // Nome por id para o painel dizer de QUAL sprint a tarefa sairia. A tarefa só
  // carrega `sprintId`; sem o mapa a origem seria um número sem significado.
  const sprintNames = useMemo(
    () => Object.fromEntries(sprints.map((item) => [item.id, item.name])),
    [sprints]
  );
  const milestoneNames = useMemo(
    () => Object.fromEntries(milestones.map((item) => [item.id, item.title])),
    [milestones]
  );
  // Composição por sprint, indexada. O agregado já traz tarefas e pontos; cruzar
  // isso na renderização de cada item custaria uma varredura por linha.
  const scheduleById = useMemo(
    () => Object.fromEntries((schedule?.sprints || []).map((item) => [item.id, item])),
    [schedule]
  );
  const activeSprint = useMemo(
    () => sprints.find((item) => item.status === 'EM_ANDAMENTO') || null,
    [sprints]
  );

  const submitSprint = async (event) => {
    event.preventDefault();
    const errors = validateSprintForm(sprintForm, { editing: Boolean(editingSprintId) });
    setSprintErrors(errors);
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    try {
      // O campo fala no fuso local; a API fala em instante. Converter aqui é o
      // que faz "14/08 às 18h" chegar como o instante que o usuário quis dizer.
      const payload = {
        name: sprintForm.name.trim(),
        objective: sprintForm.objective.trim() || null,
        startDate: fromDateTimeLocalInput(sprintForm.startDate),
        endDate: fromDateTimeLocalInput(sprintForm.endDate),
        // Vazio na edição significa desvincular; na criação o `validate` acima já
        // barrou, então nunca chega null aqui.
        milestoneId: sprintForm.milestoneId ? Number(sprintForm.milestoneId) : null
      };
      if (editingSprintId) {
        await scheduleApi.updateSprint(editingSprintId, payload);
        feedback('Sprint atualizada com sucesso.');
      } else {
        await scheduleApi.createSprint(projectId, payload);
        feedback('Sprint cadastrada com sucesso.');
      }
      setSprintForm(emptySprintForm);
      setEditingSprintId(null);
      // Mexer em sprint nao altera marcos nem o projeto: rebusca apenas os dois
      // conjuntos afetados, em paralelo.
      await Promise.all([refreshSprints(), refreshSchedule()]);
    } catch (requestError) {
      handleFailure(requestError, 'Não foi possível salvar a sprint.');
    } finally {
      setSubmitting(false);
    }
  };

  const editSprint = (sprint) => {
    setEditingSprintId(sprint.id);
    setSprintErrors({});
    setSprintForm({
      name: sprint.name || '',
      objective: sprint.objective || '',
      // `.slice(0, 10)` destruía a hora ao abrir a edição: salvar em seguida
      // gravava meia-noite por cima do instante escolhido.
      startDate: toDateTimeLocalInput(sprint.startDate),
      endDate: toDateTimeLocalInput(sprint.endDate),
      // O <select> compara por string: um id numérico não casaria com o value
      // das opções e o campo abriria vazio numa sprint que já tem marco.
      milestoneId: sprint.milestoneId ? String(sprint.milestoneId) : ''
    });
  };

  const changeSprintStatus = async (sprint, status) => {
    // CONCLUIDA e CANCELADA são terminais: não há transição de volta. Um clique
    // sem aviso deixaria a sprint travada para edição e para novas tarefas.
    if (isTerminalTransition(status)) {
      // A contagem sai do agregado, que é o mesmo número que o backend vai usar
      // para devolver as tarefas ao backlog. Prometer "nenhuma" e devolver três
      // seria pior do que não avisar.
      const pendentes = (scheduleById[sprint.id]?.tasks || []).filter(
        (task) => task.status !== 'CONCLUIDO'
      ).length;
      const confirmed = await confirm(sprintTerminalConfirm(sprint, status, pendentes));
      if (!confirmed) return;
    }

    setBusySprintId(sprint.id);
    try {
      // A resposta ja traz a sprint atualizada: aplica no estado local em vez de
      // rebuscar a lista inteira.
      const { data } = await scheduleApi.updateSprintStatus(sprint.id, status);
      setSprints((current) => current.map((item) => (item.id === sprint.id ? data.sprint : item)));
      if (selectedSprint?.id === sprint.id) setSelectedSprint(data.sprint);
      feedback(data.message);
      // O encerramento pode ter devolvido tarefas ao backlog e concluído o marco:
      // os dois conjuntos precisam ser relidos, não só o agregado.
      await Promise.all([
        refreshSchedule(),
        data.milestoneCompleted ? refreshMilestones() : Promise.resolve()
      ]);
    } catch (requestError) {
      handleFailure(requestError, 'Não foi possível atualizar o status da sprint.');
    } finally {
      setBusySprintId(null);
    }
  };

  const selectSprint = async (sprint) => {
    if (selectedSprint?.id === sprint.id) {
      selectedSprintRef.current = null;
      sprintTasksRequest.cancel();
      setSelectedSprint(null);
      return;
    }
    selectedSprintRef.current = sprint.id;
    setSelectedSprint(sprint);
    // O painel monta antes da resposta chegar. Sem limpar a seleção da sprint anterior
    // e sem sinalizar carga, ele exibiria as marcações da sprint errada e o botão
    // salvaria uma lista vazia — esvaziando a sprint recém-aberta.
    setSelectedTaskIds([]);
    setSprintTasks([]);
    setTasksLoading(true);
    try {
      // As tarefas do projeto so sao necessarias aqui, entao sao buscadas ao abrir
      // o painel e nao na carga inicial da tela.
      const resultado = await sprintTasksRequest.run(async (signal) => {
        const [projeto, daSprint] = await Promise.all([
          projectTasks.length ? null : scheduleApi.listProjectTasks(projectId, { signal }),
          scheduleApi.listSprintTasks(sprint.id, { signal })
        ]);
        return { projeto, daSprint };
      });
      // `run` já descarta resposta abortada; a guarda cobre a janela em que a
      // requisição anterior resolveu antes de o cancelamento chegar ao axios.
      if (!resultado || selectedSprintRef.current !== sprint.id) return;
      if (resultado.projeto) setProjectTasks(resultado.projeto.data.tasks || []);
      const tarefas = resultado.daSprint.data.tasks || [];
      setSprintTasks(tarefas);
      setSelectedTaskIds(tarefas.map((task) => task.id));
    } catch (requestError) {
      if (selectedSprintRef.current !== sprint.id) return;
      // Fechar o painel: mantê-lo aberto deixaria uma afirmação sobre o conteúdo da
      // sprint ao lado da mensagem de erro que diz não ter conseguido lê-lo.
      selectedSprintRef.current = null;
      setSelectedSprint(null);
      handleFailure(requestError, 'Não foi possível carregar as tarefas da sprint.');
    } finally {
      // Desligar o indicador da requisição errada é o mesmo bug com outra roupa.
      if (selectedSprintRef.current === sprint.id) setTasksLoading(false);
    }
  };

  const showProgress = async (sprint) => {
    if (progressSprint?.id === sprint.id) {
      progressSprintRef.current = null;
      progressRequest.cancel();
      setProgressSprint(null);
      setProgress(null);
      return;
    }
    // Mesma disciplina do painel de tarefas: limpar o resultado anterior e
    // sinalizar carga, para a tela nunca afirmar um numero da sprint errada.
    progressSprintRef.current = sprint.id;
    setProgressSprint(sprint);
    setProgress(null);
    setProgressLoading(true);
    try {
      const resposta = await progressRequest.run((signal) =>
        scheduleApi.getSprintProgress(sprint.id, { signal })
      );
      if (!resposta || progressSprintRef.current !== sprint.id) return;
      setProgress(resposta.data);
    } catch (requestError) {
      if (progressSprintRef.current !== sprint.id) return;
      progressSprintRef.current = null;
      setProgressSprint(null);
      handleFailure(requestError, 'Não foi possível calcular a evolução da sprint.');
    } finally {
      if (progressSprintRef.current === sprint.id) setProgressLoading(false);
    }
  };

  const submitSprintTasks = async (taskIds) => {
    // A sprint alvo é congelada no início da operação. `selectedSprint` é estado
    // de render: ao voltar do servidor ele já pode ser outra sprint, e aplicar a
    // resposta de A no painel de B fazia o salvamento seguinte enviar os IDs de A
    // para B — alterando o recurso errado.
    const sprintId = selectedSprint.id;
    const sprintName = selectedSprint.name;
    setSubmitting(true);
    try {
      // A mutação NÃO é abortada quando o usuário troca de sprint: cancelar um PUT
      // em voo deixaria o servidor num estado que a tela não sabe qual é. O que se
      // descarta é o resultado.
      await scheduleApi.replaceSprintTasks(sprintId, taskIds);
      // Nomear a sprint no aviso: sem isso, "tarefas atualizadas" aparece enquanto
      // a tela já mostra outra, e o usuário lê como se fosse sobre esta.
      feedback(`Tarefas da sprint "${sprintName}" atualizadas com sucesso.`);
      await refreshSchedule();
      if (selectedSprintRef.current !== sprintId) return;

      // Rebusca em vez de confiar no que foi enviado: `addedAfterStart` e a
      // origem do carry-over são decididos no servidor, e o painel precisa
      // sinalizá-los logo após salvar.
      const resultado = await sprintTasksRequest.run((signal) =>
        scheduleApi.listSprintTasks(sprintId, { signal })
      );
      if (!resultado || selectedSprintRef.current !== sprintId) return;
      const tarefas = resultado.data.tasks || [];
      setSprintTasks(tarefas);
      setSelectedTaskIds(tarefas.map((task) => task.id));
    } catch (requestError) {
      if (selectedSprintRef.current !== sprintId) return;
      handleFailure(requestError, 'Não foi possível atualizar as tarefas da sprint.');
    } finally {
      setSubmitting(false);
    }
  };

  // O filtro do quadro viaja pela URL, e não por estado global: assim o link é
  // compartilhável e sobrevive a um recarregamento.
  const viewInKanban = (sprint) => navigate(`/projects/${projectId}/kanban?sprint=${sprint.id}`);

  if (loading) {
    return (
      <main className="page-container">
        <LoadingState message="Carregando sprints..." />
      </main>
    );
  }

  if (forbidden) {
    return (
      <main className="page-container">
        <ForbiddenState message="Você não possui acesso ao cronograma deste projeto." />
      </main>
    );
  }

  if (error && !sprints.length) {
    return (
      <main className="page-container">
        <ErrorState message={error} onRetry={() => loadAll()} />
      </main>
    );
  }

  const concluidas = sprints.filter((item) => item.status === 'CONCLUIDA').length;

  return (
    <main className="page-container">
      <header className="page-header">
        <div>
          <span className="eyebrow">Planejamento</span>
          <h1>Sprints{project ? ` — ${project.name}` : ''}</h1>
          <p>
            Planeje, inicie e conclua sprints. Apenas uma sprint pode estar em andamento por vez.
          </p>
        </div>
        <ProjectSectionNav projectId={projectId} activeSection="sprints" />
      </header>
      <FeedbackRegion error={error} success={success} />

      <div className="schedule-columns">
        <section className="card">
          <div className="schedule-card-header">
            <h2>Sprints do projeto</h2>
            <span className="agenda-window">
              {sprints.length} {sprints.length === 1 ? 'sprint' : 'sprints'} · {concluidas}{' '}
              {concluidas === 1 ? 'concluída' : 'concluídas'}
            </span>
          </div>

          <SprintList
            sprints={sprints}
            scheduleById={scheduleById}
            milestoneNames={milestoneNames}
            selectedSprintId={selectedSprint?.id}
            busySprintId={busySprintId}
            progressSprintId={progressSprint?.id ?? null}
            activeSprintName={activeSprint?.name || ''}
            readOnly={somenteLeitura}
            onSelect={selectSprint}
            onShowProgress={showProgress}
            onEdit={editSprint}
            onChangeStatus={changeSprintStatus}
            onViewInKanban={viewInKanban}
          />
          {progressSprint && (
            <SprintProgressPanel
              sprint={progressSprint}
              progress={progress}
              loading={progressLoading}
              onClose={() => {
                progressSprintRef.current = null;
                progressRequest.cancel();
                setProgressSprint(null);
                setProgress(null);
              }}
            />
          )}
          {selectedSprint && (
            <SprintTasksPanel
              sprint={selectedSprint}
              tasks={projectTasks}
              sprintTasks={sprintTasks}
              selectedTaskIds={selectedTaskIds}
              sprintNames={sprintNames}
              loading={tasksLoading}
              submitting={submitting}
              readOnly={somenteLeitura}
              onSubmit={submitSprintTasks}
              onCancel={() => {
                selectedSprintRef.current = null;
                sprintTasksRequest.cancel();
                setSelectedSprint(null);
              }}
            />
          )}
        </section>

        {/* VIEWER não recebe formulário: o cadastro inteiro é uma ação que ele
            não tem. Consultar sprints e evolução continua disponível. */}
        {!somenteLeitura && (
          <section className="card">
            <h2>{editingSprintId ? 'Editar sprint' : 'Cadastrar sprint'}</h2>
            <SprintForm
              formData={sprintForm}
              milestones={milestones}
              errors={sprintErrors}
              editing={Boolean(editingSprintId)}
              submitting={submitting}
              onChange={(field, value) => setSprintForm({ ...sprintForm, [field]: value })}
              onSubmit={submitSprint}
              onCancel={() => {
                setEditingSprintId(null);
                setSprintForm(emptySprintForm);
                setSprintErrors({});
              }}
            />
          </section>
        )}
      </div>
    </main>
  );
}
