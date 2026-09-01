# L1.2.1 — Robustez da sincronização GitHub e refinamentos visuais

## Escopo entregue

Esta entrega substitui o acoplamento entre a duração total da sincronização e a chamada HTTP do navegador por uma execução persistida. Também adiciona lifecycle de branches, checkpoint seguro por `headSha`, progresso consultável, instrumentação estruturada e os refinamentos de UX homologados após a L1.2.

Nenhuma migration anterior, documento oficial do TCC ou roadmap foi alterado. `Commit`, `CommitBranch`, artefatos e relações de rastreabilidade foram preservados.

## Causa raiz do PCPowerLab

A causa observada foi comprovadamente o timeout de 15 segundos do frontend sobre uma operação síncrona mais longa, e não uma falha da API do GitHub.

Evidências anteriores à correção:

- o projeto PCPowerLab tinha 21 branches ativas, 115 commits canônicos, 40 pull requests e 5 issues;
- as branches foram observadas em `2026-08-10T18:18:56.671Z`;
- o backend registrou sucesso em `2026-08-10T18:19:12.964Z`, 16.293 ms depois;
- o frontend encerrava a chamada em 15.000 ms e, portanto, apresentava um falso erro de rede antes do sucesso persistido pelo backend.

A homologação após a implementação confirmou o volume que causava a duração elevada: 1.856 commits foram observados ao percorrer os históricos das 21 branches, mas correspondiam a somente 115 hashes únicos. Não houve evidência de rate limit, timeout individual do Octokit, branch inacessível, paginação incompleta ou falha de persistência.

## Arquitetura de sincronização

### Antes

`POST /api/projects/:projectId/github/sync` mantinha a requisição HTTP aberta durante repository, branches, commits, pull requests, issues e persistência. O frontend aplicava o timeout global de 15 segundos à chamada inteira.

### Depois

O mesmo POST cria `GitHubSyncRun`, responde `202` rapidamente e agenda a execução no processo do backend. `GET /api/projects/:projectId/github/sync/status` expõe somente status e progresso autorizados. O frontend consulta o status a cada 2,5 segundos e restaura uma execução `QUEUED` ou `RUNNING` após reload.

`GitHubSyncRun.activeProjectId` possui índice único e garante no banco uma execução ativa por projeto; o `Set` em memória permanece apenas como defesa adicional. Execuções `QUEUED` ou `RUNNING` sem atualização há 30 minutos são marcadas `FAILED` com `GITHUB_SYNC_STALE` na próxima solicitação/consulta. Essa política cobre processos interrompidos sem exigir Redis, RabbitMQ ou serviço externo.

O aumento do timeout global não foi utilizado.

## Otimização multibranch

- hashes já vistos na execução reutilizam o commit canônico em memória e evitam repetição da lógica cara de criação;
- `CommitBranch` continua sendo criado para cada branch, mesmo quando o hash já apareceu em outra;
- `lastSyncedHeadSha` só é gravado após a paginação e a persistência integrais da branch;
- uma branch com `headSha` igual ao último checkpoint bem-sucedido reutiliza seus vínculos persistidos sem baixar novamente o histórico;
- branch nova sempre é percorrida;
- qualquer mudança de head provoca nova leitura integral, sem assumir fast-forward, preservando segurança para merge, rebase, reset e force-push;
- falhas parciais não avançam o checkpoint da branch.

## Lifecycle de branches

Uma listagem integral e bem-sucedida pode marcar como inativa uma branch antes ativa que não foi observada. O registro, seus commits e seus vínculos não são removidos. `firstSeenAt`, `inactiveAt`, `reactivatedAt` e `reactivationCount` distinguem uma branch continuamente ativa de uma branch cuja ausência foi observada e que reapareceu com o mesmo nome.

Evolução normal do head não incrementa `reactivationCount`. Uma falha ou paginação incompleta de `listBranches` não chama a rotina de reconciliação e não produz falsa remoção.

Limitação documentada: se uma branch for removida e recriada com o mesmo nome entre duas sincronizações, sem uma observação intermediária da ausência, o TraceFlow não inventa uma reativação. O fato observado pode igualmente representar reset, rebase ou force-push.

## Instrumentação

Foram adicionados eventos estruturados sem tokens, secrets, payloads brutos ou e-mails:

- `github_sync_step_started` e `github_sync_step_completed` para repository, branches, commits, pull requests, issues e persist;
- `github_branch_sync_started` e `github_branch_sync_completed` com branch, duração, páginas e commits encontrados;
- eventos terminal de execução persistida com projeto, execução, duração e contagens.

## Homologação real

### PCPowerLab — primeira execução com checkpoint ainda vazio

| Etapa | Duração |
| --- | ---: |
| repository | 328 ms |
| branches | 324 ms |
| commits | 13.307 ms |
| pull requests | 576 ms |
| issues | 516 ms |
| persist | 7 ms |
| execução total | 15.383 ms |

| Branch | Páginas | Commits observados | Duração |
| --- | ---: | ---: | ---: |
| `main` | 2 | 112 | 982 ms |
| `feat/frontend-retro-arcade` | 2 | 115 | 1.084 ms |
| `PCPOW-22-US-21-Consultar-configurações-prontas-por-perfil-de-uso` | 1 | 71 | 510 ms |
| `PCPOW-23-US-22-Registrar-histórico-de-análises-realizadas-em-uma-configuração` | 1 | 69 | 550 ms |
| `PCPOW-24-us-23-calcular-nota-geral-da-configuracao-montada` | 1 | 63 | 414 ms |
| `PCPOW-25-US-24-Gerar-alternativas-automáticas-para-corrigir-incompatibilidades` | 1 | 65 | 408 ms |
| `PCPOW-26-US-25-Recomendar-configurações-completas-por-faixa-de-orçamento` | 1 | 61 | 440 ms |
| `PCPOW-27-us-26-simular-desempenho-da-configuracao-em-softwares-profissionais` | 1 | 79 | 366 ms |
| `PCPOW-28-US-27-Comparar-desempenho-estimado-entre-jogos-selecionados` | 1 | 67 | 418 ms |
| `PCPOW-29-US-28-Classificação-de-componentes-por-custo-benefício` | 1 | 87 | 439 ms |
| `PCPOW-29-US-28-Classificar-componentes-por-custo-benefício` | 1 | 73 | 528 ms |
| `PCPOW-30-us-29-criar-perfis-de-uso-personalizados-para-recomendacao` | 1 | 81 | 481 ms |
| `PCPOW-31-US-30-Registrar-versões-de-configurações-salvas` | 2 | 109 | 881 ms |
| `PCPOW-32-US-31-Geração-de-relatório-técnico-da-configuração-em-formato-estruturado` | 1 | 93 | 511 ms |
| `PCPOW-32-US-31-Gerar-relatório-técnico-da-configuração-em-formato-estruturado` | 1 | 75 | 513 ms |
| `PCPOW-33-us-32-notificar-quando-uma-configuracao-salva-se-tornar-incompativel-por-atualizacao-da-base` | 2 | 111 | 806 ms |
| `PCPOW-34-US-33-Exportar-configuração-montada-em-JSON-para-compartilhamento-externo` | 2 | 107 | 1.006 ms |
| `PCPOW-35-US-34-Registrar-avaliações-dos-usuários-sobre-recomendações-recebidas` | 2 | 104 | 760 ms |
| `PCPOW-36-US-35-Sugerir-próximos-upgrades-em-etapas-para-uma-configuração-existente` | 1 | 99 | 600 ms |
| `reaplicar-pcpow-36` | 2 | 102 | 845 ms |
| `refactor/revisao-geral-pcpowerlab` | 2 | 113 | 759 ms |

Resultado: `SUCCEEDED`, 21/21 branches, 29 páginas, 1.856 observações entre branches, 115 commits únicos, 0 commits novos, 40 PRs encontrados/atualizados e 5 issues encontradas/atualizadas.

### PCPowerLab — repetição idempotente

A criação da execução levou 6 ms. As 21 branches mantinham o mesmo head, todas reutilizaram o checkpoint e nenhuma página de commits foi solicitada. A etapa de commits caiu para 120 ms e o total para 2.441 ms, preservando 115 commits únicos e as 1.856 relações observadas. O resultado foi `SUCCEEDED`, sem novos commits ou vínculos.

### TRACEFLOW QA

A execução foi criada em 6 ms e terminou `SUCCEEDED` em 5.289 ms: 4/4 branches, 8 páginas, 411 observações, 110 commits únicos, 11 PRs e nenhuma issue. Nenhum artefato novo foi criado e os 11 PRs existentes foram atualizados.

## UX

- o resumo de sucesso começa por `Branches: N encontradas, N ativas`, sem tratar branch como artefato;
- o card `Branches` e o filtro permanecem; a opção default usa discretamente `— padrão`;
- o painel redundante “Branches do repositório” foi removido;
- `PasswordField` só renderiza o asterisco e `required`/`aria-required` quando `required` é verdadeiro;
- o indicador permanece inline no label e é `aria-hidden`;
- o botão Mostrar/Ocultar usa centralização vertical pelo container flex e posicionamento a 50% da altura do campo.

## Banco e migration

A nova migration é `20260810190000_l1_2_1_github_sync_robustness`. Ela adiciona somente os campos de lifecycle/checkpoint e `GitHubSyncRun`, com índices e chaves estrangeiras. Foi aplicada com sucesso tanto no banco isolado `traceflow_test` quanto no banco de desenvolvimento. A migration `20260810120000_l1_2_github_multibranch` e todas as anteriores permaneceram intactas.

## Testes e gates

- backend unitário: 189/189;
- backend integração/API: 132/132;
- backend cobertura completa: 321/321; statements 86,16%, branches 72,83%, functions 88,56%, lines 88,54%;
- frontend: 138/138;
- frontend cobertura: statements 55,16%, branches 54,42%, functions 46,32%, lines 56,70%;
- lint, Prettier, arquitetura, secrets, build, Prisma format/validate/generate e migrations passaram;
- testes dedicados cobrem 30 segundos de execução, 25 branches compartilhando commits, deduplicação, todos os vínculos, progresso, exclusão mútua persistida, stale run, remoção, falha de listagem, reativação e evolução normal do head.

A primeira execução dos unitários no sandbox falhou apenas porque o ambiente bloqueou o bind efêmero do Supertest com `EPERM`. A mesma suíte, repetida com permissão de bind, passou integralmente.

## Validação visual

Os testes DOM confirmam card e filtro presentes, painel redundante ausente, mensagem com branches, asterisco condicional, semântica `required` e botão Mostrar/Ocultar. A conexão com um navegador não estava disponível nesta sessão; por isso desktop, largura pequena, erro, disabled e reload durante uma execução real não são declarados como homologação visual manual concluída.
