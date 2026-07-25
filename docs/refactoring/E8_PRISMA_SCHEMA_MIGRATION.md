# E8 — Revisão e migração canônica do schema Prisma

## Identificação e estado

- Branch: `daniel-dev`
- Commit inicial desta continuação: `def9c89284c55c4ab892c653b9082d9fb824db25`
- Data: 25/07/2026
- Estado inicial: árvore limpa, branch sincronizada com upstream (`0/0`) e nenhuma alteração local preexistente
- Estado final: **CONCLUÍDA DEFINITIVAMENTE**
- Próxima etapa: E9, não iniciada nesta execução

## Decisão funcional confirmada

A equipe confirmou a cardinalidade do MVP: uma Task pode possuir zero ou uma PullRequest, enquanto uma PullRequest pode atender zero ou várias Tasks. A relação canônica é, portanto, a chave estrangeira opcional `Task.pullRequestId`.

`TaskPullRequest` havia sido introduzida na primeira execução da E8 como expansão conservadora N:N diante da ausência de confirmação funcional. O join não representa o contrato do MVP e foi removido. O endpoint, o corpo JSON e a leitura de Pull Request permanecem singulares. Uma futura relação N:N exigirá novo ADR, migration e mudança contratual explícita.

O [ADR-006](../architecture/ADR-006-CANONICAL-DATA-MODEL.md) registra esta decisão e também formaliza que `Commit`, `PullRequest` e `Issue` substituem `GithubArtifact`, enquanto `Requirement → Task`, `TaskCommit`, `TaskIssue` e `Task.pullRequestId` substituem `TraceLink`.

## Auditoria e critérios de contract

O audit inicial foi executado no MySQL isolado `traceflow_test`, antes do contract:

| Métrica | TaskPullRequest | GithubArtifact | TraceLink |
|---|---:|---:|---:|
| registros totais | 0 | 0 | 0 |
| reconciliados | 0 | 0 | 0 |
| exclusivos | 0 | 0 | 0 |
| conflitos ou ambiguidades | 0 | 0 | 0 |
| órfãos | 0 | 0 | 0 |
| duplicidades | 0 | 0 | 0 |
| consumidores ativos | 0 | 0 | 0 |
| relações dependentes externas | 0 | 0 | 0 |
| removível | sim | sim | sim |

Para Task–PR também foram zero: Tasks com mais de uma PR no join, joins sem FK canônica, joins divergentes da FK e FKs sem join correspondente. Os relatórios contêm somente target sanitizado, contagens, categorias e checksums.

O contract é bloqueado quando existe múltipla PR por Task, divergência join/FK, artifact ambíguo, TraceLink desconhecido, órfão, dado exclusivo, relação dependente ou consumidor de runtime. Nenhum vínculo é escolhido ou descartado automaticamente nessas situações.

## Reconciliação e leitura canônica

Os scripts E8 foram ampliados para auditar as tabelas opcionais antes e depois do contract. Dry-run continua sendo o padrão; `--apply` exige confirmação por ambiente, prefere `TEST_DATABASE_URL`, rejeita target ambíguo, opera transacionalmente e é idempotente.

Regras implementadas:

- join singular preenche `Task.pullRequestId` somente quando a FK está vazia;
- join consistente não gera escrita;
- múltiplas PRs ou join divergente bloqueiam o contract;
- GithubArtifact inequivocamente correspondente não é duplicado;
- Commit somente é convertido quando há `projectId` e `sha` suficientes e únicos;
- TraceLink reconhecido materializa ou confirma a relação específica;
- tipo desconhecido, origem ambígua ou projeto divergente bloqueia o contract.

O dual-write foi removido. Vincular ou desvincular PR agora atualiza exclusivamente `Task.pullRequestId`. As leituras de Tasks, métricas e rastreabilidade usam exclusivamente `Task.pullRequest`; não há fallback, deduplicação ou include do join N:N. As respostas HTTP permanecem singulares e inalteradas.

## Consumers removidos

- `GithubArtifact`: removidos os acessos mortos da autorização, o repository vazio e a página estática sem rota funcional. Os services de sync continuam usando apenas `Commit`, `PullRequest` e `Issue`.
- `TraceLink`: removidos os acessos mortos da autorização. Os vínculos tipados permanecem canônicos.
- `TaskPullRequest`: removidos dual-write, dual-read, includes, mapper e cobertura baseada no join.

Os sete endpoints placeholder permanecem `501`, inclusive os endpoints históricos de GithubArtifact e TraceLink. A descontinuação dos models não implementa esses contratos.

## Migrations contract

Foram criadas migrations novas; nenhuma migration anterior foi editada:

1. `20260725130000_e8_contract_remove_task_pull_request`
2. `20260725131000_e8_contract_remove_github_artifact`
3. `20260725132000_e8_contract_remove_trace_link`

Cada migration possui guard SQL que falha se a respectiva tabela ainda contiver qualquer registro. Após o gate da aplicação, as migrations removem FKs, índices e a tabela legada, preservando Task, PullRequest, Commit, Issue, relações específicas, AuditEvent e PrivacyRequest. Rollback operacional é por roll-forward e restauração de backup, não pela edição de migration aplicada.

## Scripts e comandos

- `npm run e8:audit`: auditoria sanitizada do schema e dos dados;
- `npm run e8:reconcile:dry-run`: plano de reconciliação, sem escrita;
- `npm run e8:reconcile`: aplica apenas reconciliações inequívocas;
- `npm run e8:contract:dry-run`: informa a removibilidade e os motivos de bloqueio;
- `npm run e8:contract`: aplica contract somente se todos os gates forem aprovados.

O architecture check impede a reintrodução desses models no runtime, fallback legado, import de scripts E8 pelo runtime e acesso Prisma fora das áreas autorizadas.

## Validação de migrations e preservação

Foram exercitados dois caminhos reais em bancos temporários isolados:

- instalação do zero com as 23 migrations, seguida de status e auditoria;
- upgrade das 20 migrations da E8 anterior para as três migrations contract, com dados artificiais legados.

No upgrade artificial, TaskPullRequest singular foi reconciliado na FK, GithubArtifact correspondente foi reconhecido e TraceLink Task→Commit materializou TaskCommit. Após o contract permaneceram exatamente uma Task, uma PullRequest, um Commit, um TaskCommit, um AuditEvent e uma PrivacyRequest; as três tabelas legadas deixaram de existir. A segunda execução não encontrou escrita pendente.

Os testes também cobrem banco vazio, múltiplas PRs, divergência join/FK, artifact convertível e ambíguo, TraceLink reconhecido e desconhecido, gate permitido/bloqueado, datasource guard, idempotência e relatório sem PII.

## Registro de segurança operacional

Durante a primeira montagem manual do cenário temporário de upgrade, um processo Node isolado herdou `DATABASE_URL` de desenvolvimento em vez do target temporário. Ele inseriu cinco registros sintéticos com identificadores exclusivos e falhou antes de criar qualquer registro legado. A execução foi interrompida e somente esses cinco registros conhecidos foram removidos por seus marcadores exatos; a verificação confirmou um projeto e um usuário sintéticos removidos, com as dependências sintéticas em cascata. Nenhum schema, migration, registro preexistente ou banco foi resetado.

O cenário foi então repetido com `DATABASE_URL` explicitamente apontando para o banco temporário e passou integralmente. O incidente reforçou o datasource guard dos scripts E8; nenhum relatório contém nome, e-mail, token, descrição, conteúdo de tarefa ou payload GitHub.

## Contratos, privacidade e segurança

- Nenhuma resposta HTTP de sucesso, mensagem, status ou regra de negócio foi alterada.
- Nenhum endpoint `501` foi implementado ou removido.
- Auditoria, anonimização, retenção e solicitações de privacidade continuam preservadas.
- Nenhum model novo, mock de runtime ou dependência foi adicionado.
- O schema final não contém TaskPullRequest, GithubArtifact ou TraceLink.
- Nenhuma E9 foi iniciada.

## Testes, cobertura e auditoria de dependências

Baseline anterior:

- Backend: 77,85% statements; 63,47% branches; 78,99% functions; 80,06% lines.
- Frontend: 15,91% statements; 16,08% branches; 15,75% functions; 15,55% lines.

Resultado final:

- Backend: 21 arquivos, **154 testes** (85 unitários e 69 de integração/API), todos aprovados.
- Cobertura backend: **77,93% statements; 63,53% branches; 79,19% functions; 80,09% lines**.
- Frontend: 10 arquivos, **25 testes**, todos aprovados; build Vite aprovado.
- Cobertura frontend: **15,92% statements; 16,08% branches; 15,78% functions; 15,56% lines**.
- `architecture:check`: aprovado, incluindo fixture que prova o bloqueio de model legado.
- `security:secrets`: aprovado em 194 arquivos. O scanner passou a ignorar somente paths já removidos do worktree, sem reduzir padrões ou excluir arquivos existentes.
- `npm audit` backend: zero vulnerabilidades.
- `npm audit` frontend: duas ocorrências altas do advisory React Router RSC `GHSA-qwww-vcr4-c8h2`, não aplicável ao modo SPA atual e com correção disponível apenas via mudança breaking/force; nenhuma correção automática foi executada.

O build mantém apenas o aviso não bloqueante de chunk principal acima de 500 kB. A cobertura não caiu: todos os quatro indicadores tiveram leve aumento nos dois projetos.

## Limitações e bloqueios para E9

Não restou decisão funcional pendente no schema desta E8. O contract foi aprovado no banco isolado e em cenários artificiais, mas qualquer implantação em ambiente compartilhado deve repetir audit, dry-run e backup/janela operacional sobre uma cópia representativa antes da migration.

Bloqueios para E9: nenhum bloqueio arquitetural da E8, condicionado à revisão humana deste diff e à execução operacional segura no ambiente de destino.
