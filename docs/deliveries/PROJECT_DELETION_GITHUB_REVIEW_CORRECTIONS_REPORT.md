# Project deletion — correções dos comentários de code review CR-01…CR-05

Data: 22/09/2026. Resultado: **PROJECT DELETION GITHUB REVIEW CORRECTIONS — PASS LOCAL**.
Esta rodada não incluiu commit, push, alteração de migration ou resolução de threads no GitHub.

## Baseline

- Branch `daniel-dev`; HEAD inicial `ecc3db46ee53888def791015282bbc8b6efa18dc`.
- Working tree inicial limpo; `git diff --check` e `git diff --stat` sem saída.
- Node 22.23.2, versão declarada na CI. Schema Prisma e as 57 migrations existentes não foram alterados.
- A reprodução e os gates de banco usaram exclusivamente o schema descartável
  `traceflow_cr_review_20260922_test` em MySQL localhost. Antes da criação foram confirmados
  `NODE_ENV=test`, host local, nome distinto do banco de desenvolvimento, inexistência do schema
  alvo e `read_only=0`. Nenhum banco existente foi resetado.

## CR-01 — access code e role após soft delete

**Finding válido.** `findConfiguration()` filtrava `deletedAt`, mas `regenerate()` e `updateRole()`
faziam `prisma.project.update` fora da fronteira de lifecycle. Em MySQL real, as duas regressões
falharam antes da correção: leitura ativa, pausa por `deferred`, soft delete confirmado, continuação
do write e alteração de Project deletado.

Ambas as mutations agora usam `withActiveProjectWrite`: a transação adquire lock da linha Project,
confirma `deletedAt === null` e só então atualiza. As regressões passaram depois da mudança,
com 404 opaco e `accessCode`/`accessCodeRole` inalterados. O caminho normal com Project ativo
também passou.

`join(accessCode)` foi auditado. Ele já lê `deletedAt` e cria Membership dentro da **mesma**
transação `Serializable`; a leitura serializável e o update de soft delete sobre a mesma linha
Project têm ordem de commit, de modo que uma Membership não pode ser criada depois de um delete
confirmado a partir de uma leitura anterior. O teste em MySQL confirmou que join após delete
retorna `invalidCode` e não cria Membership. Nenhuma mudança em `join` foi necessária.

## CR-02 — convite criado depois do soft delete

**Finding válido.** `findProjectById()` verificava estado ativo antes de
`createUnlessPending()`, mas a transação que criava o convite não repetia essa autoridade. A
regressão falhou antes da correção e criou um novo convite pendente após a revogação do delete.

`createUnlessPending()` agora adquire `lockProjectLifecycle(tx, projectId)` **antes** das leituras
de Membership/convites, lê `deletedAt` sob o mesmo lock e retorna `projectUnavailable` sem criar
convite se o projeto não estiver ativo. O service converte esse resultado no 404 opaco já usado
para convite/projeto indisponível, antes de qualquer e-mail ou auditoria. Testes cobrem a corrida,
ausência de efeitos de entrega e a criação normal em projeto ativo.

`accept()` já segue Project → Membership e verifica `deletedAt` dentro da transação.
`revoke()` e `decline()` só atualizam convites ainda pendentes (`revokedAt: null`);
`requestDeletion()` revoga esses convites na própria transação do delete. Assim, chamadas tardias
não reativam nem criam convite, e não houve evidência de invariável adicional violada que
justificasse ampliar o diff.

## CR-03 — edição de Project após soft delete

**Finding válido.** `findById()` filtrava Project ativo, mas `updateProject()` fazia update por
ID sem revalidar lifecycle. A regressão em MySQL falhou antes da correção, mudando nome,
descrição e status depois do delete. `updateProject()` agora reutiliza
`withActiveProjectWrite`; após delete retorna 404 sem alterar os campos, e a edição normal de
Project ativo continua funcional. `findByIdIncludingDeleted()` permaneceu intacto por servir
ao fluxo explícito de recuperação.

### Auditoria global de writes diretos em Project

Busca em `backend/src` por `project.update`, `updateMany`, `upsert`, `create` e `createMany`:

| Ocorrência                                                 | Classificação    | Resultado                                             |
| ---------------------------------------------------------- | ---------------- | ----------------------------------------------------- |
| `project-access-code.repository.js`: regenerate/updateRole | C — write normal | Migrados para `withActiveProjectWrite`                |
| `project.repository.js`: updateProject                     | C — write normal | Migrado para `withActiveProjectWrite`                 |
| `project.repository.js`: três `create`                     | B — criação      | Sem Project anterior para validar                     |
| `project-deletion.repository.js`: requestDeletion          | A — lifecycle    | Project lock, OWNER e `deletedAt: null` na transação  |
| `project-deletion.repository.js`: restore                  | A/B — recovery   | Project lock, OWNER e estado pending na transação     |
| `project-deletion.repository.js`: claimPurge/releasePurge  | A/B — purge      | Claim sob lock; release condicionado a `purgeClaimId` |

Os writes normais de `ProjectGitHubIntegration` já eram protegidos por
`withActiveProjectWrite` e não foram alterados. Os novos fluxos mantêm ordem de lock **Project
→ Membership/Invitation**, compatível com delete, restore, purge e accept; não foi introduzida
ordem Membership → Project. A arquitetura Route → Controller → Service → Repository → Prisma
permaneceu.

## CR-04 — seleção de repositório indisponível

**Finding válido.** `pendingDeletion` truthy podia anular o `disabled` de
`selectable: false` para um não OWNER. O `<option>` agora usa diretamente
`disabled={!normalizedRepository.selectable}`, sem reinterpretar autorização no frontend.
Quatro assertions explícitas de `option.disabled` cobrem repositório normal (habilitado),
pending deletion do OWNER com `selectable: true` (habilitado), pending deletion restrito
(desabilitado) e repositório já conectado a outro projeto (desabilitado). O caso restrito falhou
antes da mudança e passou depois.

## CR-05 — tabela de retenção em Markdown

**Finding válido.** As linhas “e-mails técnicos” e “backup” estavam depois do heading de
exclusão, fora da tabela. Elas foram movidas, sem alteração de conteúdo, para logo após “logs”
e antes do heading. O parser Markdown usado pelo Prettier reconheceu **uma tabela com 20 rows**,
incluindo ambas as linhas, antes de `## Exclusão e recuperação de projeto`, e zero parágrafos
órfãos iniciados por `|`. O check de formatação passou. Não foi feita homologação visual em
renderizador externo; a inspeção foi estrutural pelo AST Markdown.

## Provas e gates locais

| Gate                                                                    | Resultado                                                                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Regressões CR-01/02/03 em MySQL real                                    | 4 falhas reproduzidas antes; 4 PASS após fix, sem sleep; caminhos ativos e join também PASS |
| Focused backend (CR, access L5.1, invitation delivery)                  | 16 PASS / 3 arquivos                                                                        |
| Focused PD-01/02/03 (purge, authz, sync, API)                           | 30 PASS / 4 arquivos; corrida de purge já verificada também no full                         |
| Backend unit                                                            | 786 PASS / 67 arquivos                                                                      |
| Backend integration/API                                                 | 542 PASS, 5 skips legados / 39 arquivos                                                     |
| Backend full + coverage                                                 | 1.328 PASS, 5 skips legados; statements 90,97%, branches 82,48%, lines 93,56%               |
| Focused frontend (ProjectForm, ProjectsPage/Admin, catálogo/transporte) | 46 PASS / 5 arquivos; inclui PD-05/06                                                       |
| Frontend full + coverage                                                | 1.219 PASS / 99 arquivos; statements 83,65%, branches 78,25%, lines 86,12%                  |
| Backend/frontend lint e `format:check`                                  | PASS                                                                                        |
| Frontend build                                                          | PASS; avisos não bloqueantes de bundle/IIFE                                                 |
| Prisma validate/generate/status                                         | PASS; 57 migrations, schema de teste atualizado                                             |
| Architecture, secrets, audit policy                                     | PASS; policy 5/5; backend/frontend 0 high/critical                                          |
| `git diff --check`                                                      | PASS                                                                                        |

As suítes com MySQL rodaram sequencialmente para não compartilhar fixtures em execução.
Os testes de PD-05 e PD-06 em `ProjectsPage`/`ProjectsCatalogTransport`, e os de PD-01 a PD-03
em concorrência, sync e API, permaneceram verdes. Nenhum skip novo foi adicionado.

## Limites e veredicto

Não houve CI remoto, revalidação independente do diff, inspeção visual de browser para esta
rodada ou resolução de threads na PR. A prova de Markdown foi de parser/estrutura, não de
homologação visual. Esses limites não alteram a evidência local das cinco correções; a próxima
etapa é a revalidação final independente da PR.

**PROJECT DELETION GITHUB REVIEW CORRECTIONS — PASS LOCAL**.
