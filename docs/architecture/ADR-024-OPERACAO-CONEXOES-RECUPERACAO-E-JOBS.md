# ADR-024 — Orçamento de conexões, recuperação, fechamento do cliente e agenda dos jobs

- **Estado:** proposta em 15/10/2026. É a "proposta separada do mecanismo de transações" pedida pela
  revisão independente da PR #26 (condição A01, TF-REV-005 e TF-REV-006). Aguarda o portão G1. A
  homologação em ARM64, HeatWave e TLS é etapa à parte, com autorização própria.
- **Data:** 15/10/2026
- **Responsáveis:** João Vitor S. Hernandes
- **Relação:** revê a operação do [ADR-019](ADR-019-ESPERA-DE-TRAVA.md) e do
  [ADR-020](ADR-020-PRAZO-DAS-TRANSACOES.md), complementa o
  [ADR-017](ADR-017-GITHUB-ASYNC-SYNC.md) (worker) e o agendamento do
  [ADR-016](ADR-016-TASK-NOTIFICATIONS.md) D6 e do [ADR-018](ADR-018-GITHUB-EVENT-NOTIFICATIONS.md) D9

## Contexto

A PR #26 trouxe uma guarda global das transações interativas (ADR-019 e ADR-020) e um cliente Prisma
de recuperação. A revisão independente não aceitou o mecanismo só porque a CI passou. Ela pediu uma
proposta com pool limitado, recuperação, saída do processo e homologação.

Situação no código da PR (head `9c053bf`):
- **Custo por transação.** Toda transação interativa paga duas idas e voltas a mais (`SET` do
  ADR-019 e `SELECT CONNECTION_ID()`).
- **Cliente de recuperação.** É um `PrismaClient` com o pool padrão. Isso dobra o pool potencial de
  cada processo.
- **Encerramento.** O worker não desconecta o cliente de recuperação; o `server.js` desconecta.
- **Pânico do motor.** Só muda `/health/live` e `/health/ready`, e o processo continua de pé.
- **Espera dos `KILL`.** Não tem limite quando o cliente de recuperação não conecta.
- **Fechamento do `prismaClient.js`.** Passou de 2 para 14 arquivos. Inclui `config/env.js`, pelo
  logger. O `env.js` valida a configuração inteira e lança `ConfigurationError` na importação.
- **Jobs.** São scripts em `backend/scripts`, sem agendador instalado.

O que a branch OCI (`origin/daniel-dev`, `cf15522`, lida em 15/10/2026) espera:
- **Diagnóstico** (`deploy/lib/diagnostic_contract.py`).
  - O allowlist exato tem, de `backend/src`, só `database/prismaClient.js` e
    `database/database-safety.js`.
  - O script `validate-oci-heatwave-connection.js` importa o `prismaClient.js` depois de definir
    `NODE_ENV=production` e `DATABASE_URL`. Ele só usa `$queryRawUnsafe`.
- **Release** (`scripts/package_release.py`). Exporta `backend/src/`, `backend/prisma/`,
  `frontend/src/` e `frontend/public/`, e mais uma lista fixa de arquivos. `backend/scripts/` fica
  de fora.
- **Serviços.**
  - `traceflow-api.service` e `traceflow-github-worker.service`: `Type=exec`,
    `Restart=on-failure`, `RestartSec=10s`, no máximo 3 partidas em 300 s, `TimeoutStopSec=90s`.
  - O worker roda `backend/src/github-worker.js`.
- **Ciclo de vida.** O `server.js` da branch OCI tem drenagem (`createLifecycle`), espera de trabalho
  em segundo plano e `SHUTDOWN_TIMEOUT_MS`.
- **Conflitos.** A composição com a PR #26 conflita em `server.js`, `shared/http/health.js`,
  `test/integration/test-database-guard.test.js` e `docs/api/API_CONTRACTS.md`. A composição tem 75
  migrations.

## Decisão proposta

1. **Manter a guarda na PR #26 (D1).** Tirá-la devolve os defeitos que ela corrige:
   - S202-F29: espera de trava derrubando outras requisições;
   - S202-F33: conexão fora de sincronia depois de `P2028`;
   - S203-A01: execução presa em `RUNNING`.
2. **Orçamento de conexões (D2).** Cada processo declara o pool do app e o de recuperação. O total
   fica abaixo do `max_connections` do shape, com reserva.

   | Processo | Pool do app | Recuperação |
   | --- | --- | --- |
   | API | 5 | 1 |
   | Worker (inclui os jobs, D7) | 3 | 1 |
   | Diagnóstico | 1 | — |
   | Reserva para operação | 5 | — |
   | **Total** | **14** | **2** |

   O total é de 16 conexões, contra 24 no cálculo da revisão, porque os jobs não abrem processo
   próprio (D7). Os números finais saem da homologação.
3. **Cliente de recuperação (D3).**
   - A URL ganha `connection_limit=1&pool_timeout=2`.
   - O cliente é criado só quando preciso.
   - Ele é desconectado no encerramento da API, do worker e dos scripts.
4. **Espera dos `KILL` limitada (D4).**
   - O envoltório espera os `KILL QUERY` já enviados por no máximo 2 s.
   - Sem a confirmação, a conexão da transação é tratada como envenenada. O processo marca o motor
     como indisponível e segue para a saída controlada (D5).
5. **Saída controlada (D5).** Vale para o pânico do motor e para a conexão envenenada:
   1. o processo para de aceitar requisições;
   2. drena pelo prazo de encerramento;
   3. desconecta os dois clientes;
   4. termina com código 1.

   O `Restart=on-failure` reinicia o serviço. O worker solta as leases antes de sair. A
   implementação usa o ciclo de vida da branch OCI quando as duas forem compostas. Antes disso, usa
   o encerramento gracioso que já existe.
6. **Fechamento do cliente sem a configuração completa (D6).**
   - **Mudança.** O logger lê `process.env.NODE_ENV`, com o mesmo padrão `development`, em vez de
     importar o `env.js`. A validação do `NODE_ENV` continua no `env.js`, que a API e o worker
     carregam.
   - **Fechamento resultante**, com 8 arquivos:
     - `src/database/prismaClient.js`;
     - `src/database/database-safety.js`;
     - `src/database/transaction-guard.js`;
     - `src/database/lock-wait.js`;
     - `src/database/recovery-prisma.js`;
     - `src/shared/logger/index.js`;
     - `src/shared/logger/logger.js`;
     - `src/shared/logger/redaction.js`.
   - **Teste.** Um teste percorre os imports estáticos e trava a lista.
   - **Para a branch OCI.** O allowlist do diagnóstico ganha os 6 arquivos novos, com manifesto e
     hashes regenerados, dois builds reproduzíveis e smoke ARM64. Isso cabe ao dono da branch OCI.
7. **Agenda dos jobs no worker (D7).**
   - **Tarefas periódicas.** O `github-worker.js` passa a rodar, a cada 15 minutos:
     - o vencimento do RF59 (`notifications:due`);
     - o despacho dos eventos do GitHub (`notifications:github-events`);
     - o despacho dos avisos de inconsistência (ADR-022).
   - **Exclusão.** Cada tarefa tem exclusão por `GET_LOCK('traceflow:job:<nome>', 0)` no MySQL, para
     não rodar duas vezes com mais de uma instância.
   - **Execução.** As tarefas usam o pool do worker, e o `stop()` espera a tarefa em andamento. Falha
     de uma tarefa não derruba as outras nem o agendamento da sincronização.
   - **Artefato.** O código das tarefas fica em `backend/src`, que entra no artefato de runtime. Por
     isso a receita OCI não precisa mudar para os jobs agendados.
8. **Entrypoints manuais (D8).** Ficam em `backend/scripts` e precisam entrar no artefato de
   administração, o que cabe à branch OCI:

   | Comando | Script |
   | --- | --- |
   | `notifications:due` (dry-run) | `notify-overdue-tasks.js` |
   | `notifications:github-events --retry-failed` | `dispatch-github-event-notifications.js` |
   | `traceability:alerts` | `reconcile-traceability-alerts.js` |
   | `notifications:metrics` | o script da métrica |

   Os quatro usam `scripts/lib/database-safety.js`.
9. **Pausa coordenada (D9).** Backup, migration e rollback param o worker, e com ele os jobs. Os
   runbooks dizem isso.
10. **Homologação (D10), em etapa à parte:**
    - `KILL QUERY` entre conexões do mesmo usuário no HeatWave;
    - latência e prazo das transações;
    - corte de rede e saturação do pool;
    - a saída controlada com o `Restart=on-failure`;
    - cadeia completa de migrations em banco vazio;
    - TLS `VERIFY_IDENTITY` com a CA própria.

## Alternativas consideradas

- **Tirar a guarda da PR #26 e mandá-la numa PR própria.** Rejeitada: os três defeitos voltam, e o
  código do S2-02 e do S2-03 depende do cliente de recuperação.
- **Timers do systemd para cada job.** Possível na branch OCI. Exige:
  - os scripts no artefato de runtime;
  - um processo e um pool por execução;
  - a parada dos timers em cada runbook.

  O worker já é um serviço supervisionado, com encerramento gracioso.
- **Cliente diagnóstico mínimo, sem a guarda.** Rejeitada: o diagnóstico deixaria de exercitar o
  cliente que a aplicação usa.
- **Reiniciar por verificação externa da saúde.** Rejeitada: exige um agente a mais, e o `Restart`
  do systemd só age quando o processo termina.

## Consequências positivas

- O pool potencial fica limitado e declarado.
- O processo com o motor em pânico volta sozinho.
- O diagnóstico importa o cliente sem a configuração da aplicação.
- Os jobs passam a rodar sem agendador externo e sem mudar a receita de runtime.

## Consequências negativas

- **Código do Daniel.** O worker, o logger e o encerramento são de outra entrega.
- **Saída controlada.** Derruba as requisições em andamento depois da drenagem. O limite de 3
  partidas em 300 s pode deixar o serviço parado e exigir intervenção.
- **Branch OCI.** Ainda precisa mudar o allowlist, o manifesto e o artefato de administração.

## Impactos de segurança e privacidade

- Não amplia privilégio do banco. O `KILL` age só sobre conexões do mesmo usuário.
- Os logs das tarefas periódicas seguem o padrão dos jobs: contagens e códigos, sem dado pessoal.
