# ADR-016 — Notificações de tarefa: mudança de status e vencimento de prazo

- **Estado:** aceita para o cartão S2-02 (RF30, RF59); revista em 10/10/2026, em 11/10/2026, em
  12/10/2026 (nota do S2-03) e em 15/10/2026 (revisão independente da PR #26)
- **Data:** 09/10/2026
- **Responsáveis:** João Vitor S. Hernandes

## Contexto

O documento oficial do TCC (Somativa 2) pede duas notificações:
- **RF30 (Quadro 3-56):** o usuário responsável é avisado quando a tarefa muda de status.
- **RF59 (Quadro 3-55):** uma notificação é emitida quando a tarefa ultrapassa o prazo. O quadro não
  diz quem recebe.

Os dois quadros têm a mesma métrica: `(notificações enviadas corretamente / total de eventos
ocorridos) × 100`.

O UC07 (Gerenciar Tarefa, fluxo A5) liga as duas coisas: alterar o status registra o histórico e
atualiza as notificações relacionadas. O cartão S2-02 do roadmap acrescenta preferências, leitura,
deduplicação, fuso documentado e um scheduler compatível com a nuvem planejada.

Restrições do terreno:

- `taskMovementRepository.transitionStatus` é o único caminho que muda o status. Ele roda sob
  `lockActiveProject` e grava `TaskMovement` e `TaskHistoryEntry` na mesma transação.
- O prazo é `Task.deadline`. A tela grava só a data, que o servidor converte em meia-noite UTC.
- A tela marca "atrasada" comparando a data UTC do prazo com a data de hoje no fuso do navegador.
- A ADR-010 D15 fixa dia de calendário em UTC para as regras de sprint e marco.
- Não existe scheduler no produto. Os jobs recorrentes (`projects:purge`, `privacy:retention`) são
  scripts com dry-run, chamados de fora.
- O alerta de rastreabilidade (ADR-015) é do projeto, sem destinatário.

## Decisão

1. **A notificação pertence ao destinatário (D1).** Cada linha é de um usuário, ligada ao projeto e
   à tarefa de origem, com estado de leitura (`readAt`).
2. **Dois tipos (D2):** `TASK_STATUS_CHANGED` (RF30) e `TASK_OVERDUE` (RF59). O enum fica aberto
   para o S2-03.
3. **Destinatário (D3).**
   - **RF30:** o responsável da tarefa no instante da mudança, com membership ativa, **inclusive
     quando a mudança foi feita por ele mesmo** (Quadro 3-56). O cartão diz "Você moveu TASK-12
     para Concluído". A preferência continua desligando o tipo.
   - **RF59:** o responsável no momento da varredura, com membership ativa. A fonte é a descrição
     do cartão no roadmap ("notificar responsáveis por mudança de status e atraso"). O responsável
     está entre as "partes envolvidas" da §3.2.8.
   - Tarefa sem responsável não gera notificação. Na métrica, o evento conta como "sem
     destinatário" (D11).
   - Responsável com a conta fora de `ACTIVE` (desativada, com exclusão pendente ou anonimizada)
     não recebe (`INACTIVE_ACCOUNT`). Como a membership, a conta vale no instante da mudança no
     RF30 e no instante da varredura no RF59.
4. **RF30 nasce na transação da mudança (D4).** `transitionStatus` cria a notificação depois de
   gravar o movimento e o histórico, na mesma transação. Se a inserção falhar, a mudança de status
   também é desfeita. A chave é `TASK_STATUS_CHANGED:movement:<movementId>`.
5. **Corte do vencimento (D5).**
   - A data do prazo é a data UTC do valor gravado.
   - A tarefa vence no início do dia seguinte a essa data, no fuso `APP_TIMEZONE` (padrão
     `America/Sao_Paulo`).
   - Tarefa `CONCLUIDO` não vence.
   - A chave é `TASK_OVERDUE:<taskId>:<data do prazo>`: uma notificação por prazo e por pessoa.
   - Não há janela: todo vencimento de tarefa aberta é notificado uma vez, por mais antigo que seja
     o corte (Quadro 3-55). O limite de lotes por execução é vazão, não exclusão.
   - Quando o dia seguinte ao prazo não existe no fuso (Samoa e Tokelau em 30/12/2011, Kwajalein
     em 21/08/1993, Kiritimati em 31/12/1994), o corte é o instante em que o dia do prazo termina:
     o início do primeiro dia local que existe depois dele.

   **Exceção à ADR-010 D15.** Aqui vale o dia no fuso de referência, não o dia UTC. O corte em UTC
   avisaria 3 horas antes de a tela marcar a tarefa como atrasada para quem está no Brasil.

   **Diferença com a tela.** O Kanban marca "Atrasada" pelo fuso do navegador. Para quem está fora
   do fuso de referência, a tela e a notificação discordam por algumas horas (até 17 h em
   `Pacific/Kiritimati`, +14, em relação a `America/Sao_Paulo`). O fuso por usuário é o S202-F07.
6. **Job externo (D6).** `npm run notifications:due` (script `notify-overdue-tasks.js`):
   - dry-run por padrão, `--apply` e `--confirm-production`;
   - deve ser chamado a cada 15 minutos. A forma de agendamento está no ADR-024 (proposto em
     15/10/2026: tarefa periódica do worker do GitHub, com exclusão no banco);
   - grava com `INSERT IGNORE` sobre o índice único, então execuções simultâneas não duplicam;
   - informa avaliados, elegíveis, criados, já notificados, excluídos por motivo e falhos;
   - termina com código diferente de zero quando algum projeto falha.
7. **Preferências (D7).** Por usuário e por tipo, ligadas por padrão (sem linha = ligada). Valem no
   instante da criação, sem efeito retroativo. O canal é só a aplicação.
   - No RF59, a notificação nasce no job, depois do corte. Para não ser retroativa, a preferência
     guarda `enabledAt`, o instante da última passagem de desligada para ligada (nulo se nunca foi
     desligada). Vencimento com corte anterior a `enabledAt` conta como `PREFERENCE_OFF`.
   - O `PUT` de preferências é serializado por usuário e não espera mais que 2 s pelo bloqueio da
     conta. Com outra alteração em andamento, responde 409 `NOTIFICATION_PREFERENCES_BUSY`, e nenhuma
     outra requisição é afetada.
8. **Leitura e contexto (D8).** O link é calculado (`/projects/:id/kanban?task=:taskId`). Se a
   tarefa for excluída, a notificação mantém o título copiado e fica sem link.
   - A central pagina por cursor estável (instante de criação e id do último item). Marcar como
     lida não desloca as páginas seguintes.
   - No filtro Não lidas, o item marcado continua na tela, com o estado de lida, até recarregar:
     assim dá para desfazer.
   - A marcação é por cartão: enquanto um cartão espera a resposta, os outros continuam marcáveis.
9. **Visibilidade (D9).** Só o destinatário vê, e só enquanto tiver membership ativa num projeto
   não excluído. Perder o acesso oculta sem apagar. Id alheio ou oculto responde 404 opaco.
10. **Interface (D12).**
    - Item **Notificações** no menu lateral, com o contador de não lidas. O item abre o painel
      lateral compacto (ADR-022); a rota `/notifications` redireciona e abre o painel.
    - Seção nas Configurações.
    - O contador é um só, o do menu. O painel lê esse contador, e a lista só o informa
      (TF-REV-004 e TF-REV-007).
    - O contador é consultado ao navegar e a cada 60 s com a aba visível.
    - No celular, o botão que abre a navegação mostra um ponto quando há não lidas, e o rótulo
      acessível diz quantas. O ponto continua visível em alto contraste (`forced-colors`).
11. **Métrica oficial (D16).** A cobertura total é a do TCC: `enviadas corretamente / total de
    eventos ocorridos × 100`.
    - Ao lado, por motivo: não enviadas por motivo autorizado (preferência desligada, conta
      restrita, membership inativa), sem destinatário e não observadas.
    - A cobertura elegível desconta as não enviadas por motivo autorizado e as sem destinatário. Ela
      é auxiliar e sempre aparece rotulada como tal.
    - Com evento não observado no período, ou com período sem evento, a cobertura é "indisponível",
      nunca 0 nem 100.
    - Cada decisão do RF30 e do RF59 é gravada em `NotificationDecision`, e o script
      `notifications:metrics` (só leitura) calcula as duas coberturas. O S2-02 não cria tela para o
      indicador.

    A definição completa está em `NOTIFICATION_METRICS.md`.
12. **Contrato HTTP (D17).** Segue o `API_CONTRACTS.md` do repositório. A divergência com o §12 do
    contexto de arquitetura (`/api/v1`, envelope `{data, meta}`, `pageSize`, erro aninhado) fica
    declarada como DR. O ADR de versão e contrato da API é da campanha de conformidade.
13. **Módulo.** `backend/src/modules/notifications/`, como prevê a §9 do contexto de arquitetura.

## Alternativas consideradas

- **Não notificar quem fez a mudança (versão de 09/10/2026).** Rejeitada na revisão de 15/10/2026:
  o Quadro 3-56 não abre exceção. Quem não quer o aviso desliga a preferência.
- **Criar a notificação do RF30 depois do commit, fora da transação.** Rejeitada: uma falha entre o
  commit e a inserção perderia o aviso em silêncio, e a métrica deixaria de ser verificável.
- **Corte em UTC (ADR-010 D15).** Rejeitada: divergiria da tela em 3 horas no Brasil.
- **Fuso por usuário.** Rejeitada nesta entrega: não há preferência de fuso no perfil, e a ADR-010
  D15 já aceita um fuso único como limitação.
- **Janela de recuperação de 7 dias (versão de 09/10/2026).** Rejeitada na revisão de 15/10/2026: o
  Quadro 3-55 não limita a idade do vencimento. O volume da primeira execução é tratado no runbook,
  com o dry-run antes do `--apply`.
- **Scheduler dentro da API (`setInterval`).** Rejeitado: duplica com mais de uma instância e para
  quando a API reinicia.
- **E-mail.** Fora: o SMTP real ainda não foi homologado (S1-02).
- **SSE por usuário.** Fora: a consulta de 60 s atende ao cartão, e o SSE por projeto (ADR-013) não
  serve a um destinatário.
- **Denominador só com os eventos elegíveis (versão de 09/10/2026).** Rejeitada na revisão de
  15/10/2026: tirava do denominador eventos que o TCC conta. O efeito da escolha do usuário fica
  visível na cobertura elegível, rotulada, e nas contagens por motivo.
- **Envelope `{data, meta}` só nas rotas novas.** Rejeitada: duas convenções na mesma API (§6.4 do
  contexto).

## Consequências positivas

- Uma mudança de status elegível nunca fica sem a sua notificação.
- Rodar o job de novo, ou dois ao mesmo tempo, não duplica nada.
- A deduplicação é garantida pelo banco.
- O mesmo modelo de linha por destinatário recebe os eventos de issue e PR do S2-03. Os tipos novos
  do enum e o contexto do artefato exigem migration (revisão de 12/10/2026).
- O job não depende da nuvem: qualquer agendador chama o mesmo comando.
- O custo de "Carregar mais" não cresce com as páginas já exibidas: os cartões já carregados não
  são refeitos.

## Consequências negativas

- O aviso de vencimento chega com até 15 minutos de atraso, conforme a frequência do agendador.
- A primeira execução depois da implantação notifica de uma vez todas as tarefas vencidas e
  abertas.
- O responsável recebe aviso das próprias mudanças de status, a menos que desligue a preferência.
- Tarefa sem responsável não avisa ninguém.
- O fuso é único para todo o produto.
- `transitionStatus` faz duas leituras a mais por mudança: a membership e a preferência do
  responsável.
- Até haver agendador instalado (S2-09), o RF59 só roda à mão.
- No RF30, notificação excluída (conta restrita, membership inativa ou preferência desligada) não
  volta depois.
- No RF59, a conta e a membership valem a cada varredura: reativar a conta ou voltar ao projeto faz
  a varredura seguinte notificar. A preferência é a exceção: religá-la não recupera o vencimento
  anterior (`enabledAt`).

## Impactos de segurança e privacidade

- As seis rotas são do próprio usuário: o destinatário vem da sessão, e nenhum `userId` é aceito do
  cliente.
- Id alheio ou oculto responde 404, igual ao inexistente.
- As mutações exigem CSRF. As leituras entram no limitador autenticado.
- O DTO não traz e-mail, chave de deduplicação nem destinatário. O nome do ator é lido do `User` na
  exibição, então a anonimização se reflete sem cópia.
- **Dados pessoais:**
  - a notificação, a preferência e a decisão (`NotificationDecision`) são dados do titular;
  - a anonimização apaga as notificações e as preferências do titular. Da decisão, apaga só o
    destinatário e mantém o resultado, para a métrica dos períodos passados não mudar;
  - a exportação inclui as preferências e todas as notificações do titular, com `visible` dizendo
    se ele ainda as vê, sem o ator. As outras seções da exportação seguem a convenção "projetos
    com acesso atual";
  - a exportação traz também as decisões do titular;
  - notificações e decisões com mais de 180 dias são apagadas pelo `privacy:retention`.
- Logs do job só com contagens e códigos de erro, sem título, nome ou e-mail. Só a mudança de
  preferências é auditada, com os tipos alterados.

## Revisão de 10/10/2026 — correções da campanha de testes

A campanha de [S2_02_RELATORIO_TESTES.md](../issues/S2_02_RELATORIO_TESTES.md) encontrou 14
achados. As decisões abaixo foram aprovadas pelo João em 10/10/2026 e estão incorporadas no texto
acima.

| Achado | Decisão |
| --- | --- |
| S202-A01 | paginação por cursor estável (D8) |
| S202-A03 | `enabledAt` mantém a regra "sem efeito retroativo" no RF59 (D7) |
| S202-A04 | motivo `INACTIVE_ACCOUNT` (D3, D11) |
| S202-A05 | exportação de todas as notificações do titular, com `visible` (impactos) |
| S202-A06 | definição completa da métrica e aviso sobre as somas (D11) |
| S202-A10, S202-A14 | diferença com a tela e corte em dia inexistente (D5) |

Os outros achados mudam contrato, operação ou documentação sem alterar decisão:
- S202-A02: o `PUT` de preferências é serializado por usuário;
- S202-A08: projeto inexistente no job sai com código 2;
- S202-A09: a regra do `deadline` com hora entra no contrato;
- S202-A12 e S202-A13: código morto e documentação.

## Revisão de 11/10/2026 — correções do reteste

O reteste em [S2_02_RELATORIO_RETESTE.md](../issues/S2_02_RELATORIO_RETESTE.md) encontrou 9
achados. As decisões abaixo foram aprovadas pelo João em 11/10/2026 e estão incorporadas no texto
acima.

| Achado | Decisão |
| --- | --- |
| S202-R01 | o `PUT` de preferências espera o bloqueio da conta por no máximo 2 s (`FOR UPDATE NOWAIT` com nova tentativa) e responde 409 `NOTIFICATION_PREFERENCES_BUSY` (D7) |
| S202-R05 | marcação por cartão escrita na decisão (D8) |
| S202-R08 | o ponto do botão de navegação continua visível em alto contraste (D10) |
| S202-R09 | "Carregar mais" não refaz os cartões já exibidos (consequências) |

Os outros achados mudam contrato, operação ou documentação sem alterar decisão:
- S202-R02: M1 e M2 passam a ter um evento de cada um dos cinco motivos;
- S202-R06: cursor só na forma canônica; frases sobre o relógio da API, o item desmarcado acima do
  cursor, a precedência dos códigos de saída, as exclusões que contam pares já notificados e os dias
  saltados;
- S202-R04 e S202-R07: baseline ASVS e convenção de nome das migrations.

## Revisão de 12/10/2026 — S2-03

A consequência positiva sobre o S2-03 dizia "sem migration nova". No MySQL, os valores novos do enum
`NotificationType` e as colunas do contexto do artefato exigem migration. O texto acima foi corrigido;
a decisão dos eventos de issue e PR está no
[ADR-018](ADR-018-GITHUB-EVENT-NOTIFICATIONS.md).

## Revisão de 15/10/2026 — revisão independente da PR #26

A revisão independente publicada na PR #26 pediu aderência literal ao TCC. O João aprovou as
recomendações em 15/10/2026
([PR26_PROMPT_CORRECOES_REVISAO.md](../issues/PR26_PROMPT_CORRECOES_REVISAO.md), não versionado),
e as decisões estão incorporadas no texto acima:

| Achado | Decisão |
| --- | --- |
| TF-REV-002 | RF30 inclui a mudança feita pelo próprio responsável (D3); RF59 sem janela (D5) |
| TF-REV-002 | métrica com o total de eventos ocorridos, cobertura elegível rotulada e "indisponível" quando falta observação (D11) |
| TF-REV-004, TF-REV-007 | contador único, o do menu (D10) |
| TF-REV-006 | agendamento do job no ADR-024, proposto (D6) |
| TF-REV-008 | painel lateral no lugar da página (D10) |

