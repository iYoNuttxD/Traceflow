# ADR-009 — GitHub App por instalação

**Status:** aceito na L1  
**Data:** 2026-08-01

## Contexto

O provider sistêmico anterior concentrava acesso e quota em uma credencial compartilhada. A L1 exige consentimento por instalação, prova de acesso do usuário e preservação dos projetos/artefatos existentes.

## Decisão

A única autenticação operacional para leitura de repositórios é GitHub App. Um user access token existe apenas durante o callback para comprovar que a instalação aparece entre as instalações acessíveis ao usuário. Toda leitura posterior usa installation access token criado sob demanda. Nenhum token é persistido.

`GitHubInstallation` e sua autorização guardam metadados/prova temporal. `ProjectGitHubIntegration` é a fonte canônica da conexão. Projetos anteriores ficam `RECONNECT_REQUIRED`. O callback usa state aleatório hashado, vinculado à sessão e de uso único. Webhooks assinados controlam suspensão/remoção sem disparar sync automático.

Uma instalação pode atender vários projetos, cada qual com um repositório distinto. `ProjectGitHubIntegration.projectId` e `githubRepositoryId` são únicos; `installationId` não é. Assim, a cardinalidade é `GitHubInstallation 1:N ProjectGitHubIntegration`, enquanto projeto e repositório possuem no máximo uma integração. A remoção de acesso a um repositório altera somente sua integração; adições aparecem na próxima listagem ao vivo.

## Alternativas rejeitadas

- manter PAT sistêmico como fallback: duas fontes operacionais e blast radius amplo;
- PAT por usuário/projeto: coleta e custódia desnecessária de segredo;
- confiar somente em `installation_id`: permite instalação forjada;
- persistir installation token: aumenta impacto de vazamento sem necessidade.

## Consequências

Operação precisa criar/configurar a App e seus segredos. Repositórios antigos exigem ação de OWNER. Em troca, acesso, revogação e escopo passam a seguir a instalação e tokens temporários não integram o patrimônio de dados do TRACEFLOW. Secret manager, store distribuído e validação operacional externa permanecem necessários.
