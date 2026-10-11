# GITHUB-03 — Project GitHub Integration Management & UX

## 1. Baseline

- Checkout: `/Users/daniel/Coding/Traceflow`.
- Branch conferida: `daniel-dev`.
- HEAD inicial: `1abb750cad061990c40a671c4d8d6ef86b74a14a`.
- `git status --short`: vazio; `git diff --check`: PASS antes das edições.
- Shell inicial: Node 26.10.0 / npm 11.19.1. Implementação validada com Node
  **22.23.3** / npm **10.9.9**, por PATH explícito.
- GITHUB-01 e GITHUB-02 já estavam no HEAD; seus resultados anteriores não foram usados
  como resultados desta rodada. Nenhum commit, push, merge, rebase, reset, clean ou stash.

## 2. Escopo

Completar RF01/RF02/RF21/RF22 na interface: cadastro opcional, configuração da integração,
vinculação posterior e controles existentes de sincronização. Sem troca/desvinculação de
repositório, novas regras de domínio, indicadores, dependências, endpoints ou deploy.
**No migration required.** Backend, schema e políticas de autorização não foram alterados.

## 3. Auditoria visual e arquitetural

Antes das edições: README, CONTRIBUTING, Design System, UI Surface Inventory,
FRONTEND_STRUCTURE, SYSTEM_ARCHITECTURE, API_CONTRACTS, AUTHORIZATION_MATRIX e relatórios
GITHUB-01/02 foram confrontados com os owners reais.

| Surface | Baseline e decisão |
| --- | --- |
| Projects / NewProjectDialog | Cadastro opcional funcional; seletor nativo e catálogo agregado por instalações autorizadas |
| ProjectForm | Seletor acoplado ao formulário; extração pequena mantendo apresentação e regras de reserva |
| ProjectEditScreen | Página OWNER-only já existente; dados gerais e zona de perigo; comporta seção GitHub |
| ProjectDetailsScreen | Resumo GitHub e sync MANAGER+; completar CTA contextual sem criar outra configuração |
| RepositoryInfoScreen | Catálogo não distinguia ausência de integração de zero artefatos; consultar Project canônico |
| User Settings | Referência C2: surface integrada, seções, metadados, ações e feedback separados |

## 4. Reutilização de componentes

`GitHubRepositorySelector` extrai o seletor existente. Cadastro e vínculo usam a mesma
apresentação, seleção, informação de reserva, loading, vazio e erro. Busca textual e filtro
por conta autorizada atuam sobre o catálogo agregado existente: cada opção conserva o ID da
instalação autorizada. Não há outra descoberta GitHub ou integração por URL/PAT.

`useGithubRepositoryCatalog` compartilha as consultas, normalização, cancelamento e tratamento
de reservas já existentes. Os overlays de purge/recuperação de Projects foram preservados.
FeedbackRegion, inputs/selects/buttons, BackButton e tokens Hybrid C2 permanecem canônicos.

## 5. Configurações do projeto

Rota existente `/projects/:projectId/edit`, sem página nova. Uma surface agrupa Dados do projeto
e Integração GitHub; zona de perigo continua separada. Cada operação possui submit próprio.
O vínculo não envia nome/descrição/equipe; salvar dados gerais não escreve configuração GitHub.
O formulário geral mantém seu draft durante atualização da seção de integração.

## 6. GitHub não conectado

Ausência da relação apresenta `Não conectado`, explicação compacta e CTA para OWNER.
Nenhum run de sync é consultado sem integração; não existe integração fictícia ou score zero.
A seleção só consulta GitHub quando aberta. Falta de App, catálogo vazio ou indisponível
recebe orientação para a rota funcional `/settings/integrations`.

## 7. Fluxo de vinculação posterior

Conectar repositório → filtrar conta autorizada/buscar → selecionar → conferir full name →
Vincular repositório. Seleção inline, sem wizard ou confirmação duplicada. Cancelar/Escape
fecham a seleção e devolvem foco; sucesso dirige foco ao heading estável. Lock síncrono e
estado busy impedem duplo submit. Repositórios indisponíveis permanecem não selecionáveis.

## 8. Endpoint GITHUB-02

Reutilizado `PUT /api/projects/:projectId/github/integration`, com somente
`githubInstallationId` e `githubRepositoryId`. A UI aplica imediatamente a integração da
resposta confirmada e distingue `initialSync` do vínculo. Não foi criado POST paralelo.
Erros usam normalizeApiError; conflito não revela metadata privada de outro projeto.
Sem alteração de contrato HTTP, não foi necessária edição de API_CONTRACTS.

## 9. GitHub conectado

Exibe repositório, link externo seguro, branch padrão, estado da integração, último sucesso e
última tentativa. IDs internos, installation IDs e run IDs não são conteúdo permanente da UI.
ACTIVE é Conectado; RECONNECT_REQUIRED é Reconexão necessária; DISCONNECTED é Integração
inativa. Reconexão legada reutiliza a identidade/reserva protegida pelo backend; não há troca.

## 10. Estados de sincronização

PENDENTE/QUEUED, RUNNING/SINCRONIZANDO, SUCCEEDED/SINCRONIZADO e FAILED/FALHA possuem feedback
textual. Falha preserva `Conectado` e os artefatos; consulta de progresso indisponível é
apresentada separadamente e oferece consulta explícita. Nenhuma conclusão é inferida do 202.

## 11. Sincronização manual

POST e GET de status existentes. Polling a cada 2,5 s apenas para run ativo; erro de consulta
interrompe o polling e permite retry explícito. Conclusão reconcilia metadata com GET fresco.
OWNER/MANAGER sincronizam integração ACTIVE; MEMBER/VIEWER não recebem a ação. O Overview
preserva o sync existente e deixa de oferecê-lo para integração inativa.

## 12. Sincronização automática

PATCH existente com `{githubAutoSyncEnabled:boolean}`. Checkbox nativo com label clicável
reflete somente o valor confirmado; falha mantém o estado anterior e mostra erro. OWNER-only.

**Limitação preexistente confirmada no código:** autoSyncEnabled é uma preferência persistida;
não existe scheduler periódico que a execute. A UI informa isso junto ao controle e mantém
sincronização manual disponível. Esta entrega não inventa execução automática, intervalo ou worker.

## 13. Overview

Resumo preservado. Sem integração, OWNER recebe Conectar repositório com destino
`/projects/:id/edit#github-integration`. Demais papéis veem somente o estado. A configuração
detalhada não foi duplicada na Visão Geral. Health e semânticas de dados permanecem intactos.

## 14. Repository

Consulta Project e membership autorizados pelos clients existentes, além do catálogo.
Sem integração: estado compacto próprio e CTA Configurar integração somente para OWNER.
Com integração: tabelas, filtros, branches e links permanecem. Falha de sync adiciona aviso
sem esconder artefatos. Falha de membership não concede ação OWNER. Nenhum novo DTO backend.

## 15. Permissões

Edição continua OWNER-only. Leitores usam Overview/Repository; MANAGER mantém sync no Overview.
O componente de integração também testa as policies próprias de cada ação. Backend permanece
autoridade para sessão, verificação de e-mail, CSRF, membership, 404 opaco e OWNER transacional.
Regressão reutiliza as suítes existentes de GITHUB-02 e lifecycle; não duplica essas invariantes.

## 16. Consistência assíncrona

Screens de edição/repositório são remontadas por projectId. AbortSignal, geração de leitura e
lock de mutation protegem o contexto e invalidam consultas anteriores. Refresh confirmado usa
`fresh:true`, evitando coalescer com GET iniciado antes da mutation. Status também usa leitura
fresca. Mutation confirmada mantém sucesso mesmo com GET falho; retry repete só a consulta.
Respostas atrasadas de conexão, preferência, refresh e status de A não alteram B.

## 17. Acessibilidade

Labels associados, select e checkbox nativos, mensagens semânticas, loading textual e busy.
Hash direciona foco ao título; Cancelar/Escape retornam ao trigger e sucesso mantém foco útil.
Tab, Shift+Tab, Enter, Space e Escape passaram no navegador nas seis combinações da matriz.
Busca e seleção usam controles existentes; sem status somente por cor.

## 18. Responsividade

Matriz runtime PASS: 1440 × 900, 768 × 1024 e 390 × 844, em Light e Dark. Layout por largura útil,
metadata em grid intrínseco, wrap de nomes longos e ações de 44px. Sem nova arquitetura de layout.

## 19. Light/Dark

Tokens semânticos atuais; mesma composição e interação nos dois temas. Inspeção runtime direta
via Chromium/DOM/CSS computado, sem screenshots, arquivos de imagem ou pastas de evidência.
O inventário registra TECHNICALLY VERIFIED; não herda VISUALLY APPROVED de layouts anteriores.

## 20. Testes frontend

Focados: **6 arquivos / 112 testes PASS** nesta rodada. Cobrem cadastro, administração, Overview,
Repository, API e 29 casos de configuração GitHub: permissões, descoberta, filtro/busca/reserva,
conflitos 403/404/409/503, conexão, duplo clique, refresh falho, sync/polling/retry,
preferência e corridas de contexto/leitura. Fixtures antigas foram atualizadas ao DTO real
(status ACTIVE explícito e Project/membership para Repository), sem relaxar asserts funcionais.

Frontend completo com cobertura: **119 arquivos / 1.468 testes PASS**. Coverage: statements
86,02%; branches 80,84%; functions 81,87%; lines 88,50%. Thresholds canônicos mantidos.

## 21. Testes backend

Focados: **11 arquivos / 181 testes PASS**. Backend completo com cobertura: **148 arquivos PASS,
1.775 testes PASS e 2 arquivos / 5 skips preexistentes**. Nenhum skip novo ou timeout/retry alterado.
Coverage: statements 92,62%; branches 86,95%; functions 95,68%; lines 94,90%.

## 22. Banco isolado

Guarda TEST_DATABASE_URL obrigatória e distinta conferida antes de executar. Alvos sanitizados:
`localhost:3306/traceflow` (desenvolvimento) e `localhost:3306/traceflow_test` (teste).
Prisma de teste usa explicitamente o datasource isolado; a limpeza canônica verifica DATABASE()
na mesma transação. Harness também confere a conexão real antes de criar fixtures.
Nenhum teste, seed, cleanup ou migration mutável foi executado no banco de desenvolvimento.

## 23. Gates completos

| Gate | Resultado desta rodada |
| --- | --- |
| Backend tests + coverage | PASS; 1.775 testes, 5 skips preexistentes |
| Frontend tests + coverage, execução serial | PASS; 1.468 testes |
| Lint e format:check, ambos | PASS |
| Frontend build | PASS; avisos preexistentes de ELK/eval e chunks grandes |
| Prisma validate/generate 6.12.0 | PASS |
| db:test:migrate/status | PASS; 64 migrations, nenhuma nova |
| Auditoria de schema isolado | SCHEMA_CONSISTENT; zero órfãos e projetos sem OWNER |
| Architecture | PASS |
| Security/secrets | PASS |
| Política local CI/audit/inventário | 86 testes PASS |
| Formatação workflow/scripts/política de audit | PASS |
| npm audit backend/frontend | 0 HIGH, 0 CRITICAL, zero exceções utilizadas |
| git diff --check | PASS após remover uma linha em branco extra no fim do CSS |

Logs textuais desta rodada estão em `/tmp/traceflow-github03-*.log`; o relatório versionado
registra os resultados sem depender de capturas ou artefatos binários.
O sandbox bloqueou inicialmente MySQL/listener; comandos foram reexecutados com autorização
para acesso local, sem mudar guards ou timeouts de testes. Cobertura é a execução completa
canônica de testes, conforme CONTRIBUTING, sem duplicar a suíte integral desnecessariamente.

## 24. Limitações

- Scheduler automático não implementado anteriormente; preferência e limitação apresentadas.
- GitHub externo controlado no harness; não houve escrita em conta/instalação GitHub real.
- MySQL local informa 26.7.0, diferente da imagem mysql:8.4.8 da CI: não se declara CI-equivalent.
- Dependency Review/CI remota, OCI, deploy e homologação de produção não executados.
- Sem auditoria visual completa, leitores de tela, dispositivo físico ou outros browsers.
- Sem troca/desvinculação de repositório; sem fila durável adicional para o worker existente.

## 25. Validação integrada GITHUB-01/02/03

Harness temporário usa UI real → client HTTP/CSRF → Express → services/repositories → Prisma
em TEST_DATABASE_URL, com scheduler padrão e apenas client GitHub externo controlado.
**PASS nas seis combinações** 1440/768/390 × Light/Dark: 54 registros de verificação,
sendo 48 inspeções de layout/controles/tema e 6 grupos completos A/B/C/D.

| Fluxo | Evidência runtime |
| --- | --- |
| A — criar com GitHub | Cadastro original, Overview, edição com repositório, sync manual e catálogo importado |
| B — criar sem GitHub e vincular | Sem App na criação; Overview/Repository não conectados; CTA com hash/foco; seleção por conta/busca; PUT real confirmado |
| C — preservar dados locais | Requirement, Task e Sprint criados pela API; comparação exata de Project, membership e registros antes/depois do vínculo |
| D — falha inicial e retry | Worker padrão falha em Issues após commits/PRs; integração e dados permanecem; retry pela UI conclui sem duplicar artefatos |

Além disso: preferência habilitada/desabilitada via Space, conferida no banco e após reload;
Tab/Shift+Tab/Enter/Escape; draft de descrição preservado durante vínculo; edição geral sem
alterar a integração; nenhum pageerror. Harness controlou somente o client GitHub externo.
Nenhuma conta, instalação ou repositório GitHub real foi modificado.

A preparação do harness corrigiu a assinatura da simulação de falha externa e um seletor textual
exato do textarea preenchido. A matriz final foi executada integralmente após essas correções,
sem aumento de timeout ou retries para mascarar falhas.

## 26. Final verdict

**GITHUB-03 PROJECT GITHUB INTEGRATION MANAGEMENT & UX — PASS LOCAL**

**GITHUB OPTIONAL INTEGRATION — COMPLETE LOCAL**

GITHUB-01/02/03 estão integrados e validados localmente. A limitação preexistente de execução
automática é explícita: configurar a preferência não cria um scheduler. Sem novas migrations,
sem alteração de permissões e sem uso do banco de desenvolvimento pelos testes.

Nenhum deploy, commit ou push. OCI, CI remota e homologação de produção permanecem fora deste
resultado. Sugestão de commit: `feat: complete optional GitHub integration management`.
Trabalho encerrado nesta entrega; não iniciar OCI automaticamente.
