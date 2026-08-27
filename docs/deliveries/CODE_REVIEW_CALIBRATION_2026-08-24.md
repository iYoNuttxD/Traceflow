# Infraestrutura de agentes e Code Review — auditoria e calibração

Data: 2026-08-24

Branch: `daniel-dev`

HEAD inicial: `fd8e484f34a8181485ed80c6a82a6f610f7c89a8`

Modo: documentação/instruções; sem alteração de runtime, TCC, roadmap, PR ou estado remoto

## Resultado

A infraestrutura usa uma única fonte operacional compartilhada (`/AGENTS.md`), dois adapters
pequenos (`/.github/copilot-instructions.md`), cinco instruções path-specific e um
skill especializado de revisão.

Este relatório é um snapshot de entrega e calibração. Ele não substitui arquitetura, contratos,
matrizes, ADRs ou runbooks vigentes.

## Baseline e preservação

Antes das edições, o checkout estava em `daniel-dev`, sincronizado com `origin/daniel-dev` no commit
`fd8e484`. Já existiam mudanças locais em:

- `TRACEFLOW_ROADMAP_INCREMENTAL.md`;
- `docs/traceability/RF_TECHNICAL_MATRIX.md`.

Essas mudanças foram preservadas. O roadmap não foi editado. Nenhum commit, push, merge, rebase,
reset, troca de branch, comentário/review ou alteração de PR foi executado.

## Fontes auditadas

A auditoria leu o contexto arquitetural, arquitetura executável, convenções backend/frontend,
contratos HTTP, matriz de autorização, matriz RF local modificada, ADR-002 a ADR-010, políticas de
segredos/privacidade, threat model, runbooks, README, CONTRIBUTING, package scripts, Prisma schema,
migrations, CI e os módulos/testes relevantes de autenticação, GitHub, projetos, branches e legado.

Documentos históricos/refactoring/deliveries foram usados somente para identificar decisões
superadas, bugs conhecidos e casos de calibração. Eles não foram promovidos a autoridade atual.

## Precedência adotada

`AGENTS.md` preserva a precedência documentada, mas separa duas perguntas que não podem ser
misturadas:

1. requisitos, RFs e casos de uso: documento oficial do TCC indicado pelo contexto arquitetural;
2. comportamento executável: código, migrations, testes, arquitetura/ADRs aceitos, contratos e
   matrizes vigentes.

O contexto arquitetural continua diretriz evolutiva. Roadmaps, deliveries, refactoring e inventários
são evidência contextual. Contradição não é resolvida por preferência do agente: deve ser registrada
e encaminhada à fonte apropriada.

## Decisões de design

| Arquivo/camada | Função |
|---|---|
| `AGENTS.md` | Fonte operacional compartilhada, concisa, para escopo, precedência, arquitetura, invariantes, segurança, banco, gates e DoD |
| `CLAUDE.md` | Importa `@AGENTS.md` e contém somente comportamento específico do adapter Claude Code |
| `.github/copilot-instructions.md` | Expectativas globais do Copilot e roteamento ao skill de review |
| `.github/instructions/*.instructions.md` | Regras apenas do caminho backend, frontend, database, security ou documentation |
| `.github/skills/code-review/SKILL.md` | Procedimento sob demanda para review de alto sinal, com três passagens, checklists, severidade, anti-falso-positivo e formato final |

As instruções evitam copiar contratos e matrizes extensos. Elas apontam para as fontes vigentes e
contêm somente invariantes que mudam decisões do agente.

## Contradições e ambiguidades encontradas

### C01 — LR.9 e fronteira GitHub

Não existe registro de `LR.9` na baseline local. O runtime expõe OAuth para login/vínculo em
`auth.routes.js`/`github-auth.*` e GitHub App por instalação para repositórios em `github-app.*`.
Entretanto, `docs/runbooks/GITHUB_INTEGRATION.md` ainda diz para não habilitar login de usuários, e a
formalização “OAuth = autenticação; GitHub App = repositórios/artefatos” foi informada como decisão em
revisão.

Tratamento: os novos arquivos descrevem o comportamento observado, mas marcam a decisão definitiva
como pendente. Eles não alteram nem consolidam silenciosamente a LR.9.

### C02 — Quantidade de migrations

`SYSTEM_ARCHITECTURE.md`, README e runbooks ainda mencionam 25 migrations. A árvore atual contém 34
diretórios de migration, coerente com a entrega L5.1. Nenhum desses documentos foi corrigido porque
esta entrega não deve misturar a infraestrutura de agentes com saneamento das fontes existentes.

Tratamento: agentes devem contar/validar o estado real e nunca copiar um número histórico sem prova.

### C03 — Disponibilidade de repositório

`API_CONTRACTS.md` afirma que repositório ocupado por outro projeto é “não selecionável”. O service
atual devolve `selectable: true`; a UI permite selecioná-lo para descoberta, impede a submissão e o
backend mantém conflito/constraint. A entrega L1.2 documenta esse comportamento de descoberta.

Tratamento: não cristalizar uma das versões como regra global. Review deve comparar diff, consumer,
constraint e comportamento esperado antes de abrir finding.

### C04 — Troca de repositório do mesmo projeto

`github.repository.js` usa `upsert` por `projectId` e atualiza os metadados da integração. Não foi
encontrado contrato vigente que proíba explicitamente o repo swap, embora a preservação de
artefatos/rastreabilidade torne uma troca silenciosa arriscada.

Tratamento: “repo swap proibido” não foi registrado como invariável já comprovada. Os arquivos exigem
decisão/contrato explícito e análise de dados antes de uma troca.

### C05 — Case de `GitBranch`

O código preserva o nome recebido e usa `(projectId, name)` como chave. A migration, porém, cria
`GitBranch.name` sob `utf8mb4_unicode_ci`, collation case-insensitive. Portanto a baseline não prova
unicidade case-sensitive.

Tratamento: preservar a grafia externa e exigir prova de collation antes de alegar que `GitBranch` é
case-sensitive. Uma correção futura deve ser migration incremental, nunca edição da aplicada.

### C06 — Contrato `POST /projects/from-github`

A seção L1 de `API_CONTRACTS.md` exige `githubInstallationId` e `githubRepositoryId` e o backend
revalida metadata. A tabela geral ainda descreve metadata GitHub enviada pelo cliente.

Tratamento: instruções exigem conferir schema/route/service/consumer e registrar a divergência; não
copiar a linha histórica da tabela.

### C07 — Cobertura da matriz de autorização

A matriz vigente descreve GitHub App, mas não enumera os endpoints atuais de login/vínculo OAuth e
alguns fluxos de Settings introduzidos depois da E6/E15.

Tratamento: a matriz continua fonte de RBAC por projeto, mas review de auth também deve verificar
routes, middleware, API contracts e testes atuais.

## Compatibilidade com o GitHub atual

Em 2026-08-24, a documentação oficial consultada confirma:

- instruções globais em `.github/copilot-instructions.md`;
- instruções path-specific em `.github/instructions/**/*.instructions.md`, com frontmatter
  `applyTo` e globs separados por vírgula;
- instruções compartilhadas em `AGENTS.md`;
- skills de projeto em `.github/skills/<skill-name>/SKILL.md`, com `name` e `description` obrigatórios;
- Code Review lê instruções e skills da head branch da PR.

Referências: [repository custom instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions),
[agent skills](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills) e
[Copilot code review](https://docs.github.com/en/copilot/concepts/agents/code-review).

## Calibração estática com a PR #13

A PR pública [#13](https://github.com/iYoNuttxD/Traceflow/pull/13), “Enhance identity management,
security features, and GitHub integration”, foi usada somente como benchmark read-only. A página
indica merge de `daniel-dev` em `main` com 30 commits. O patch público foi inspecionado; nenhum
comentário ou review foi publicado.

Esta é uma calibração estática do conteúdo do skill contra casos conhecidos, não uma execução real do
Copilot Code Review. A API anônima do GitHub estava rate-limited; patch e página HTML permaneceram
acessíveis, mas metadados completos de checks/reviews não foram usados.

### Bugs/divergências que o skill deve detectar

| Benchmark documentado | Sinal coberto pelo skill | Resultado esperado |
|---|---|---|
| L1: unicidade de repository ID/cardinalidade de instalação | GitHub + schema/constraints + consumer | Finding MEDIUM/HIGH se o diff permitir vínculo duplicado ou bloquear N projetos por instalação |
| L3-BUG-001: download cria segunda exportação | correctness ponta a ponta + cardinalidade/auditoria | Finding MEDIUM com cadeia controller → services → persistência |
| L3-DIV-003: Settings fica em loading/estado parcial após falha | estados frontend + retry/falha fatal | Finding MEDIUM reproduzível |
| L3-BUG-005: cookie malformado vira `500` | parsing de entrada + fail-closed + erro seguro | Finding MEDIUM com header mínimo de reprodução |
| L4.2: invitation/membership de outro projeto recebe semântica errada | project scope + BOLA + erro opaco | Finding HIGH/MEDIUM conforme possibilidade de mutação/leak |
| L1.2.1: sync HTTP longo causa falso erro no frontend | timeout, lifecycle, polling e sucesso parcial | Finding de correctness quando o diff mantém request acoplado e UI mente sobre o resultado |
| Migration/backfill multibranch | migration incremental + contagens + upgrade | Finding se houver perda de Project/Commit/PR/Issue ou edição histórica |

### Falsos positivos que o skill deve evitar

| Caso conhecido | Como o skill evita o falso positivo |
|---|---|
| L3-NP-017: bootstrap/CSRF/sessão coerentes | exige cadeia causal a partir do diff e tenta refutar com callers/testes |
| L3-NP-018: Identity/App não concedem acesso entre si por inferência | avalia tokens/consentimento/BOLA concretos e aplica o guard da LR.9 |
| L3-NP-019: multibranch/checkpoint/lifecycle coerentes | não presume fast-forward, delete ou reativação não observada |
| L3-NP-020: RBAC/último OWNER já protegidos | confere transação, matriz e testes antes de reportar |
| L3-DEC-016: convite para conta não ativa é decisão pendente | classifica como pergunta/INFO, não finding severo inventado |
| `ECONNRESET` do harness concorrente | separa falha de teste de bug de produto e exige resposta/cadeia causal |
| OAuth/SMTP/GitHub/browser não executados | registra em validações externas, sem `PASS` e sem converter em bug |
| Legado com consumer/dado/contrato | não recomenda remoção nem reintrodução sem inventário e migration segura |

### Resultado da calibração

O skill contém checks explícitos para todos os bugs/divergências selecionados e regras
anti-falso-positivo para todos os controles negativos acima. O formato exige evidência, linha, impacto
e reprodução/ataque, além de forçar tentativa de refutação antes da entrega.

Limitação: somente uso real em novas PRs poderá medir precisão/recall e revelar ajustes de severidade
ou excesso de contexto. A primeira aplicação deve comparar findings com revisão humana e registrar
apenas correções suportadas por erros observados.

## Como cada agente usa a infraestrutura

- Codex: descobre `/AGENTS.md` nativamente e combina o mais próximo da árvore; não há `CODEX.md`.
- Claude Code: carrega `/CLAUDE.md`, que importa `@AGENTS.md`; o adapter não duplica arquitetura.
- GitHub Copilot: lê a instrução global e os arquivos path-specific correspondentes ao diff.
- Copilot Code Review: pode selecionar automaticamente o skill `code-review` pelo nome/description na
  head branch e produzir o formato padronizado; publicação continua dependente de ação explícita.

## Validações e limitações

| Validação | Resultado |
|---|---|
| Frontmatter do skill (`name`, `description`, chaves, limites e placeholders) | PASS por parser YAML equivalente ao validator oficial |
| Frontmatter `applyTo` dos cinco arquivos e correspondência dos globs na árvore | PASS |
| Referências dos adapters a `@AGENTS.md` e arquivos canônicos locais | PASS |
| Fences Markdown, newline final, trailing whitespace e `git diff --check` | PASS |
| Duplicação exata de linhas longas entre os novos arquivos | PASS — nenhuma encontrada |
| Secret scan dirigido aos 10 novos arquivos | PASS |
| `backend/scripts/check-architecture.js` | PASS — nenhuma violação atual |
| `node --test scripts/validate-ci.test.mjs` | PASS — 5/5 |
| Preservação dos diffs preexistentes | PASS — roadmap 32+/17−; matriz RF 14+/7−, sem edição nesta entrega |

O `quick_validate.py` fornecido pelo skill-creator não pôde importar `yaml` em nenhum dos runtimes
Python disponíveis. O mesmo conjunto de regras do script foi inspecionado e reproduzido com o parser
YAML nativo do Ruby, com resultado PASS. O Prettier/markdown linter não está instalado nem há script
Markdown configurado no repositório; nenhuma dependência ou lockfile foi alterado para introduzi-lo.

Como nenhum código de produção foi alterado, suites completas de backend/frontend e migrations não
são necessárias para provar esta mudança documental.

Validações externas não executadas: Copilot Code Review real, Claude Code real, browser, SMTP,
GitHub OAuth/App, branch protection e ambiente de produção. Nenhuma delas recebe `PASS` neste
relatório.
