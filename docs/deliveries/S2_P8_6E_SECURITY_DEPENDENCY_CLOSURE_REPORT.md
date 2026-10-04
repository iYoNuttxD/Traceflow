# S2 P8.6E — Security Dependency Closure

Data: **04/10/2026**, America/Sao_Paulo. Escopo: eliminar a cadeia vulnerável de desenvolvimento e preservar o workflow local.

## 1. Baseline

| Item | Valor |
| --- | --- |
| Branch | `daniel-dev` |
| HEAD | `0073cf46cd6f8b4007e15552945bce4e4fccd5f8` |
| Working tree inicial | limpo |
| `git diff --check` inicial | PASS |
| Node dos comandos e gates | `v22.23.3` |
| npm | `10.9.9` |
| Plataforma do smoke | macOS / arm64 |

Baseline consultado novamente nesta rodada; o HEAD difere do início da P8.6D. As entregas anteriores já estavam no checkout. Nenhum commit, push ou operação de integração Git foi realizado.

Evidências transitórias: `/private/tmp/traceflow-p86e-20261004/`, incluindo `baseline.json`, árvores, audits, `lockfile-impact.json`, `database-preflight.json`, `dev-smoke.json` e logs dos gates. Nenhuma credencial foi incluída nesses registros.

## 2. Advisory

[GHSA-vfj7-8cjw-p6xm / CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): HIGH, esgotamento de pilha ao processar padrões profundamente aninhados em `braces <=3.0.3`. Na consulta de 04/10/2026, o advisory não listava versão corrigida. A decisão foi eliminar a dependência de desenvolvimento que trazia essa cadeia.

## 3. Dependency chain before

Árvore instalada, confirmada por `npm ls nodemon chokidar braces --all --json` no backend:

```text
traceflow-backend@0.1.0
└── nodemon@3.1.14
    └── chokidar@3.6.0
        └── braces@3.0.3
```

`npm audit --json` completo: **3 high, 8 moderate, 0 critical**, código 1. As três entradas high eram `braces`, `chokidar` e `nodemon`, propagadas do mesmo advisory.

## 4. nodemon usage audit

Busca no repositório, incluindo arquivos ocultos e excluindo Git/dependências/artefatos gerados:

- `backend/package.json`: somente `dev: nodemon src/server.js` e a devDependency `^3.0.0`.
- `backend/package-lock.json`: declaração e pacotes transitivos dessa instalação.
- Documentação: relatórios P8.6C/P8.6D, log de validação visual e registro de riscos, como evidência histórica.
- README, CI, código de domínio e demais scripts: nenhum uso direto de nodemon. O script raiz `dev:backend` delega a `npm run dev --prefix backend`.

Não foi encontrada configuração `nodemon.json`, hook específico ou dependência funcional de runtime. O comando público `npm run dev` continua igual.

## 5. Node 22 watch validation

Antes da remoção, `PORT=4317 node --watch src/server.js` foi executado em terminal interativo, com Node 22.23.3 e configuração local carregada pelo `dotenv` existente.

Verificado: startup Express, processo ativo, `/health/ready` HTTP 200 com `SELECT 1` via Prisma, reinício após alteração em módulo importado, encerramento gracioso por SIGTERM durante restart e Ctrl+C/SIGINT no término. O processo finalizou com código 0 e liberou a porta.

O módulo `src/shared/http/health.js` recebeu somente um comentário temporário para provocar o evento; o conteúdo original foi restaurado integralmente. Nenhuma alteração desse arquivo integra o diff.

O [watcher nativo do Node](https://nodejs.org/api/cli.html#--watch) é estável desde Node 22 e acompanha o entry point e os módulos importados. O smoke comprovou esse comportamento no runtime usado pelo projeto; não foi necessário fallback ou nova dependência.

A tentativa inicial dentro do sandbox falhou com `EMFILE` no watcher. A mesma execução autorizada fora do sandbox funcionou; não houve mudança de código para contornar a restrição.

## 6. Changes

```diff
- "dev": "nodemon src/server.js"
+ "dev": "node --watch src/server.js"
- "nodemon": "^3.0.0"
```

Remoção com npm 10.9.9:

```bash
npm uninstall nodemon --save-dev --package-lock-only --ignore-scripts --no-audit --offline
npm ci --offline --no-audit
```

Os flags `--no-audit` limitaram apenas instalação/resolução. Audits completos e gates foram executados separadamente com acesso ao registry, incluindo devDependencies.

Nenhuma alteração de UI, domínio, API, Health Model, schema ou migration. Nenhuma nova dependência, exceção, downgrade ou override; o override preexistente de `deepmerge-ts` permanece igual.

## 7. Lockfile impact

- **357 → 335 entradas de pacotes**, excluindo a raiz: 22 removidas.
- **285 linhas removidas**, nenhuma adição no lockfile.
- Nenhuma entrada de pacote mantida foi modificada; comparação de objetos completos, incluindo versão, resolução e integridade.
- Única entrada mantida alterada: manifesto da raiz, pela remoção da devDependency.
- `npm ci --offline --no-audit`: PASS, 305 pacotes instalados para esta plataforma. O número instalado difere do lockfile por dependências opcionais de outras plataformas.

Removidos: `nodemon`, `chokidar`, `braces`, `anymatch`, `binary-extensions`, `fill-range`, `glob-parent`, `has-flag`, `ignore-by-default`, `is-binary-path`, `is-number`, `normalize-path`, `picomatch@2`, `pstree.remy`, `readdirp`, `simple-update-notifier`, `supports-color@5`, `to-regex-range`, `touch`, `undefsafe` e as cópias privadas de `debug`/`ms` sob nodemon. Cópias ainda necessárias por outros pacotes permaneceram intactas.

## 8. Dependency tree after

Após a instalação limpa, `npm ls nodemon chokidar braces --all --json` no backend retornou somente nome/versão da raiz, sem `dependencies`. Nenhum dos três pacotes permanece instalado ou no lockfile. Código 1 de `npm ls` nesse filtro significa ausência de correspondências; a saída não contém erro de árvore inválida.

Não há nova cadeia para o mesmo advisory nem NEW BLOCKER decorrente da remoção.

## 9. npm audit after

| Medida, incluindo devDependencies | Antes | Depois |
| --- | ---: | ---: |
| Critical | 0 | 0 |
| High | 3 | **0** |
| Moderate | 8 | 8 |
| Entradas totais | 11 | 8 |
| GHSA-vfj7-8cjw-p6xm | presente | **ausente** |

`npm audit --json` bruto retorna **1**, exclusivamente pelas entradas moderate preexistentes. Não se declara audit com zero vulnerabilidades. O critério HIGH/CRITICAL da política versionada permanece inalterado.

Gate canônico `node scripts/check-npm-audit.mjs <backend|frontend> docs/security/npm-audit-exceptions.json`: **PASS em ambos**, código 0, zero high, zero critical e zero exceções utilizadas. A primeira consulta sem rede falhou por DNS no sandbox; os resultados acima são das consultas autorizadas ao registry.

## 10. Dev workflow smoke

Com a instalação final e o Prisma Client gerado, foi executado **`PORT=4317 npm run dev`**. O terminal imprimiu `node --watch src/server.js`.

| Etapa | Evidência local em 04/10/2026, UTC−03 |
| --- | --- |
| Startup | 00:21:37, Express ativo em 4317, ambiente development |
| Processo permanece ativo / readiness | 00:22:47, HTTP 200, Prisma consulta o banco |
| Alteração temporária em módulo importado | shutdown SIGTERM e novo startup às 00:22:48 |
| Readiness após restart | 00:23:11, HTTP 200 |
| Restauração do conteúdo original | novo restart às 00:23:12 |
| Ctrl+C | 00:23:29, shutdown SIGINT concluído, código 0 |
| Processo restante | nenhum listener na porta 4317 após encerramento |

Depois de `npm ci`, a primeira tentativa do script encontrou o Prisma Client ainda não gerado. `prisma validate/generate` inicialmente foi bloqueado pelo sandbox no cache local (`EPERM`); a execução autorizada passou. O smoke da tabela foi realizado **depois** dessa geração, conforme o setup canônico, sem mudança do loader ou configuração.

Preflight somente de leitura: `NODE_ENV=development`, host `localhost:3306`, desenvolvimento `traceflow`, testes `traceflow_test`, ambos com `read_only=0`; targets distintos validados pelo helper canônico. O smoke não escreveu no banco de desenvolvimento. As suítes usam exclusivamente o banco de teste e fixtures próprios.

Não foi adicionado teste permanente de watcher: não havia harness específico desse processo de desenvolvimento. A validação interativa cobriu o fluxo real; os testes existentes de health/shutdown foram reexecutados na suíte. Não ficou watcher criado pela rodada em execução.

## 11. Backend gates

Node 22.23.3; `NODE_OPTIONS=--no-experimental-webstorage` nos testes, sem ajustes de timeout/assert ou novos skips.

| Gate | Resultado |
| --- | --- |
| `npm run test:unit` | PASS — 83 arquivos, 888 testes |
| `npm run test:integration` | PASS — 49 arquivos, 607 testes; 2 arquivos / 5 testes legados skipped |
| `npm run test:coverage` | PASS — 1.495 testes; statements 92,21%, branches 85,45%, functions 95,50%, lines 94,60% |
| `npm run lint` | PASS |
| `npm run format:check` | PASS |

Integração e cobertura executadas com acesso autorizado ao banco de teste e às portas locais. Nenhum teste foi relaxado para passar.

## 12. Frontend/local CI regression

| Gate | Resultado |
| --- | --- |
| `npm test` | PASS — 106 arquivos, 1.312 testes |
| `npm run test:coverage` | PASS — 1.312 testes; statements 85,08%, branches 79,68%, functions 80,90%, lines 87,50% |
| `npm run lint` / `npm run format:check` | PASS |
| `npm run build` | PASS |
| `validateRepositoryCi()` | PASS |
| `node --test scripts/validate-ci.test.mjs scripts/check-npm-audit.test.mjs` | PASS — 83 testes |
| Prettier da política CI, scripts e arquivo de exceções | PASS |

Validação local inclui a política executável e a regressão listada. Não representa uma nova execução hospedada da CI nem do Dependency Review de PR. Os jobs isolados de upgrade de migrations não foram repetidos nesta mudança de launcher/dependências; nenhuma migration nova foi criada ou aplicada manualmente ao desenvolvimento.

## 13. Prisma

`npx prisma validate`: PASS. `npm run prisma:generate`: PASS, Prisma Client **6.12.0**. Schema e migrations inalterados. A geração foi feita após a instalação limpa e antes dos gates backend e do smoke final.

## 14. Architecture

`npm run architecture:check`: PASS. `npm run security:secrets`: PASS. `git diff --check`: PASS. As únicas mudanças executáveis são o script `dev` e a remoção da dependência/árvore associada.

## 15. Security documentation

Atualizado `docs/security/DEPENDENCY_RISK_REGISTER.md` com origem, decisão, mitigação por Node 22 e resultado posterior do audit. O arquivo `npm-audit-exceptions.json` continua vazio e inalterado.

Registrado o fechamento do blocker de segurança nos relatórios **P8.6C Visual & Data Hardening** e **P8.6D Final Indicators Polish**, preservando seus vereditos históricos e limites de evidência. Esta rodada não refaz nem amplia aprovação visual.

## 16. Remaining vulnerabilities

**8 entradas moderate preexistentes, sem alteração no relatório de vulnerabilidades antes/depois:**

| Família | Pacotes instalados reportados pelo audit |
| --- | --- |
| Vitest | `@vitest/coverage-v8@4.1.10`, `@vitest/mocker@4.1.10`, `vitest@4.1.10` |
| Parsing de query | `qs@6.15.2`, `body-parser@1.20.6`, `express@4.22.2` |
| Endereços IP | `ip-address@10.5.0` |
| Upload | `multer@2.3.0` |

São achados de outras cadeias, inclusive runtime, fora da remoção autorizada de nodemon. Permanecem registrados, sem waiver ou tentativa de escondê-los. A política HIGH/CRITICAL existente aprova este resultado. Nenhuma vulnerabilidade HIGH/CRITICAL restante; nenhum blocker SECURITY/DEPENDENCY/DEV_WORKFLOW/CI confirmado nesta rodada.

O smoke foi local em macOS/Node 22; não constitui execução manual em Windows/Linux. Evidências de inspeção visual, zoom e operação externa continuam limitadas aos relatórios que as produziram.

## 17. Final verdict

**S2 P8.6E SECURITY DEPENDENCY CLOSURE — PASS LOCAL**

O advisory bloqueante foi removido da árvore instalada. Workflow dev validado com startup, restart, readiness Prisma e shutdown. Gates de regressão, cobertura, Prisma, arquitetura, política local e segurança passaram, sem exceção ou alteração da política.

**Blockers de segurança P8.6C/P8.6D: ENCERRADOS.** Os achados moderate preexistentes estão explicitados acima; PASS desta rodada refere-se ao fechamento do blocker e aos critérios canônicos de aceitação.

P9 não iniciado. Sem commit/push.

Sugestão de commit: `chore: replace nodemon with native node watch`.
