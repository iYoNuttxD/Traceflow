# TRACEFLOW S1-07 — TARGETED CORRECTIONS RESULT

**TARGETED CORRECTIONS — LOCAL PASS**

## Escopo e baseline

Execução local em 2026-09-08, branch `daniel-dev`, HEAD `13582d644b7df68caa1f945d2a557d5bc974563d`. A PR #20 tinha esse mesmo head na consulta ao GitHub. O working tree inicial continha somente os dois relatórios não rastreados `docs/qa/S1_07_FINAL_INTEGRATED_QA.md` e `docs/qa/S1_07_TARGETED_CORRECTIONS_PROMPT.md`. Ambos foram preservados por SHA-256. Nenhum commit, push, merge, rebase, reset, clean ou stash foi executado.

Esta correção cobre exclusivamente QA-S107-001, determinismo do harness frontend e memória limitada em `prepare()`. O FAIL do QA histórico continua válido para aquela execução; este registro não o reescreve.

## P0-A — QA-S107-001

A falha foi confirmada nos logs reais de [Backend Tests da PR #20](https://github.com/iYoNuttxD/Traceflow/actions/runs/34185746653/job/101933605669): a aplicação usava o fallback de desenvolvimento, mas asserts/cleanup acessavam uma variável de storage ausente. Não se repetiu deliberadamente um upload no storage de desenvolvimento para reproduzir o dano.

O owner canônico em `backend/test/helpers/test-evidence-environment.js` cria diretórios únicos com `mkdtemp`, `tmpdir` e `realpath`. O setup Vitest executa antes dos imports de cada arquivo. Runtime, asserts e cleanup usam o mesmo root. Um diretório fornecido pelo operador nunca é adotado como storage de teste. O marker tem token aleatório e o cleanup valida configuração, caminho absoluto, parentesco e realpath/marker antes de remover apenas o owner criado pela execução.

O setup global mantém ownership da execução, incluindo diretórios de suites inteiramente skipped, nas quais `afterAll` não roda. Cada suite/worker recebe um subdiretório único; não há compartilhamento do storage mutável. Os testes cobrem bootstrap em processo novo sem variável manual, igualdade com o singleton real, owners distintos, recusa por marker/configuração modificada e sentinel externo preservado após upload inválido e cleanup.

O CI define `TMPDIR` em um step anterior aos testes, escrevendo o valor de `$RUNNER_TEMP` em `$GITHUB_ENV`. Unit, integration e coverage herdam esse ambiente e usam o mesmo bootstrap; nenhum timeout, gate ou skip foi removido. O fallback real de development/production permanece inalterado. O schema local usado foi `traceflow_s107_fix_7b3900bc1b_test`, criado exclusivamente para esta execução a partir de um TEST_DATABASE_URL validado, distinto do banco de desenvolvimento.

A primeira versão desta correção colocou `runner.temp` no `env` do job, onde o contexto `runner` não está disponível. O erro foi identificado após a validação local e corrigido no step descrito acima. Os checks locais de YAML/Prettier e policy estrutural não validavam a disponibilidade de contextos do GitHub Actions; o PASS desses checks não constituía validação semântica completa das expressões da workflow.

Development storage touched: **NO**. Os arquivos preexistentes em `backend/.data/test-evidence` são verificados por hash e inventário antes/depois.

## P0-B — Frontend CI determinism

O log real de [Frontend Tests da PR #20](https://github.com/iYoNuttxD/Traceflow/actions/runs/34185746653/job/101933605544) confirma falha no primeiro teste de `TestCases.test.jsx`, em `setup()`/`findByRole`, com `Carregando página...` ainda no DOM. No baseline local, o comando completo `npm run test:coverage` passou com 898 testes em 21,89 s: a falha não reapareceu nessa execução local.

O harness iniciava o polling da asserção antes de resolver o import lazy frio de `TestCasesPage`. A transformação/instrumentação do módulo e de suas dependências concorria com a janela de espera do DOM. O log do CI comprova o boundary pendente; a atribuição do maior custo ao ambiente concorrente/instrumentado é uma explicação coerente com o código e a diferença de tempos, não um benchmark isolado de CPU.

A correção aguarda o import real no harness antes de renderizar, e usa `await act(async ...)` para concluir a renderização assíncrona. Mantém AppRoutes, lazyNamed, Suspense, ProjectsCatalogProvider e a rota real. O teste novo controla uma promise do catálogo de projetos: confirma o loading real e nenhuma chamada ao catálogo de casos antes de resolver o contexto, e depois confirma o artigo TC-15. Não foram adicionados mocks de rota/layout/Suspense, timeouts maiores, sleeps ou retries. Não há evidência que exija mudança de produto frontend.

As dez execuções do arquivo são processos Vitest separados com V8 coverage habilitado. Os thresholds globais são desativados somente nesse comando focado, pois ele não executa toda a aplicação; o coverage completo mantém todos os thresholds canônicos intactos. Não há retry automático.

## P1 — Evidence memory hardening

Antes: `handle.readFile()` alocava o arquivo completo, inclusive vídeos de até 50 MiB, para assinatura e SHA-256.

Agora: `prepare()` abre o mesmo descriptor com O_NOFOLLOW, valida stat/arquivo regular/tamanho recebido e usa detecção por tokenizer de acesso aleatório do file-type 22.0.2. Cada leitura de assinatura é limitada a 65.536 bytes; metadados podem ser saltados por posição sem alocação proporcional ao tamanho do arquivo. Isso preserva a distinção PNG/APNG mesmo com metadados maiores que um prefixo fixo. Não se reabre um pathname durante a validação.

SHA-256 é incremental em um buffer reutilizável de 65.536 bytes, com offsets explícitos. Esse é o limite do buffer de dados controlado pela aplicação, não uma alegação de RSS total: file-type/Node possuem estruturas e buffers internos adicionais. Não há buffer proporcional ao tamanho do vídeo no caminho binário, nem medição frágil de GC/RSS.

TXT/LOG/JSON mantêm validação integral de UTF-8, conteúdo ativo e JSON, limitada pelo fileBytes atual (máximo 10 MiB), verificado antes de readFile. Não houve dependência nova. Quotas, filenames, keys, staging, promoção, cleanup, stream de conteúdo e API pública são preservados.

Testes geram cabeçalhos e filler de 2 MiB para PNG/JPG/WEBP/MP4/WEBM/MOV/PDF, comparam SHA com o full buffer de referência e bloqueiam readFile durante prepare binário. Também verificam limite de leitura, assinaturas falsas, APNG com metadados longos e regressões textuais. Não há fixture grande versionada.

## Limites e próximo passo

Validação local não equivale ao CI remoto Linux/MySQL 8.4.8. Não houve nova execução remota, pois commit/push não foram autorizados. S1-08 Defeitos e S1-09 expansão global de rastreabilidade não foram implementados. Domínio S1-07, schema, migrations, API pública e UX frontend permanecem inalterados.

Após LOCAL PASS, commit/push e novo CI da PR #20 continuam dependentes de autorização. Somente os cinco jobs remotos verdes podem fechar o S1-07.

## Resultados finais dos gates

| Gate                                         | Resultado                                             |
| -------------------------------------------- | ----------------------------------------------------- |
| Backend focused canônico, sem storage manual | 133 PASS / 5 arquivos                                 |
| Backend storage isolado                      | 50 PASS                                               |
| Backend unit                                 | 647 PASS / 57 arquivos                                |
| Backend integration canônico                 | 434 PASS / 29 arquivos; 5 skips em 2 arquivos legados |
| Backend coverage completo                    | 1.081 PASS + 5 skips em cada uma das 5 execuções      |
| Frontend focused instrumentado               | 36 PASS em cada uma das 10 execuções                  |
| Frontend full                                | 899 PASS / 75 arquivos                                |
| Frontend coverage completo                   | 899 PASS / 75 arquivos                                |
| Frontend build                               | PASS                                                  |
| Backend e frontend lint/format               | PASS                                                  |
| Architecture / secrets / Prisma validate     | PASS                                                  |
| Workflow YAML format/syntax e policy         | PASS                                                  |
| Testes de policy CI + audit                  | 12 PASS                                               |
| Supply chain backend e frontend              | PASS; 0 high, 0 critical, 0 exceções utilizadas       |

Nenhum skip novo. Os 5 skips são os legados de E6/E11 para schema pré-LR.2. Todas as cinco rodadas finais ocorreram depois do ajuste de global teardown. As cinco rodadas preliminares também passaram nos testes, mas não substituem a evidência final do cleanup.

### Frontend repeatability

| Run | Resultado        | Tempo do processo |
| --- | ---------------- | ----------------- |
| 1   | PASS — 36 testes | 13.553 s          |
| 2   | PASS — 36 testes | 13.748 s          |
| 3   | PASS — 36 testes | 14.029 s          |
| 4   | PASS — 36 testes | 14.105 s          |
| 5   | PASS — 36 testes | 14.125 s          |
| 6   | PASS — 36 testes | 14.830 s          |
| 7   | PASS — 36 testes | 14.292 s          |
| 8   | PASS — 36 testes | 14.214 s          |
| 9   | PASS — 36 testes | 14.294 s          |
| 10  | PASS — 36 testes | 14.236 s          |

### Backend coverage repeatability

| Run | Resultado                             | Tempo do processo |
| --- | ------------------------------------- | ----------------- |
| 1   | PASS — 1.081 testes + 5 skips legados | 56.875 s          |
| 2   | PASS — 1.081 testes + 5 skips legados | 57.014 s          |
| 3   | PASS — 1.081 testes + 5 skips legados | 56.850 s          |
| 4   | PASS — 1.081 testes + 5 skips legados | 57.472 s          |
| 5   | PASS — 1.081 testes + 5 skips legados | 66.440 s          |

### Coverage final

| Área     | Statements | Branches | Functions | Lines  |
| -------- | ---------- | -------- | --------- | ------ |
| Backend  | 90.62%     | 80.47%   | 94.34%    | 93.09% |
| Frontend | 82.18%     | 76.43%   | 78.2%     | 84.36% |

Runtime local: Node 22.23.2, MySQL 9.7.1. O schema exclusivo foi removido e sua ausência foi verificada em INFORMATION_SCHEMA. Nenhum owner temporário de storage desta execução permaneceu. Os dois arquivos preexistentes de evidência de desenvolvimento permaneceram intactos, sem arquivos adicionais.

## Arquivos da correção

- `.github/workflows/ci.yml`
- `backend/vitest.config.js`
- `backend/test/global-setup.js`
- `backend/test/setup.js`
- `backend/test/helpers/test-evidence-environment.js`
- `backend/test/unit/test-cases/evidence-environment.test.js`
- `backend/test/api/test-cases-s1-07.test.js`
- `backend/src/modules/testCases/storage/local-test-evidence.storage.js`
- `backend/src/modules/testCases/storage/test-evidence.validation.js`
- `backend/test/unit/test-cases/storage.test.js`
- `frontend/test/testCases/TestCases.test.jsx`
- `docs/qa/S1_07_TARGETED_CORRECTIONS_RESULT.md`

## Git final e preservação

HEAD permanece `13582d644b7df68caa1f945d2a557d5bc974563d`, branch `daniel-dev`. `git diff --check`: PASS. O working tree contém somente as correções listadas e os dois relatórios não rastreados que já existiam. Domínio S1-07 inalterado: YES. Schema/migration/API/UX alterados: NO. NO COMMIT / NO PUSH / NO MERGE / NO REBASE / NO RESET.

## Evidência de execução

Logs e manifests locais estão em `/private/tmp/traceflow-s107-corrections/`; são artefatos temporários, não necessários ao runtime. As contagens e decisões acima ficam preservadas neste relatório mesmo após a limpeza desses logs.

- [frontend-repeat.json](/private/tmp/traceflow-s107-corrections/frontend-repeat.json)
- [frontend-gates.json](/private/tmp/traceflow-s107-corrections/frontend-gates.json)
- [backend-gates.json](/private/tmp/traceflow-s107-corrections/backend-gates.json)
- [preservation.json](/private/tmp/traceflow-s107-corrections/preservation.json)
- [database-cleanup.json](/private/tmp/traceflow-s107-corrections/database-cleanup.json)
- [ci-failures.log](/private/tmp/traceflow-s107-corrections/ci-failures.log)

## Expectativa para o CI remoto

Backend Tests deve passar a integration e executar o coverage com storage próprio em runner.temp. Frontend Tests deve concluir coverage e alcançar o build, sem corrida entre o import lazy frio e a asserção inicial. Essa expectativa ainda requer confirmação no próximo CI remoto. Quality, Backend Tests, Frontend Tests, Supply Chain e Dependency Review precisam ficar verdes antes do encerramento S1-07.
