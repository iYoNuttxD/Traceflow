# Matriz de conformidade — `TRACEFLOW_CONTEXTO_ARQUITETURA.md` (anexo)

Parte B da campanha v2 de erros e inconsistências (Fase 2, 14/10/2026), no commit `7952b01`. Uma linha
por regra das §6 a §18 e da §20 do anexo (blob `589af2b`). Os vereditos admitidos são `CONFORME`,
`NÃO CONFORME`, `DIRETRIZ FUTURA` e `NÃO VERIFICÁVEL LOCALMENTE`. Os achados (CF-nn) e as reproduções
estão em `docs/issues/CONFORMIDADE_RELATORIO.md`.

## Resumo

| Veredito | Regras |
|---|---:|
| CONFORME | 12 |
| NÃO CONFORME | 21 |
| NÃO VERIFICÁVEL LOCALMENTE | 3 |
| **Total** | **36** |

Verificações estáticas novas, todas verdes, em `backend/test/conformance/architecture-rules.test.js`:
ARQ-02, ARQ-06 (Octokit), ARQ-09, ARQ-19 e ARQ-23.

## Matriz

| ID | § | Regra (paráfrase) | Veredito | Evidência | Divergência | Achado |
|---|---|---|---|---|---|---|
| ARQ-01 | 6.1 | fluxo vertical completo por RF | CONFORME | a matriz técnica marca como `PARCIAL` os RFs incompletos (RF15–RF18, RF36, RF43–RF46, RF54, RF62–RF64); nenhum RF dado como implementado sem alguma camada | — | contradições de rótulo ficam na ARQ-36 |
| ARQ-02 | 6.2, 18.5–18.6 | nenhum mock ou integração simulada em produção | CONFORME | `architecture-rules.test.js` (zero ocorrências); provider `capture` recusado em produção (`backend/src/config/env.js:183-187`) | — | — |
| ARQ-03 | 6.3 | commits e PRs mencionam os RFs | NÃO CONFORME | 91 dos últimos 200 commits sem RF, cartão nem fase; 47 deles são `feat:` | — | CF-26 |
| ARQ-04 | 6.4, 18.11 | schema só muda com migration | NÃO VERIFICÁVEL LOCALMENTE | gate de drift na CI (`db:test:validate-schema-drift`); recusado localmente (⚑9) | — | dono: CI da PR; carimbos repetidos na ARQ-36 |
| ARQ-05 | 7 | stack oficial; dependência nova justificada | NÃO CONFORME | `elkjs` citado só num relatório de entrega do S1-09, sem justificativa nem ADR; `vite` e `@vitejs/plugin-react` em `dependencies`; `react-router` 8 no lugar de `react-router-dom` (fusão dos pacotes) | DL para o roteador | CF-27 |
| ARQ-06 | 8.1, 18.8 | Prisma só em repository; Octokit só em client | NÃO CONFORME | `architecture:check` verde; Octokit restrito ao módulo GitHub (teste novo); mas `backend/src/shared/maintenance/*.js` e `backend/src/shared/http/health.js` usam o Prisma fora de repository, e o check não cobre services, helpers e jobs | — | CF-28 |
| ARQ-07 | 8, 10.2 | cliente externo com timeout e erro normalizado | NÃO CONFORME | `@octokit/request` 9.2.4 ignora `request.timeout` (K11); a troca OAuth segue redirect (K9); SMTP sem timeouts explícitos | — | CF-08 |
| ARQ-08 | 9 | organização por domínio | NÃO CONFORME | sem `users`, `alerts`, `comments` e `reports`; alertas em `traceability`, comentários em `tasks`; `docs/architecture/MODULE_CONVENTIONS.md` não registra a escolha | DR | CF-29 |
| ARQ-09 | 10.2, 18.9 | Octokit nunca no frontend | CONFORME | `architecture-rules.test.js` | — | — |
| ARQ-10 | 10.3 | vínculo com tipo, origem, autor, evidência e verificação | NÃO CONFORME | `TaskCommit` e `TaskIssue` só com ids e `createdAt`; `TestCaseTask` sem `createdAt`; PR como FK simples em `Task`; autoria só no `AuditEvent` | — | CF-30 |
| ARQ-11 | 11.1 | estado limitado como enum ou validação centralizada consistente | NÃO CONFORME | 31 campos de estado como `String`; a lista de status da tarefa existe em dois lugares (`backend/src/modules/tasks/task.schema.js:4` e `backend/src/modules/tasks/task.validation.js:14`) | — | CF-31 |
| ARQ-12 | 11 | política de exclusão explícita em cada FK | NÃO CONFORME | 10 de 132 relações sem `onDelete` | — | CF-32 |
| ARQ-13 | 11 | seed sem dado real e fora de produção | CONFORME | `backend/scripts/auth-visual-fixtures.js` força o ambiente de teste | — | — |
| ARQ-14 | 12.1 | base `/api/v1` | NÃO CONFORME | tudo em `/api` (`backend/src/app.js:199`); divergência declarada em `docs/api/API_CONTRACTS.md:2143-2147` sem ADR | DR | CF-33 |
| ARQ-15 | 12.1–12.2 | envelope `{data, meta}` e paginação de coleções | NÃO CONFORME | sem envelope; 12 coleções sem paginação (tarefas, requisitos, projetos, commits, PRs, issues, membros, convites, sprints, marcos, artefatos, quadro Kanban) | DR | CF-33 |
| ARQ-16 | 12.3 | erro `{error: {code, message, details, requestId}}` | NÃO CONFORME | corpo plano; `code` e `requestId` omitidos no `DomainError` (`backend/src/shared/errors/app-error.js`); 503 `PROJECT_WRITE_BUSY` sem código | DR | CF-33 |
| ARQ-17 | 12.4 | status HTTP consistentes | NÃO CONFORME | 24 rotas DELETE: 8 com 204 e 16 com 200 e corpo | — | CF-34 |
| ARQ-18 | 13.1 | matriz ASVS mantida | CONFORME | `docs/security/ASVS_5_0_L1_L2_MATRIX.md` desde o commit `28d99d1`, com teste de completude | — | baseline desatualizada: CF-24 |
| ARQ-19 | 13.2 | validação de entrada e SQL parametrizado | CONFORME | 187 de 208 rotas com `validateRequest`; as 21 sem ele não leem corpo nem query; `Unsafe` só em 3 pontos (teste novo) | — | — |
| ARQ-20 | 13.3 | senha forte, sem enumeração, com limitação | NÃO CONFORME | só 15 senhas comuns (CF-03); enumeração por tempo a confirmar na H14 | — | CF-03 |
| ARQ-21 | 13.4 | sessão segura e revogável | CONFORME | token de 256 bits guardado com hash; cookie `HttpOnly`, `SameSite`, `Secure` em produção; logout invalida no servidor (`backend/test/api/auth-authorization.test.js`) | — | lacunas do ASVS: CF-01, CF-02, CF-04 |
| ARQ-22 | 13.5 | autorização negada por padrão em toda rota de projeto | CONFORME | testes de BOLA, matriz de papéis e IDs opacos (`backend/test/api/lr1-authorization-hardening.test.js`) | — | a varredura completa é a H09 (Fase 4) |
| ARQ-23 | 13.6 | credenciais GitHub não persistidas | CONFORME | só hashes e `claimToken` interno no schema (teste novo) | DL (D-ARQ-04) | — |
| ARQ-24 | 13.7 | CORS explícito e headers de segurança | CONFORME | `backend/test/conformance/asvs-http.test.js`; `backend/test/unit/security.test.js` | — | cabeçalhos do SPA: S2-09 |
| ARQ-25 | 13.8 | configuração validada, limites e timeouts | NÃO CONFORME | `server.js` sem `requestTimeout`, `headersTimeout` e `keepAliveTimeout`; limitador montado em rota inexistente (K13); `DEACTIVATED_ACCOUNT_RETENTION_DAYS` lido e nunca usado; logger sem nível mínimo; frontend sem `.env.example` | — | CF-35 |
| ARQ-26 | 13.9 | log estruturado sem segredo e auditoria de eventos sensíveis | CONFORME | auditoria de login, senha, papéis, convites, vínculos, CRUD de projeto, requisito, tarefa, sprint e marco, sincronização e exportação; redaction no logger | — | falha de autorização só no log da aplicação (Parte A, V16.3.2) |
| ARQ-27 | 13.10 | erro genérico ao cliente, detalhe no servidor; lote com criados, atualizados, ignorados e erros | NÃO CONFORME | 500 sem stack e com mensagem genérica no log (K10); o resumo da sincronização não informa ignorados nem itens com erro | — | CF-11, CF-36 |
| ARQ-28 | 14 | LGPD: inventário, retenção, direitos e aviso de privacidade | NÃO CONFORME | a interface não mostra aviso de privacidade (só `docs/privacy/PRIVACY_NOTICE_DRAFT.md`); o inventário de dados pessoais cobre a exportação de notificações sem nomear os arquivos (K15, refutado em parte) | — | CF-25 |
| ARQ-29 | 15 | pirâmide de testes com E2E | NÃO CONFORME | sem E2E de navegador; o checklist do S1-01 tirou o E2E sem decisão (D-RM-03) | DX | CF-37 |
| ARQ-30 | 16.1 | CI com gates bloqueantes e permissões mínimas | CONFORME | `scripts/validate-ci.test.mjs`; `contents: read`; actions fixadas por versão principal, como pede o anexo | — | sem execução manual (`workflow_dispatch`), que o anexo pede só "quando necessária" |
| ARQ-31 | 16.2 | proteção da branch principal | NÃO VERIFICÁVEL LOCALMENTE | leitura por `gh api` recusada (⚑9) | — | dono: João |
| ARQ-32 | 17.3 | PR com RFs, problema, migrations, impactos e testes | NÃO VERIFICÁVEL LOCALMENTE | as PRs estão no GitHub (leitura recusada); não há template de PR nem CODEOWNERS no repositório | — | dono: João |
| ARQ-33 | 17.4 | DoD por entrega | NÃO CONFORME | nas entregas recentes (S2-01, S2-02, S2-03 e a junção) a CI nunca rodou, não há E2E e a matriz técnica se contradiz (K16); o detalhe por cartão está na Parte C | — | CF-37, CF-40 |
| ARQ-34 | 18 (anexo) | 17 regras para agentes de IA | NÃO CONFORME | regra 4: RF37 e RF57 do §5 do anexo sem linha na matriz técnica; regra 12: E2E ausente (ARQ-29); regras 2, 3, 5 a 11 e 13 a 16 cobertas pelas ARQ acima; regra 17 cumprida pela campanha | DX (D-ARQ-06) | CF-38 |
| ARQ-35 | 20 | ADR com nove campos e numeração única | NÃO CONFORME | ADR-009, ADR-010 e ADR-011 duplicados; só 8 de 23 com os nove campos; sem ADR de implantação nem de versão e contrato da API | — | CF-39 |
| ARQ-36 | 3, 18.15 | documentação viva coerente entre si e com o código | NÃO CONFORME | K12, K14, K16, K17, K19, K20 e K24 confirmados (relatório, seção 5.3) | — | CF-40 |
