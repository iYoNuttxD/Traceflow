# E8 — Revisão e migração canônica do schema Prisma

## Identificação e estado

- Branch: `daniel-dev`
- Commit inicial: `b4c682f22413c9ce6177e8d9997c462d0118e4f2`
- Data: 25/07/2026
- Estado inicial: árvore limpa, sincronizada com upstream (`0/0`) e sem alterações preexistentes
- Estado: **CONCLUÍDA**, limitada à fase expand/backfill/switch compatível. Contract destrutivo não foi executado e E9 não foi iniciada.

## Fontes e inventário

Foram revisados schema, 17 migrations E0–E7, repositories/services, testes, frontend, contratos, ADRs E6/E7, inventários de privacidade e documentos oficiais disponíveis. `TRACEFLOW_MAPEAMENTO_REFATORACAO.md` não está versionado e foi lido em `Downloads`. O PDF/Capítulo 3 do TCC não existe neste checkout; cardinalidades não explícitas foram mantidas ou expandidas sem contract.

O inventário completo está em `docs/data/E8_SCHEMA_INVENTORY.md`. O banco `traceflow_test` estava vazio no diagnóstico: 21 models com volume zero; produção/ambiente compartilhado não foi consultado e permanece `NÃO CONFIRMADO`.

## Modelo canônico e duplicações

O ADR-006 define:

- artefatos: `Commit`, `PullRequest`, `Issue` canônicos; `GithubArtifact` legado ativo;
- vínculos: `TaskCommit`, `TaskIssue`, `TaskPullRequest` canônicos; `TraceLink` legado/placeholder;
- equipe: `ProjectMembership` canônico; `ProjectMember` legado;
- autoria: `responsibleUserId` e `movedByUserId` canônicos, textos como fallback;
- GitHub: repository ID/fullName/URL/default branch como identidade/configuração canônica; aliases preservados;
- estados históricos permanecem strings até auditoria de dados reais; enums estáveis E6/E7 permanecem.

`Sprint`, `Comment`, `Notification`, `Alert`, `Indicator`, `Report`, `TestCase`, `Defect` e `GithubSyncRun` não foram inventados nesta etapa.

## Migrations

1. `20260725120000_e8_expand_task_pull_request`: cria `TaskPullRequest`, unique `(taskId,pullRequestId)`, índices nos dois sentidos, ator opcional e FKs Cascade/SetNull.
2. `20260725121000_e8_indexes_and_constraints`: adiciona índices guiados pelas queries em Project, Membership, Requirement, Task, Movement, artefatos e legados; explicita Project→Requirement como Cascade.
3. `20260725122000_e8_remove_redundant_indexes`: remove índices simples já cobertos pelo prefixo de unique/índice composto, reduzindo custo de escrita sem perder os caminhos consultados.

Nenhum `DROP TABLE`, `DROP COLUMN`, reset ou remoção de model foi criado. Rollback é roll-forward: corrigir/adicionar nova migration; a origem legada permanece disponível.

## Backfill e reconciliação

Scripts:

- `npm run e8:audit`: contagens, checksums, correspondência de artifacts e lacunas de joins;
- `npm run e8:reconcile:dry-run`: plano sem escrita;
- `npm run e8:reconcile`: apply protegido e transacional.

Dry-run é padrão. O target prefere `TEST_DATABASE_URL`; apply em desenvolvimento exige `--confirm-development` e produção exige `--confirm-production`. Saída contém somente target sanitizado, contagens, checksums e categorias de conflito. `--report` usa criação exclusiva e não sobrescreve arquivo.

O reconciliador:

- reutiliza o backfill E6 de ProjectMember→ProjectMembership;
- preenche campos GitHub canônicos sem apagar aliases;
- resolve responsável/movedBy somente por identidade única e ativa;
- copia `Task.pullRequestId` para TaskPullRequest;
- materializa TraceLink suportado no join/FK tipado quando o projeto coincide;
- classifica GithubArtifact, mas não cria artefato específico a partir de dados insuficientes;
- preserva todos os registros legados.

Nos cenários artificiais, apply criou 1 join PR, resolveu 1 responsável e 1 movimento, preencheu 1 projeto e materializou 1 TaskCommit. A segunda execução apresentou zero pendências; nenhuma duplicidade, conflito, órfão ou perda foi observada. O relatório verificável está em `docs/data/E8_RECONCILIATION_REPORT.md`.

## Dual-read, dual-write e repositories

O endpoint singular de PR foi preservado. `taskRepository.updateTaskPullRequest` grava FK legada e join canônico na mesma transação; desvinculação remove ambos. Leituras de Tasks e Traceability preferem `Task.pullRequest` e usam o primeiro join canônico como fallback, removendo internals do JSON. A cobertura de PR considera qualquer representação. Excluir Task remove joins, não PullRequest.

Não há dual-write para GithubArtifact/TraceLink/ProjectMember. Os repositories de sync continuam usando os models específicos. Nenhuma resposta HTTP de sucesso ou erro foi alterada.

## Enums, timestamps, cascatas, índices e constraints

- ProjectRole/auditoria/privacidade permanecem enums por estabilidade comprovada.
- Project/Requirement/Task/GitHub permanecem strings para preservar valores históricos desconhecidos.
- timestamps locais usam UTC/Prisma; timestamps GitHub continuam separados; nenhum timestamp ornamental foi adicionado.
- join Task–PR usa Cascade nos joins e SetNull no ator; Task delete preserva PR.
- Project→Requirement agora explicita Cascade, coerente com o agregado e com o futuro delete de projeto ainda 501.
- same-project, membership ativa e transições continuam invariantes de service/transação; FK simples não expressa essas igualdades.

## Arquitetura, privacidade e segurança

O verificador ganhou regras `mapper-no-database`, `reconciliation-no-controller` e `schema-no-service`, com fixtures controladas. Runtime continua impedido de importar scripts operacionais. Reports não contêm nome, e-mail, token, URL com credencial ou conteúdo de artifact. Auditoria, anonimização e retenção E7 não foram alteradas.

## Testes e cobertura

Baseline confirmado: backend 141 testes, 77,80% statements, 63,28% branches, 78,96% functions e 80,01% lines; frontend 25 testes e baseline E7 15,91/16,08/15,75/15,55.

Foram adicionados testes para mapping/deduplicação/checksum, papel legado, responsible/movedBy, ProjectMember→Membership, datasource guard, dry-run/apply/idempotência, backfill artificial, TraceLink, GithubArtifact, cascata do join e preservação do artefato.

Resultado final: **151 backend** (85 unitários e 66 integração/API) e **25 frontend**, total 176. Backend: 77,85% statements, 63,47% branches, 78,99% functions e 80,06% lines. Frontend permaneceu em 15,91/16,08/15,75/15,55. `architecture:check`, scanner de 193 arquivos, as 20 migrations em upgrade e banco vazio, Prisma validate/generate, audit/reconcile idempotente, todas as suítes e build Vite foram aprovados.

`npm audit` backend: zero vulnerabilidades. Frontend: duas ocorrências altas do mesmo advisory React Router RSC (`GHSA-qwww-vcr4-c8h2`), já conhecido, não aplicável ao modo SPA utilizado e com correção disponível apenas por mudança breaking/force; nenhuma atualização automática foi executada. O build mantém o aviso não bloqueante de chunk principal acima de 500 kB.

## Contract futuro, limitações e E9

`docs/data/E8_CONTRACT_PLAN.md` condiciona cada remoção a zero pendências, consumers migrados, checksums equivalentes e migration separada. Limitações:

- não houve acesso a cópia de produção nem estimativa de volume/lock;
- TCC/diagramas não estavam disponíveis para confirmar cardinalidade N:N como contrato funcional;
- `GithubArtifact` sem correspondente e TraceLink desconhecido exigem decisão manual;
- contratos ainda são singulares para PR;
- campos GitHub e atores textuais permanecem por compatibilidade;
- migration foi validada localmente em MySQL de teste; deploy real exige backup/janela/monitoramento.

E9 pode iniciar após revisão humana das migrations e execução do audit/dry-run em cópia representativa. A E8 não implementou sync, paginação, endpoints 501 nem refatoração de domínio E9.
