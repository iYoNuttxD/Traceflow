# Project deletion — targeted corrections PD-01…PD-07

Data: 22/09/2026. Resultado local: **PROJECT DELETION FINAL REVIEW TARGETED CORRECTIONS — PASS LOCAL**.
Esta é uma rodada de correção, não a revalidação independente final. Não houve commit/push.

## Baseline e fontes

- Branch `daniel-dev`; HEAD inicial `b3422ec1c9febc4d49cdee26119ef57878e578ea`.
- Working tree inicial limpo; `git diff --check` e `git diff --stat` sem saída.
- Review-base: `PROJECT DELETION FINAL REVIEW — CHANGES REQUIRED` (1 BLOCKING, 5 IMPORTANT,
  1 SUGGESTION). A migration existente era `20260921010000_project_deletion_retention`.
- Node 22.23.2; a CI declara Node 22. Nenhum banco de desenvolvimento foi resetado.
- Consultados: `AUTHORIZATION_MATRIX.md`, `DATA_RETENTION_POLICY.md`,
  `PERSONAL_DATA_INVENTORY.md`, `API_CONTRACTS.md`, `SYSTEM_ARCHITECTURE.md`,
  `DESIGN_SYSTEM.md`, `UI_SURFACE_INVENTORY.md`, `frontend/src/styles/tokens.css` e
  `PROJECT_DELETION_RETENTION_IMPLEMENTATION_REPORT.md`.

## PD-01 — purge concorrente, fencing e storage

**Causa:** a reconciliação global tratava um journal de staging ativo como abandonado; outro
worker podia restaurar os bytes e apagar a única trilha de retry enquanto o primeiro concluía o
delete relacional. O teste determinístico com worker A pausado após staging e worker B em
`processDue` reproduziu `storageRecovered=1` antes da correção.

**Correção:** migration incremental `20260922010000_project_purge_fencing` adiciona
`Project.purgeClaimId` e `ProjectPurgeStorageCleanup.claimToken/claimedAt`, todos nullable, com
índices. A tomada de claim gera UUID; staging/compensação/delete do grafo verificam o token
atual sob lock do Project. Um worker que perdeu o claim não pode restaurar ou finalizar os bytes.
O journal READY é terminal para o delete relacional, mas continua retryable para storage: sua
remoção ocorre somente após `deletePurged` sob lock da linha de journal. A reconciliação global
ignora staging ativo e reclama apenas READY sem dono ou com lease expirado.

**Prova:** teste de integração com MySQL descartável e `LocalTestEvidenceStorage` real: A faz
staging, B executa `processDue`, B não interfere, A remove o arquivo e o journal. Outro teste
simula A abandonado, B assume após o prazo e A antigo não restaura/finaliza. Falha injetada na
remoção física preserva journal para retry, seguido de limpeza bem-sucedida. Os testes de purge
idempotente e deadline permaneceram verdes. Não foi usado sleep.

## PD-02 — autoridade OWNER no ponto de mutation

**Causa:** autorização inicial podia anteceder um rebaixamento/desativação confirmado da
membership. **Correção:** transições de delete, restore e permanent delete adquirem lock de
Project, depois da membership relevante, e revalidam `isActive`/`role=OWNER` na mesma transação
que muda o lifecycle. Update de role, ativação/desativação e transferência de ownership usam a
mesma ordem Project → Membership; aceite de convite também segue essa ordem.

**Prova:** interleavings reais de OWNER→MEMBER e de membership desativada antes de delete,
restore e purge negam a mutation; segundo OWNER ainda consegue atuar. A suíte API mantém
401/403/404 e CSRF. Não há revalidação solta fora da transação.

## PD-03 — sync GitHub após soft delete

**Causa:** `assertActive` antes da chamada de persistência deixava uma janela até o upsert.
**Correção:** `withActiveProjectWrite` toma lock do Project, verifica `deletedAt` e realiza os
writes no mesmo transaction callback. A fronteira cobre branches, commits e vínculos, pull
requests, issues, sugestões de commit e metadados/estados de sync. O orquestrador interrompe o
sync quando o estado inicial ou final não pode mais ser persistido.

**Prova:** MySQL real, com delete confirmado após a leitura ativa e antes do write para cada um
dos quatro importadores: zero novos artefatos. Estados terminais/metadata também não mudam após
delete. Caminhos normais de projeto ativo permaneceram nos testes de sync existentes.

## PD-04 — input de confirmação C2

**Causa:** o campo em `ConfirmDialog` não usava a classe `field` compartilhada e herdava estilo
nativo. **Correção:** aplica a primitive canônica; remove regras CSS redundantes sem criar uma
variante específica para exclusão. Label, texto exato, paste, botão desabilitado, Enter, trap e
retorno de foco permanecem.

**Prova:** teste de regressão falhou antes do ajuste e passou depois. No Chrome, input de soft e
hard delete mediu **45px** em Light/Dark e 1440/1280/1024/768/390px; background, borda, raio,
padding e focus ring seguem os tokens. Não houve overflow horizontal da página. Tab circulou
no diálogo; Escape fechou e retornou ao acionador. A inspeção usou apenas fixture sintética.

## PD-05 — purge confirmado + falha na criação

**Causa:** um único catch/estado tratava duas mutations diferentes como se fossem reversíveis
juntas. **Correção:** valida campos e Installation disponíveis antes do purge; assim que o DELETE
permanent confirma, remove o projeto pendente e sua opção Recuperar, guarda o repo como liberado
e atualiza inclusive um catálogo de repositórios ainda stale. A criação tem tratamento de erro
próprio e uma ação de retry que executa somente POST de criação.

**Prova:** teste purge 200 → POST 503 → retry exige uma única chamada de DELETE e ausência de
Recuperar. Teste adicional exige ausência da opção “programado para exclusão” depois do purge.
Chrome com API artificial exibiu sucesso parcial e somente retry da criação; não houve purge de
projeto persistido na inspeção visual.

## PD-06 — GET antigo/coalescido após mutation

**Causa:** refresh pós-mutation reutilizava um GET iniciado antes do commit, e a resposta antiga
podia republicar o projeto. **Correção:** o provider usa `fresh` para refresh de mutation,
invalida gerações anteriores por request ID e mantém tombstones locais para delete/restore/purge
até observar o estado coerente. Os consumers de delete, restore, hard delete e criação passam a
reconciliar o catálogo; Quick Projects deriva do mesmo provider. No `ProjectEditScreen`, erro de
refresh não reclassifica DELETE confirmado como falha da exclusão.

**Prova:** testes de transporte real do `httpClient` seguram GET coalescido, confirmam a mutation,
emitem GET fresh e soltam a resposta antiga por último. Delete, restore, purge e criação preservam
o estado confirmado; catálogo e Quick Projects não repopulam projeto excluído.

## PD-07 — inventário e documentação

`UI_SURFACE_INVENTORY.md` registra seis surfaces: Danger Zone, confirmação de soft delete,
recovery, pending deletion, confirmação de exclusão definitiva e conflito de repo reservado.
Contagem atualizada para 213 surfaces (27 Projects). Status **TECHNICALLY VERIFIED**; nenhuma
surface foi promovida a `VISUALLY APPROVED`. Arquitetura, relatório original de implementação e
`VISUAL_VALIDATION_LOG.md` documentam o fencing, a guarda transacional de sync e a evidência
renderizada local. Contrato HTTP, retenção de 30 dias e inventário de dados pessoais não mudaram.

## Gates e ambiente

| Gate | Resultado local |
| --- | --- |
| Backend focused lifecycle/authz/concurrency/sync | PASS; MySQL + filesystem reais nos interleavings |
| Backend unit | 785 PASS / 67 arquivos |
| Backend integration/API | 536 PASS, 5 skips legados / 38 arquivos |
| Backend full + coverage | 1.321 PASS, 5 skips legados; statements 90,97%, branches 82,48%, lines 93,55% |
| Frontend focused + transporte HTTP | PASS |
| Frontend full + coverage | 1.215 PASS / 99 arquivos; statements 83,61%, branches 78,23%, lines 86,09% |
| Backend/frontend lint e format:check | PASS |
| Frontend build | PASS; avisos existentes de bundle grande/IIFE |
| Prisma validate/generate/status | PASS; 57 migrations no schema descartável |
| Migrations em schema vazio | PASS; todas aplicadas, schema temporário removido |
| Architecture, secrets, audit policy | PASS; policy 5/5, backend/frontend 0 high/critical |
| `git diff --check` | PASS |

O schema exclusivo `traceflow_pd_fix_20260922_test` foi criado em MySQL localhost após conferir
`NODE_ENV=test`, alvo diferente do banco de desenvolvimento e `read_only=0`. O validador de schema
vazio usou um segundo schema temporário criado e removido pelo script. A migration nova foi
aplicada como upgrade incremental no schema de teste já existente. Nenhum skip novo foi adicionado.

Uma execução intermediária da cobertura, após uma tentativa concorrente interrompida, falhou em
`settings-l2.test.js` porque o helper recebeu `csrfToken` indefinido. O teste isolado passou (1/1),
o arquivo isolado passou (21/21) e a execução integral seguinte, sem outro runner, passou
(1.321/1.321). A origem exata da intermitência não foi demonstrada; ela fica registrada aqui,
sem alteração de teste, retry embutido, timeout, skip ou relaxamento de assertion.

## Visual QA, acessibilidade e limites

Chrome local com fixture artificial: Light/Dark × 1440/1280/1024/768/390 para Danger Zone,
soft/hard confirmation, recovery e repo conflict. Input de 45px, botões principais ≥44px,
sem overflow horizontal, conteúdo e ações legíveis. Estados vazio/correto, disabled, erro parcial,
focus ring, Tab, Escape e retorno de foco foram observados; Enter/Space, confirmação exata e
diálogo aninhado têm testes focados automatizados. O log de validação visual distingue essa prova
local de homologação externa ou certificação WCAG.

Limites remanescentes: MySQL e filesystem continuam sem transação distribuída; falhas de cleanup
dependem do journal e da execução recorrente do job. A janela de stale do claim é de 30 minutos;
monitoramento/agendamento em produção pertence à infraestrutura. Não houve teste sob carga de
produção, CI remoto, browser adicional nem GitHub externo. Esses limites não reabrem PD-01…PD-07;
a próxima etapa é uma revalidação independente do diff e das reproduções.

**Veredicto local:** PD-01…PD-06 corrigidos e PD-07 atualizado; nenhum BLOCKING/IMPORTANT
conhecido nestes findings. **PROJECT DELETION FINAL REVIEW TARGETED CORRECTIONS — PASS LOCAL**.
