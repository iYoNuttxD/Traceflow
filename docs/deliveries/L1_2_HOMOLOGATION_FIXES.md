# L1.2 — Correções de homologação e rastreabilidade multibranch

## Escopo

Esta entrega estabiliza os fluxos homologados em L1, L2 e L1.1, refina o feedback das telas de autenticação/configurações/projetos e amplia a integração GitHub para representar todas as branches autorizadas. A identidade de login GitHub continua separada da autorização da GitHub App.

## Defeitos de homologação

| DEF | Correção | Cobertura automatizada |
| --- | --- | --- |
| DEF-001 | O token CSRF passa a ser determinístico por sessão, derivado com HMAC-SHA256 do hash secreto da sessão. Abas da mesma sessão recebem o mesmo token; outra sessão, token inválido ou sessão revogada continuam rejeitados. | API de autorização com três abas, isolamento entre sessões, token inválido e revogação. |
| DEF-002 | A confirmação de e-mail atualiza o `AuthContext` quando o usuário confirmado é a conta autenticada. | Teste de confirmação e refresh da conta correspondente. |
| DEF-003 | Senha atual incorreta retorna `403 CURRENT_PASSWORD_INVALID`; o interceptor só encerra autenticação para códigos canônicos de sessão em respostas 401. | E-mail, senha, desativação, exclusão e vínculo GitHub preservam a sessão após erro de senha. |
| DEF-004 | Login e cadastro locais preservam `pathname`, query e hash. `GuestOnlyRoute` aguarda a resolução da sessão e usa somente retorno interno sanitizado. | Login, cadastro, convite, URL maliciosa e corrida de carregamento. |
| DEF-005 | A requisição GET compartilhada mantém assinantes independentes; o cancelamento do primeiro consumidor não cancela o segundo. A tela também encerra o estado inicial se não houver resultado. | Requisição concorrente no padrão StrictMode e tela de repositório. |
| DEF-006 | A criação da primeira senha exibe erro explícito no campo de confirmação e o remove ao editar. | Teste de divergência e limpeza do erro. |
| DEF-008 | Uma conta `ACTIVE` que acessa `/restricted` é redirecionada para `/projects`. | Teste de rota protegida. |

DEF-007 foi reclassificado como comportamento esperado. Depois da anonimização, a identidade anterior foi apagada; um novo login GitHub pode criar uma nova conta `ACTIVE`, sem recuperar qualquer dado antigo, e deve seguir para `/projects`.

## Feedback e campos de senha

`FeedbackRegion` possui variantes semânticas `success`, `info`, `warning`, `error` e `rate-limit`, com ícone, `role`, região viva e contagem regressiva quando aplicável. Verificação pendente, envio concluído e limitação de taxa têm apresentação distinta.

Todos os campos de senha do frontend usam `PasswordField`, com ação mostrar/ocultar acessível. Indicador de força e requisitos aparece apenas para senha nova. A troca de senha confirma visualmente o sucesso e informa o encerramento das outras sessões.

## Projetos e GitHub App

O cabeçalho de cadastro de projeto mostra o estado da GitHub App e `accountLogin`. Sem autorização, o indicador funciona como CTA para Integrações. O seletor técnico de instalação foi removido da interface.

`GET /api/github/app/repositories?projectId=<id opcional>` agrega, pagina e deduplica por ID os repositórios de todas as instalações `ACTIVE` autorizadas ao usuário. Cada item carrega internamente `githubInstallationId` e `accountLogin`; assim, a instalação correta continua sendo enviada na criação sem ser uma escolha do usuário.

Repositórios já vinculados permanecem visíveis e selecionáveis para descoberta. Ao selecioná-los, o formulário não submete: apresenta aviso inline e permite abrir/destacar o projeto existente quando o usuário possui membership. O backend mantém a constraint/conflito como proteção contra corrida; dados de outro projeto só são expostos quando o solicitante está autorizado.

## Arquitetura multibranch

- `GitBranch` representa nome, SHA da ponta, branch padrão, atividade e última observação por projeto;
- `CommitBranch` implementa a relação N:N entre commit canônico e branch;
- `Commit.branch` foi preservado durante a transição e nenhuma relação de rastreabilidade foi removida;
- branches são listadas de forma paginada e sincronizadas antes dos commits;
- cada branch ativa é percorrida sequencialmente; commits são deduplicados pela chave existente `(projectId, hash)` e recebem vínculos idempotentes;
- uma branch ausente na observação seguinte fica inativa, sem apagar branch, commit ou vínculo histórico;
- pull requests são coletadas em todos os destinos, preservando `sourceBranch` e `targetBranch`;
- o filtro `branch` consulta vínculos de commit e origem/destino de PR; issues permanecem escopo do repositório e a UI informa essa semântica.

Uma falha ao buscar branches não inativa todas as branches por engano. Uma falha posterior interrompe o sync, preserva os lotes já persistidos, mantém o último sucesso e registra o estado/auditoria de falha com mensagem sanitizada.

## Migration e backfill

A migration incremental é `20260810120000_l1_2_github_multibranch`. Ela cria somente `GitBranch`, `CommitBranch`, índices e chaves estrangeiras. O backfill:

1. cria uma branch distinta para cada `(projectId, Commit.branch)` legado não vazio;
2. identifica a default por `Project.githubDefaultBranch`;
3. cria o vínculo entre cada commit legado e sua branch;
4. não contém `DROP`, `DELETE` ou `TRUNCATE`.

Nenhuma migration anterior foi alterada. O teste de integração executa os `INSERT ... SELECT` reais do backfill no banco isolado e confirma contagens invariantes na fixture: `Project 1 → 1`, `Commit 1 → 1`, `PullRequest 1 → 1` e `Issue 1 → 1`, além da branch default e do vínculo esperados.

## Contratos alterados

- `GET /api/auth/csrf`: retorna novamente o token estável da sessão atual;
- erros de confirmação de senha: `403` com `CURRENT_PASSWORD_INVALID`;
- `GET /api/github/app/repositories`: lista agregada das instalações autorizadas;
- consultas de artefatos e GitHub aceitam `branch` opcional;
- DTO do repositório inclui branch padrão e branches ativas;
- metadata de commit inclui `branches`; metadata de PR preserva origem e destino;
- resumo de commits preserva `found` e adiciona `foundAcrossBranches`, `unique` e `linksCreated`.

## Testes

As suítes incluem contratos de CSRF/sessão, confirmação de senha, retorno local, rotas de conta, feedback acessível, campos de senha, seleção agregada de repositórios, estado inicial da tela, boundary paginada do GitHub, schema/migration, backfill com contagens, sync multibranch, deduplicação, merge, idempotência e inativação sem perda histórica.

O OAuth real, a configuração externa da GitHub App e a inspeção visual/manual continuam validações operacionais separadas dos gates automatizados.
