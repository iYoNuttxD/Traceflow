# E14 — CI obrigatória e supply chain

## Estado

**CONCLUÍDA em 26/07/2026.** O workflow deixou de ser uma verificação opcional e passou a bloquear falhas de qualidade, schema/migrations, testes, cobertura, build, segredos e dependências. Não houve alteração de contrato HTTP, regra de negócio, schema ou migration.

## Baseline

- Branch: `daniel-dev`.
- Commit inicial: `204e37beffcd529f3f88a0cc394931bda59474ea`.
- Alterações preexistentes preservadas: PDFs do TCC/ASVS e `TRACEFLOW_MAPEAMENTO_REFATORACAO.md`, não rastreados.
- Backend: 198 testes; 86,29% statements, 73,31% branches, 88,39% functions e 89,04% lines no baseline anterior à aplicação mecânica do formato.
- Frontend: 83 testes; 53,29% statements, 49,20% branches, 45,97% functions e 56,58% lines; build Vite aprovado.
- Ambiente local observado: Node 25.9.0, npm 11.12.1 e cliente MySQL 9.6.0. A versão canônica do projeto/CI permanece Node 22 e o serviço de CI é MySQL 8.4.8.
- Workflow anterior: job único, checks de sintaxe e scripts com `--if-present`, sem MySQL, migrations, cobertura, lint, formatação ou política executável de audit.
- Tempos de referência: backend completo com cobertura em aproximadamente 10,5 s, frontend com cobertura em aproximadamente 3,7–6,2 s e build em aproximadamente 0,3 s, sem contar instalação e startup do serviço MySQL.

## Arquitetura dos jobs

O workflow executa em pull request e push para `main`, com concorrência cancelável, timeouts e jobs independentes:

| Check | Gate |
|---|---|
| `Quality` | instalações determinísticas, ESLint, Prettier e teste estrutural do próprio workflow |
| `Backend Tests` | Prisma, MySQL/migrations, arquitetura, segredos, unitários, integração e cobertura |
| `Frontend Tests` | lint, formatação, cobertura e build Vite |
| `Supply Chain` | política de audit backend/frontend e scanner de segredos |
| `Dependency Review` | delta de dependências em pull requests, bloqueando severidade high/critical |

Não há `--if-present`, `continue-on-error`, `|| true` nem `npm audit fix`. Actions usam major explícito e estável (`v4`); nenhuma usa `main` ou `master`. A permissão global é `contents: read`; somente Dependency Review adiciona `pull-requests: read`.

## Qualidade local

ESLint flat config e Prettier foram adicionados aos dois projetos. Backend cobre `src`, `test`, `scripts` e `vitest.config.js`; frontend cobre `src`, `test` e config. Diretórios gerados, dependências e fixtures intencionalmente inválidas são excluídos, sem excluir código de produção da análise.

As dependências adicionadas são exclusivamente de desenvolvimento: `eslint`, `@eslint/js`, `globals` e `prettier` nos dois projetos, mais `eslint-plugin-react-hooks` no frontend. Os dois lockfiles foram atualizados por npm e permaneceram versionados. Nenhuma dependência de runtime foi adicionada.

Os scripts canônicos `lint`, `format:check` e `format` são explícitos. A formatação inicial foi aplicada ao código coberto para que o gate seja reproduzível; mudanças foram mecânicas e não alteraram comportamento.

## MySQL, Prisma e migrations

`Backend Tests` usa `mysql:8.4.8`, banco descartável `traceflow_test`, usuário/senha artificiais e health check. `TEST_DATABASE_URL` e `DATABASE_URL` apontam para schemas diferentes. A sequência obrigatória valida e gera o Prisma Client, aplica todas as migrations em banco vazio e verifica que nenhuma permanece pendente. Integração usa MySQL real; nenhum reset, persistência entre execuções ou credencial real é usado.

Na validação local, as 25 migrations versionadas estavam aplicadas e o status retornou banco atualizado. O schema e as migrations permaneceram sem diff.

## Testes, cobertura e artefatos

Os thresholds globais foram elevados para pisos abaixo, mas próximos, da cobertura medida:

| Projeto | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| Backend | 85% | 70% | 85% | 87% |
| Frontend | 50% | 45% | 40% | 53% |

Não houve exclusão adicional de código para atingir os pisos. `backend-coverage` e `frontend-coverage` publicam somente HTML e `coverage-summary.json`, quando existentes, por sete dias e mesmo após falha do passo de testes. Não incluem banco, ambiente, `node_modules` ou logs.

Na validação final, o backend registrou 86,29% statements, 73,31% branches, 88,39% functions e 88,59% lines; a variação da métrica de linhas decorre da quebra mecânica de expressões pelo Prettier, sem redução de statements cobertos. O frontend registrou 53,31%, 49,20%, 45,97% e 55,04%, respectivamente.

## Política de dependências

`scripts/check-npm-audit.mjs` executa `npm audit --json` e falha em qualquer vulnerabilidade high/critical nova. Uma exceção só é aceita quando advisory, pacote, cadeia, severidade, justificativa, data, revisão e responsável coincidem exatamente e a revisão não expirou.

O backend permanece com zero vulnerabilidades. O frontend possui duas ocorrências do mesmo advisory `GHSA-qwww-vcr4-c8h2`: `react-router-dom` e seu `react-router`. A exceção é específica ao advisory/cadeia, válida até 26/10/2026 e fundamentada no fato de o TRACEFLOW ser SPA sem React Server Components/actions/SSR. Ela expira automaticamente e não autoriza advisories futuros do pacote.

O Dependency Review oficial roda somente em PR e bloqueia nova dependência de severidade `high` ou `critical`. CodeQL e SBOM automatizada não foram adicionados: permanecem decisões futuras, sem reduzir os gates desta etapa.

## Segredos e cache

`npm run security:secrets` é obrigatório em Backend Tests e Supply Chain. O scanner mantém saída sanitizada e código diferente de zero para achados, passou a incluir scripts `.mjs` e continua ignorando somente artefatos gerados, dependências, documentos e testes conforme sua política existente; o banco de CI usa somente placeholders aceitos. Os caches do `setup-node` são indexados pelos lockfiles separados, sem armazenar `node_modules`, `.env` ou banco.

## Testes do gate

Os testes do verificador estrutural provam o caminho válido e bloqueiam script ausente, falha mascarada, action flutuante e ausência de migration. Os testes da política de audit cobrem audit limpo, exceção exata, advisory novo, expiração e tentativa de allowlist genérica. Lint, Prettier, Prisma, migration status, Vitest e Vite conservam seu próprio exit code como gate, sem wrappers tolerantes.

A passagem final aprovou 108 testes unitários, 90 de integração e 198 na coleta backend; o frontend aprovou 83 testes em 25 arquivos. Architecture check, scanner de 252 arquivos, YAML, policy tests, audit e build também passaram. Uma primeira passagem da cobertura backend teve falha transitória de isolamento após a execução duplicada das suítes; a repetição isolada e a sequência final completa passaram 198/198, sem alteração de regra funcional ou tolerância na CI.

## Operação de merge

`docs/ci/BRANCH_PROTECTION.md` lista os cinco checks e as regras recomendadas para `main`. A E14 não alterou configuração remota. `CONTRIBUTING.md` documenta Node/MySQL, banco isolado, comandos equivalentes, dependências, segredos e fluxo de PR.

## Riscos para E15

- A exceção React Router deve ser removida ou renovada com nova evidência antes de 26/10/2026.
- SBOM automatizada e assinatura/proveniência de artefatos ainda não existem.
- A proteção de branch precisa ser aplicada manualmente por mantenedor no GitHub.
- Ações estão fixadas em majors estáveis, não em SHAs imutáveis; uma migração coordenada para SHAs pode endurecer a supply chain.

A E15 não foi iniciada.
