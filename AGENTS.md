# Instruções operacionais para agentes no TRACEFLOW

## Escopo do produto

O TRACEFLOW é uma aplicação web de rastreabilidade de engenharia de software. Sua cadeia canônica
liga requisitos, tarefas e artefatos técnicos persistidos do GitHub. Não o reduza a um quadro de
tarefas nem trate visualizações como fonte das regras de domínio.

Este arquivo é a fonte operacional compartilhada para Codex, Copilot, Code Review e outros
agentes. Adapters e skills devem apontar para ele e para a documentação canônica, sem criar uma
arquitetura paralela.

## Fontes de verdade e precedência

1. Respeite as instruções explícitas da tarefa e o `AGENTS.md` aplicável mais próximo, sem
   contrariar limites de segurança da ferramenta.
2. Para requisitos, numeração de RFs e casos de uso, prevalece o documento oficial do TCC indicado
   em `TRACEFLOW_CONTEXTO_ARQUITETURA.md`.
3. Para o estado executável, confronte código, migrations, testes e, nesta ordem funcional:
   - `docs/architecture/SYSTEM_ARCHITECTURE.md` e ADRs aceitos não superados;
   - `docs/api/API_CONTRACTS.md`;
   - `docs/security/AUTHORIZATION_MATRIX.md`;
   - `docs/traceability/RF_TECHNICAL_MATRIX.md`;
   - `docs/architecture/MODULE_CONVENTIONS.md` e `FRONTEND_STRUCTURE.md`;
   - políticas e runbooks vigentes em `docs/security/`, `docs/privacy/`, `docs/runbooks/` e
     `docs/ci/`.
4. Use `TRACEFLOW_CONTEXTO_ARQUITETURA.md` como contexto e diretriz evolutiva; capacidades futuras
   nele descritas não provam implementação.
5. Roadmaps, deliveries, refactoring, inventários e relatórios históricos são evidência contextual,
   não requisito ou autoridade automática sobre o runtime atual.

Se fontes vigentes ou código divergirem, não escolha silenciosamente uma versão. Registre a lacuna,
preserve o comportamento fora do escopo e encaminhe a decisão à fonte canônica apropriada. Nunca
renumere RFs nem use documento superado como requisito atual.

## Autoridade de decisão

Agentes podem tomar autonomamente decisões técnicas locais, reversíveis e de baixo impacto quando a
resposta é inequívoca a partir da documentação, código, contratos e convenções vigentes. Devem
respeitar integralmente arquitetura, segurança, testes e organização já definidas.

Exemplos de autonomia permitida:

- nomes locais, helpers e organização interna de função;
- `Map` versus objeto quando semanticamente equivalentes;
- divisão interna de componente e localização de teste dentro da estrutura vigente;
- algoritmo que preserve o comportamento e os contratos observáveis;
- detalhes previsíveis de contrato HTTP quando método, status, schema e DTO decorrem claramente do
  padrão existente;
- aplicação de controles de segurança já definidos;
- formatação determinada pelo Prettier.

O agente não precisa pedir aprovação para essas escolhas inequívocas. Porém, não pode inventar ou
alterar por inferência própria regra de negócio/produto/domínio, permissão, invariante,
cardinalidade, lifecycle funcional, retenção/eliminação de dados, escopo funcional, critério de
autorização ou decisão arquitetural relevante.

Quando houver alternativas tecnicamente válidas com impacto relevante em comportamento, domínio,
segurança, compatibilidade ou arquitetura, identifique a lacuna, apresente alternativas e peça a
decisão do desenvolvedor antes de implementar. A necessidade de intervenção humana é determinada
pelo impacto da decisão, não pelo tipo do arquivo ou tecnologia.

## Evolução da arquitetura

Arquivos de agentes não são o lugar onde uma arquitetura nasce. O fluxo esperado é:

```text
decisão/requisito → arquitetura/ADR/contrato → código/testes → documentação afetada
                 → AGENTS/Copilot/SKILL refletem a regra
```

Se a decisão necessária não existir nas fontes canônicas, não a canonize apenas em `AGENTS.md`, em
um adapter ou em uma skill.

## Arquitetura obrigatória

Backend:

```text
Route → Controller → Service → Repository → Prisma → MySQL
                           └→ external client
```

Routes declaram contrato HTTP e middlewares; controllers adaptam HTTP; services implementam casos de
uso, invariantes, autorização contextual, transações e auditoria; repositories concentram Prisma;
clients externos encapsulam integrações e não persistem. Preserve as fronteiras verificadas por
`npm run architecture:check`.

Frontend:

```text
app/routes → pages → features/<domain> → shared + api/http-client
```

Pages são adaptadores finos; features contêm fluxo e estado do domínio; `shared` não importa
pages/features; features não importam internals umas das outras. Toda chamada HTTP usa
`frontend/src/api/http-client.js`, e o backend continua autoridade para identidade, autorização,
validação, cálculos e persistência.

Para novos estilos e alterações em estilos existentes, mantenha CSS convencional com ownership
rastreável junto do componente, page, feature ou shared owner. `frontend/src/styles/` é reservado a
tokens, base e regras realmente globais; não acrescente seletores específicos de feature a
`global.css`. Responsive rules ficam com o owner que estilizam. Não imponha CSS Modules ou nova
biblioteca sem decisão arquitetural. A separação futura do CSS legado deve preservar cascade,
especificidade e media queries, com validação visual; não faça migração mecânica cega.

Inline style só é adequado quando depende de valor realmente calculado em runtime. Estilo estático
pertence ao CSS do owner.

## Invariantes de domínio e GitHub

- Todo recurso de projeto deve ser resolvido no próprio projeto antes da autorização.
- `ProjectMembership` ativa define `OWNER`, `MANAGER`, `MEMBER` e `VIEWER`; OWNER não é
  administrador global.
- Sem membership, a API usa `404` opaco; papel insuficiente usa `403`.
- Identidade e autoria vêm da sessão e de campos canônicos, nunca de nome, e-mail ou body controlado.
- O último OWNER deve permanecer protegido por transação e contra concorrência.
- A rastreabilidade canônica usa `Task.requirementId`, `Task.pullRequestId`, `TaskCommit` e
  `TaskIssue`; não reintroduza modelos genéricos removidos.
- GitHub OAuth pertence a cadastro, login, vínculo de identidade e reautenticação sensível.
- GitHub App é a autoridade para Installation, repositórios, artefatos, sync e webhooks.
- `GitHubIdentity` não é pré-condição para usar a App; a App não é pré-condição para login OAuth.
- Tokens GitHub são efêmeros e nunca vão para frontend, Prisma, logs ou auditoria.
- Não reintroduza autorização de repositório baseada na identidade OAuth, PAT, credencial sistêmica
  ou fallback operacional.
- IDs e metadados de instalação/repositório enviados pelo navegador sempre são revalidados.

## Assíncronos, polling e concorrência

- Job persistido deve possuir ID correlacionável; quando execuções puderem se confundir, o polling
  acompanha aquele ID e não um registro `latest` por conveniência.
- Coalescing, exclusão mútua, retry e recuperação de stale precisam de contrato explícito e testes
  determinísticos.
- `FAILED` é estado de domínio do job. A consulta de status continua respondendo pelo contrato HTTP
  de leitura e representa a falha no DTO; não transforma falha funcional esperada em erro da
  própria consulta.
- Testes de concorrência não dependem de timing incidental, sleeps arbitrários ou retries que
  escondem race.

## Comentários, formatação e qualidade

- Comentários explicam o porquê: decisão não óbvia, invariante, segurança, concorrência, comportamento
  estranho de API externa ou workaround inevitável.
- Não narre o código, traduza JavaScript para português nem descreva cada `if`/loop. Prefira uma ou
  duas linhas; blocos maiores exigem complexidade real.
- Comentário redundante ou obsoleto deve ser questionado, mas preferência de estilo sem impacto não
  é finding de Code Review.
- Prettier é a autoridade de formatação automática; ESLint cobre qualidade e erros estáticos;
  `architecture:check` cobre fronteiras arquiteturais.
- Não reformate por preferência pessoal. Gere código compatível com Prettier e execute os checks
  existentes. Code Review não abre finding que o Prettier resolveria, salvo arquivo fora do
  formatter ou gate falhando.

## Segurança, banco e evidência

- A política é deny-by-default e fail-closed; UI, CORS e ocultação visual não autorizam operações.
- Nunca exponha ou registre senha, token, cookie, private key, secret, hash, SQL, stack, payload
  externo bruto ou PII desnecessária. Use `[REDACTED_SECRET]` em evidências.
- Toda mudança de schema exige migration incremental versionada. Nunca edite migration aplicada,
  use `db push` como evolução compartilhada ou sugira reset.
- `prisma validate` e `generate` não provam aplicação; verifique deploy/status em banco de teste
  isolado quando a tarefa afetar persistência.
- Diferencie evidência automatizada, manual, externa, simulada e não executada. Nunca promova
  validação indisponível a PASS.

## Documentação como parte da implementação

Toda implementação deve avaliar impacto documental. Se afetar comportamento, contrato, arquitetura,
banco, segurança, autorização, integração, operação ou requisito, atualize a documentação canônica
correspondente em `/docs` na mesma mudança. Se não houver impacto real, registre explicitamente
`Documentação: N/A` na PR ou entrega; não crie edição cosmética apenas para cumprir checklist.

Mapeamento mínimo:

- API/DTO → `docs/api/`;
- arquitetura → `docs/architecture/` e ADR quando aplicável;
- autenticação, autorização e segurança → `docs/security/`;
- schema/migration → `docs/database/` e runbook aplicável;
- GitHub → arquitetura, API e runbook conforme o impacto;
- requisito/RF → `docs/traceability/`;
- deploy, backup e operação → `docs/runbooks/`.

## Testes e paridade com a CI

- Use as versões/configurações declaradas em `.github/workflows/ci.yml` como referência. Mudanças
  sensíveis a banco, migrations ou concorrência devem, quando possível, ser validadas contra a
  mesma imagem/configuração de MySQL ou ambiente containerizado equivalente.
- Não declare `CI-equivalent` se Node, banco ou a ordem dos gates relevantes não foram reproduzidos.
- A CI de uma PR pode avaliar merge commit sintético de base+head. Diagnósticos devem distinguir o
  resultado da branch local do resultado no merge ref.
- Rode gates proporcionais ao escopo: lint, `format:check`, arquitetura, secrets, testes, coverage,
  build, Prisma/migrations e supply chain conforme os arquivos afetados.
- Falha corrigida recebe teste de regressão; testes comuns não dependem de rede externa.

## Commits e pull requests

Siga o padrão de commit e as exceções documentadas em `CONTRIBUTING.md`. Um TASK-ID auxilia a
rastreabilidade e revisão humana, mas não concede autorização nem cria vínculo definitivo por si só.
PRs devem manter diff focado, declarar documentação/impacto, validações executadas e limitações reais.

## Nunca faça

- Não invente requisito, endpoint, papel, entidade, dado, integração, evidência ou decisão pendente.
- Não adicione mock/fallback ao runtime para mascarar dependência ausente.
- Não faça refactor oportunista, arquitetura paralela, dependência redundante ou quebra silenciosa.
- Não remova dados, aliases, endpoints ou modelos sem prova de consumers e plano seguro.
- Não altere TCC, roadmap, branch, PR ou configuração externa fora do escopo explícito.
- Não use commit, push, merge, rebase, reset ou operação destrutiva sem autorização explícita.

## Definition of Done

Uma mudança está pronta somente quando o escopo funciona nas camadas necessárias; invariantes e
autorização foram preservadas; migrations e upgrade foram validados quando aplicáveis; regressões
relevantes estão cobertas; gates proporcionais passaram; impacto documental foi atualizado ou
declarado como `Documentação: N/A`; rastreabilidade foi registrada; o diff está limpo e focado; e
toda validação não executada, risco residual ou contradição permanece declarada sem overclaim.
