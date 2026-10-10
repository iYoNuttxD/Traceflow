# ADR-016 — Notificações de tarefa: mudança de status e vencimento de prazo

- **Estado:** aceita para o cartão S2-02 (RF30, RF59)
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
   - **RF30:** o responsável da tarefa no instante da mudança, com membership ativa. **Quem fez a
     mudança não recebe aviso da própria ação.** Isso restringe o texto do RF30, com aval do João.
   - **RF59:** o responsável no momento da varredura, com membership ativa. A fonte é a descrição
     do cartão no roadmap ("notificar responsáveis por mudança de status e atraso"). O responsável
     está entre as "partes envolvidas" da §3.2.8.
   - Tarefa sem responsável não gera notificação.
4. **RF30 nasce na transação da mudança (D4).** `transitionStatus` cria a notificação depois de
   gravar o movimento e o histórico, na mesma transação. Se a inserção falhar, a mudança de status
   também é desfeita. A chave é `TASK_STATUS_CHANGED:movement:<movementId>`.
5. **Corte do vencimento (D5).**
   - A data do prazo é a data UTC do valor gravado.
   - A tarefa vence no início do dia seguinte a essa data, no fuso `APP_TIMEZONE` (padrão
     `America/Sao_Paulo`).
   - Tarefa `CONCLUIDO` não vence.
   - A chave é `TASK_OVERDUE:<taskId>:<data do prazo>`: uma notificação por prazo e por pessoa.
   - Só entram cortes dos últimos `NOTIFICATIONS_DUE_LOOKBACK_DAYS` dias (padrão 7).

   **Exceção à ADR-010 D15.** Aqui vale o dia no fuso de referência, não o dia UTC. O corte em UTC
   avisaria 3 horas antes de a tela marcar a tarefa como atrasada para quem está no Brasil.
6. **Job externo (D6).** `npm run notifications:due` (script `notify-overdue-tasks.js`):
   - dry-run por padrão, `--apply` e `--confirm-production`;
   - deve ser chamado a cada 15 minutos por um agendador externo: timer do `systemd` ou `cron` na
     OCI, com equivalência documentada para a Azure;
   - grava com `INSERT IGNORE` sobre o índice único, então execuções simultâneas não duplicam;
   - informa avaliados, elegíveis, criados, já notificados, excluídos por motivo e falhos;
   - termina com código diferente de zero quando algum projeto falha.
7. **Preferências (D7).** Por usuário e por tipo, ligadas por padrão (sem linha = ligada). Valem no
   instante da criação, sem efeito retroativo. O canal é só a aplicação.
8. **Leitura e contexto (D8).** O link é calculado (`/projects/:id/kanban?task=:taskId`). Se a
   tarefa for excluída, a notificação mantém o título copiado e fica sem link.
9. **Visibilidade (D9).** Só o destinatário vê, e só enquanto tiver membership ativa num projeto
   não excluído. Perder o acesso oculta sem apagar. Id alheio ou oculto responde 404 opaco.
10. **Interface (D12).**
    - Item **Notificações** no menu lateral, com o contador de não lidas.
    - Página `/notifications`.
    - Seção nas Configurações.
    - O contador é consultado ao navegar e a cada 60 s com a aba visível.
11. **Métrica oficial (D16).** O indicador é calculado sobre os eventos elegíveis. As exclusões
    aparecem ao lado, contadas por motivo:
    - por regra: sem responsável, membership inativa, ator igual ao responsável, fora da janela;
    - por escolha: preferência desligada.

    A medição reproduzível são os testes M1 e M2 e a saída do job. O S2-02 não cria tela para o
    indicador.
12. **Contrato HTTP (D17).** Segue o `API_CONTRACTS.md` do repositório. A divergência com o §12 do
    contexto de arquitetura (`/api/v1`, envelope `{data, meta}`, `pageSize`, erro aninhado) fica
    declarada como DR. O ADR de versão e contrato da API é da campanha de conformidade.
13. **Módulo.** `backend/src/modules/notifications/`, como prevê a §9 do contexto de arquitetura.

## Alternativas consideradas

- **Notificar também quem fez a mudança.** Rejeitada: aviso de algo que a pessoa acabou de fazer é
  ruído.
- **Criar a notificação do RF30 depois do commit, fora da transação.** Rejeitada: uma falha entre o
  commit e a inserção perderia o aviso em silêncio, e a métrica deixaria de ser verificável.
- **Corte em UTC (ADR-010 D15).** Rejeitada: divergiria da tela em 3 horas no Brasil.
- **Fuso por usuário.** Rejeitada nesta entrega: não há preferência de fuso no perfil, e a ADR-010
  D15 já aceita um fuso único como limitação.
- **Sem janela de recuperação.** Rejeitada: a primeira execução, ou uma depois de parada longa,
  avisaria de uma vez sobre todo prazo antigo.
- **Scheduler dentro da API (`setInterval`).** Rejeitado: duplica com mais de uma instância e para
  quando a API reinicia.
- **E-mail.** Fora: o SMTP real ainda não foi homologado (S1-02).
- **SSE por usuário.** Fora: a consulta de 60 s atende ao cartão, e o SSE por projeto (ADR-013) não
  serve a um destinatário.
- **Denominador com todos os eventos ocorridos.** Rejeitada: a escolha do usuário ou a falta de
  destinatário derrubaria o indicador sem defeito do sistema.
- **Envelope `{data, meta}` só nas rotas novas.** Rejeitada: duas convenções na mesma API (§6.4 do
  contexto).

## Consequências positivas

- Uma mudança de status elegível nunca fica sem a sua notificação.
- Rodar o job de novo, ou dois ao mesmo tempo, não duplica nada.
- A deduplicação é garantida pelo banco.
- O mesmo modelo de linha por destinatário recebe os eventos de issue e PR do S2-03 sem migration
  nova.
- O job não depende da nuvem: qualquer agendador chama o mesmo comando.

## Consequências negativas

- O aviso de vencimento chega com até 15 minutos de atraso, conforme a frequência do agendador.
- Tarefa vencida há mais de 7 dias quando o job roda pela primeira vez não gera notificação.
- Tarefa sem responsável não avisa ninguém.
- O fuso é único para todo o produto.
- `transitionStatus` faz duas leituras a mais por mudança: a membership e a preferência do
  responsável.
- Até haver agendador instalado (S2-09), o RF59 só roda à mão.

## Impactos de segurança e privacidade

- As seis rotas são do próprio usuário: o destinatário vem da sessão, e nenhum `userId` é aceito do
  cliente.
- Id alheio ou oculto responde 404, igual ao inexistente.
- As mutações exigem CSRF. As leituras entram no limitador autenticado.
- O DTO não traz e-mail, chave de deduplicação nem destinatário. O nome do ator é lido do `User` na
  exibição, então a anonimização se reflete sem cópia.
- **Dados pessoais:**
  - a notificação e a preferência são dados do titular;
  - a anonimização apaga as do titular;
  - a exportação inclui as preferências e as notificações dos projetos com acesso atual, como as
    demais seções da exportação, sem o ator;
  - notificações com mais de 180 dias são apagadas pelo `privacy:retention`.
- Logs do job só com contagens e códigos de erro, sem título, nome ou e-mail. Só a mudança de
  preferências é auditada, com os tipos alterados.
