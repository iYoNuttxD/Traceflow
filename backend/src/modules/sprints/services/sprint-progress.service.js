// Evolucao por sprint (RF35). Coordena as consultas e delega os calculos aos
// modulos puros; nenhuma regra de percentual ou de geometria mora aqui.
import { sprintRepository } from '../repositories/sprint.repository.js';
import { buildSprintProgress } from '../sprint.progress.calculator.js';
import { buildSprintBurndown } from '../sprint.burndown.calculator.js';
import { parseSprintId } from '../sprint.schema.js';
import { ensureSprintExists } from './sprint-crud.service.js';

export const sprintProgressService = {
  async getSprintProgress(sprintId) {
    const id = parseSprintId(sprintId);
    const sprint = await ensureSprintExists(id);

    // O instante de corte e capturado UMA vez e injetado nos dois calculos, que
    // permanecem puros e deterministicos. Em sprint encerrada ele nem e usado:
    // o corte passa a ser o encerramento. Um `new Date()` por calculo deixaria
    // evolucao e burndown falando de instantes diferentes na mesma resposta.
    const cutoff = new Date();
    const [participations, burndownData] = await Promise.all([
      sprintRepository.findParticipationsBySprint(id),
      sprintRepository.findBurndownDataBySprint(sprint)
    ]);

    return {
      ...buildSprintProgress({ sprint, participations, cutoff }),
      // Bloco embutido, e nao endpoint proprio: o painel do Kanban exibe os dois
      // juntos, e separa-los custaria uma segunda ida ao servidor por sprint.
      burndown: buildSprintBurndown({ sprint, participations: burndownData, cutoff })
    };
  }
};
