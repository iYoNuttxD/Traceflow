# E4 — Validação de entrada e contratos HTTP

## Identificação e resultado

- **Branch:** `daniel-dev`
- **Commit inicial:** `7b0c25b1f3e7d3bb67947a82bc1fa93e16597812`
- **Data:** 24/07/2026
- **Estado inicial:** árvore limpa e sincronizada com `origin/daniel-dev` (`+0/-0`).
- **Alterações locais preexistentes:** nenhuma.
- **Resultado:** **CONCLUÍDA**. Todas as rotas mutáveis implementadas, IDs e filtros atuais foram protegidos; as exceções são somente os sete placeholders `501`, para preservar o baseline.

## Biblioteca escolhida

Foi adicionada apenas `zod@4.4.3` como dependência de runtime. O pacote é compatível com ES Modules, permite schemas declarativos/reutilizáveis e não declara restrição de engine incompatível com Node 22. JavaScript nativo continua sendo usado para configuração da E3; Zod atua exclusivamente na fronteira HTTP.

O `npm audit` registrou uma vulnerabilidade transitiva baixa de runtime em `body-parser` e uma alta na árvore de desenvolvimento em `brace-expansion`. Elas já pertencem à árvore de Express/ferramentas; nenhuma decorre do Zod. Não foi executado `npm audit fix`.

## Estrutura criada

```text
backend/src/shared/validation/
├── common.schemas.js
├── validate-request.middleware.js
├── validation-error.mapper.js
└── index.js

backend/src/modules/
├── projects/project.validation.js
├── requirements/requirement.validation.js
├── tasks/task.validation.js
├── github/github.validation.js
├── artifacts/artifact.validation.js
└── traceability/traceability.validation.js
```

Os arquivos `project.schema.js`, `requirement.schema.js` e `task.schema.js` existentes continuam responsáveis por normalização defensiva, defaults, cálculos e invariantes internas. Os novos `*.validation.js` descrevem somente a fronteira HTTP e não importam Express, controllers, services ou repositories.

## Middleware e contrato de erro

`validateRequest({ params, query, body })` executa antes do controller, valida somente schemas declarados e substitui `req.params`, `req.query` e `req.body` pelos valores validados. Falhas geram o `ValidationError` compartilhado da E3, com HTTP `400` e código `VALIDATION_ERROR`.

```json
{
  "message": "O título da tarefa é obrigatório.",
  "code": "VALIDATION_ERROR",
  "details": [
    { "field": "title", "message": "O título da tarefa é obrigatório." }
  ],
  "requestId": "<request-id>"
}
```

A mensagem histórica específica é preservada como mensagem principal quando existe. `details` contém apenas nome do campo e mensagem segura; valores, body, headers, stack, URL de banco, token, e-mail recebido, schema e nome da biblioteca não são serializados. O request ID continua vindo da E3 e coincide com o header da resposta.

## Schemas comuns, coerção e limites

Foram criados schemas para ID positivo, texto obrigatório/opcional, boolean de query, data civil, datetime ISO-8601, URL HTTP(S), URL GitHub, e-mail, enum, busca, paginação e intervalo de datas.

| Entrada | Política |
|---|---|
| Params/IDs | string composta só por dígitos → inteiro positivo |
| Boolean query | somente `"true"` e `"false"` |
| Strings | trim explícito; vazio só vira `null` nos contratos que já permitiam |
| Datas | `YYYY-MM-DD` real; dias inexistentes são rejeitados |
| Datetime | ISO-8601 completo com timezone |
| Números | não há truncamento de decimal nem conversão de texto arbitrário |
| Valores desconhecidos | nunca recebem default silencioso |

Limites iniciais:

- campos persistidos em Prisma `String` sem `@db.Text`: 191 caracteres;
- URLs persistidas: 191 caracteres;
- busca: 255 caracteres;
- access code recebido: 32 caracteres;
- paginação comum preparada: página mínima 1 e limite máximo 100, sem ativar paginação onde ela ainda não existe.

## Campos desconhecidos

Todos os bodies mutáveis implementados usam objetos estritos. Um campo não declarado retorna `400`, detalhe `Campo não permitido.` e nunca devolve seu valor. Queries que possuem filtros atuais também são estritas. Endpoints sem entrada declarada não ganharam parâmetros fictícios.

Aliases `name`/`nome` foram preservados somente em `POST /projects/from-github`, onde já eram aceitos. `REGRA_NEGOCIO`, status históricos, `null` para PR e o comportamento atual de `sprintId` foram mantidos.

## Módulos e rotas migrados

- **Projects:** criação comum/GitHub, consulta/edição, join, membros, sync settings e artifacts.
- **Requirements:** CRUD, status, confirmação, listagem de tarefas e cobertura.
- **Tasks:** CRUD, status, Requirement, PR, Commit, Issue, Kanban, movimento, histórico, métricas e coberturas.
- **GitHub:** sync e listagens de commits, PRs e issues; auth/repositories não possuem entrada.
- **Artifacts:** tipo e intervalo de datas.
- **Traceability:** IDs de matriz e detalhe.
- **Infraestrutura:** health/liveness/readiness permanecem sem schema porque não recebem entrada.

Os sete endpoints `501` não receberam validação deliberadamente. Inclusive IDs textuais continuam alcançando os handlers `501`; nenhum placeholder foi transformado em `400` ou implementado.

## Divisão HTTP e domínio

Removido dos services/controllers por ser exclusivamente HTTP:

- parsing repetido de `projectId` nos services de listagem Commit, Pull Request e Issue;
- normalização repetida de `search` nesses services e nos CRUDs de Requirement/Task;
- conversões redundantes de IDs nos controllers de membros e requisitos.

Mantido nos services:

- existência de Project, Requirement, Task e artefatos;
- pertencimento ao mesmo projeto;
- duplicidade/conflito;
- transições e confirmação de Requirement;
- PR singular e vínculos TaskCommit/TaskIssue;
- responsável/membro e atomicidade do movimento Kanban;
- defaults, recálculos, fórmulas e parsing defensivo usado por chamadas internas;
- transformação de datas para consultas Prisma.

## Verificação arquitetural

O verificador foi ampliado sem ferramenta adicional. Agora também reprova:

- schema importando controller;
- schema importando repository;
- schema importando Express;
- middleware de validação importando service.

As regras anteriores, inclusive `shared` sem domínio e frontend shared sem pages, permanecem ativas. Fixtures controladas comprovam as novas falhas; o código real passou com zero violações.

## Documentação da API e frontend

Foi criado `docs/api/API_CONTRACTS.md`, catálogo fiel a todos os métodos, caminhos, entradas, sucessos, erros, enums e placeholders. Optou-se por Markdown para não publicar uma OpenAPI parcial como definitiva.

Nenhum arquivo frontend precisou ser alterado: os formulários atuais já enviam os campos e tipos aceitos, continuam exibindo `message` e ignoram `details` com segurança. Não houve mudança visual, reorganização de páginas ou exposição indiscriminada de detalhes.

## Testes adicionados

Foram adicionados 14 testes backend:

- 8 unitários para params, body, query, coerções aceitas/proibidas, campo desconhecido, tamanho, enum, data, URL, detalhes e ausência de segredo;
- 6 HTTP para casos negativos representativos de Projects, Requirements, Tasks, GitHub, Artifacts, Traceability e preservação dos `501`.

Resultado final: 86 testes backend (43 unitários e 43 integração/API) e 15 frontend; 101 testes no total.

## Cobertura antes e depois

| Área | Momento | Statements | Branches | Functions | Lines |
|---|---|---:|---:|---:|---:|
| Backend | Antes | 71,54% | 54,49% | 73,07% | 72,64% |
| Backend | Depois | 74,42% | 57,55% | 74,88% | 75,48% |
| Frontend | Antes | 11,17% | 13,97% | 9,93% | 11,49% |
| Frontend | Depois | 11,17% | 13,97% | 9,93% | 11,49% |

A pasta `shared/validation` atingiu 93,93% de statements, 87,80% de branches, 91,66% de functions e 94,73% de lines. Nenhum schema ou middleware foi excluído da coleta.

## Validações executadas

| Comando | Resultado |
|---|---|
| Backend `npm ci` | Aprovado; 237 pacotes instalados do lockfile. |
| `npx prisma validate` | Aprovado; schema válido e inalterado. |
| `npx prisma generate` | Aprovado. |
| `npm run architecture:check` | Aprovado; zero violações no código real. |
| Backend `npm test` | 12 arquivos, 86 testes aprovados. |
| Backend `npm run test:unit` | 10 arquivos, 43 testes aprovados. |
| Backend `npm run test:integration` | 2 arquivos, 43 testes aprovados em `traceflow_test`. |
| Backend `npm run test:coverage` | Aprovado; cobertura registrada acima. |
| Backend `npm start` | Aprovado na porta 3014 e em `traceflow_test`. |
| Frontend `npm ci` | Aprovado; 180 pacotes instalados. |
| Frontend `npm test` | 6 arquivos, 15 testes aprovados. |
| Frontend `npm run test:coverage` | Aprovado. |
| Frontend `npm run build` | Aprovado; permanece aviso conhecido de chunk de 546,03 kB. |

O smoke test real confirmou health/live/ready `200`, POST válido `201`, body inválido/query inválida/ID inválido/campo desconhecido `400`, rota desconhecida `404` e placeholder com ID inválido `501`. O dado artificial foi criado somente em `traceflow_test` e removido pela limpeza determinística da suíte de integração.

## Limitações e bloqueios para E5

- O catálogo Markdown não substitui uma futura OpenAPI versionada e gerada/verificada automaticamente.
- Endpoints sem filtros definidos continuam sem paginação; a E4 não ativou defaults silenciosos.
- Os placeholders `501` são a exceção deliberada à validação de IDs.
- Alguns parsers defensivos permanecem nos services porque esses casos de uso também podem ser chamados fora de HTTP.
- A vulnerabilidade transitiva baixa de runtime em `body-parser` e a alta de desenvolvimento em `brace-expansion` devem ser avaliadas na etapa apropriada, sem `audit fix` automático.
- CORS, limite global de body, headers, rate limit, autenticação e autorização permanecem para E5 e etapas posteriores.

Não há bloqueio funcional da E4 para iniciar posteriormente a E5. A E5 não foi iniciada nesta execução.

## Confirmações de escopo

A branch permaneceu `daniel-dev`. Nenhuma migration foi criada. O schema Prisma não foi alterado. Nenhum endpoint `501` foi implementado ou removido. Nenhuma resposta de sucesso foi alterada. Nenhuma regra de negócio foi alterada. Nenhuma autenticação ou autorização foi implementada. Nenhum controle da E5 foi antecipado. Nenhum segredo ou dado pessoal é retornado em erros de validação. Nenhum mock foi incluído no runtime. Nenhum commit foi criado. Nenhum push foi realizado. Nenhum pull request foi aberto.
