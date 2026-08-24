# ADR-009 — GitHub App por instalação

**Status:** parcialmente substituído pelo ADR-012 na LR.9
**Data:** 2026-08-01

> Registro histórico: a LR.9 substituiu a autoridade pessoal `OWNER`/`ADMIN`, seu TTL e a
> reautorização OAuth. O uso de Installation Token, lifecycle, cardinalidade e proibição de PAT
> permanecem vigentes. Consulte o ADR-012 para a decisão atual.

## Contexto

O provider sistêmico anterior concentrava acesso e quota em uma credencial compartilhada. A L1 exige consentimento por instalação, prova de acesso do usuário e preservação dos projetos/artefatos existentes.

## Decisão

A única credencial operacional de sincronização é o Installation Token da GitHub App, criado sob demanda. Um User Access Token existe apenas durante callbacks autorizados: login/vínculo de identidade, comprovação da instalação e renovação da autorização pessoal de repositórios. Nenhum token é persistido.

A seleção exige duas autoridades independentes. `GitHubRepositoryAuthorization` comprova que o usuário possui `OWNER` ou `ADMIN`; a consulta com Installation Token comprova que a App possui acesso técnico. A lista e a criação/conexão usam somente a interseção. Ausência ou expiração da evidência pessoal retorna `REAUTH_REQUIRED`/`GITHUB_USER_REAUTH_REQUIRED` e nunca é preenchida por inferência da Installation. A evidência pertence ao vínculo estável `User` + `GitHubIdentity` + Installation + repositório e não à sessão HTTP. `GITHUB_REPOSITORY_AUTHORIZATION_TTL_MS` possui default de sete dias e não reutiliza o TTL curto do state OAuth; logout ou nova sessão não invalidam prova ainda válida.

`GitHubInstallation` e sua autorização guardam metadados/prova temporal. `ProjectGitHubIntegration` é a fonte canônica da conexão. Projetos anteriores ficam `RECONNECT_REQUIRED`. O callback usa state aleatório hashado, vinculado à sessão e de uso único. Webhooks assinados controlam suspensão/remoção sem disparar sync automático.

Uma instalação pode atender vários projetos, cada qual com um repositório distinto. `ProjectGitHubIntegration.projectId` e `githubRepositoryId` são únicos; `installationId` não é. Assim, a cardinalidade é `GitHubInstallation 1:N ProjectGitHubIntegration`, enquanto projeto e repositório possuem no máximo uma integração. A remoção de acesso a um repositório altera somente sua integração; adições aparecem na próxima listagem ao vivo.

## Alternativas rejeitadas

- manter PAT sistêmico como fallback: duas fontes operacionais e blast radius amplo;
- PAT por usuário/projeto: coleta e custódia desnecessária de segredo;
- confiar somente em `installation_id`: permite instalação forjada;
- persistir installation token: aumenta impacto de vazamento sem necessidade.

## Consequências

Operação precisa criar/configurar a App e seus segredos. Repositórios antigos exigem ação de OWNER. Em troca, acesso, revogação e escopo passam a seguir a instalação e tokens temporários não integram o patrimônio de dados do TRACEFLOW. Secret manager, store distribuído e validação operacional externa permanecem necessários.

Na L2, `GitHubInstallationAuthorization` também é autorização pessoal: o titular pode removê-la sem apagar instalação, projetos, integrações, artefatos ou autorizações de terceiros. A LR.3.1 acrescentou timestamps de verificação mesmo quando a consulta pessoal retorna zero repositórios. A LR.8 tornou explícita a validade duradoura e configurável dessa prova e confirmou que a renovação substitui atomicamente o snapshot OWNER/ADMIN anterior. A anonimização aplica a mesma separação.
