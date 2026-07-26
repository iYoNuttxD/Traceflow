# E6 — Identidade, sessão e autorização por projeto

## Identificação e estado

- Branch: `daniel-dev`
- Commit inicial da continuação: `77aeec998308c843ce6891c6a1d6e03e646e9d63`
- Data: 24/07/2026
- Estado inicial: árvore limpa e sincronizada com `origin/daniel-dev`; nenhuma alteração preexistente
- Estado final: **CONCLUÍDA**, condicionado às validações registradas abaixo. A E7 não foi iniciada.

## Entrega de e-mail

Foi criada a fronteira `shared/email`, com templates HTML escapados, texto alternativo e interface pequena. `EMAIL_PROVIDER=capture` é explícito em desenvolvimento/teste e nunca acessa rede; produção exige `smtp`, `EMAIL_FROM`, host e credenciais no startup. `nodemailer@9.0.3` é a única dependência adicionada. A versão 7 inicialmente avaliada apresentou advisories altos no audit e foi substituída pela major corrigida; a API utilizada foi validada por teste do adapter.

Forgot-password mantém resposta uniforme. O token bruto fica apenas na mensagem e, em testes, no contrato controlado preexistente. Convites ativos repetidos para o mesmo projeto/e-mail usam política de substituição: o anterior é revogado e somente o novo pode ser aceito. Em produção, convites não retornam token. Falhas de entrega geram evento técnico sanitizado sem token ou e-mail completo.

## Administração canônica de memberships

`GET /projects/:projectId/members` agora lista `ProjectMembership` com `User`. OWNER vê e-mail completo para administração; MANAGER/MEMBER/VIEWER recebem endereço mascarado. Foram adicionados atualização de papel, desativação lógica, reativação, saída própria e transferência de propriedade. Somente OWNER administra terceiros. A transferência promove uma membership ativa do mesmo projeto e mantém o solicitante como OWNER.

Despromoção, desativação ou saída do último OWNER retorna `409 LAST_PROJECT_OWNER`. A verificação e a escrita ocorrem em transação `Serializable`. Usuário, histórico e atribuições não são apagados. Membership inativa deixa de autorizar o projeto e não pode ser escolhida como responsável.

## Operação e dados legados

- `e6:cleanup:dry-run` e `e6:cleanup` inventariam/removem sessões, resets e convites finalizados após retenções de 30/7/30 dias. Não existe job oculto no startup.
- `db:test:migrate` e `db:test:status` carregam `.env.test`, exigem MySQL, marcador `test` no nome e URL diferente de desenvolvimento; só exibem host/porta/database sanitizados.
- O backfill permanece dry-run por padrão, aceita `--apply`, `--project-id`, `--report` e exige `--confirm-production` em database nomeado como produção. Ausência/e-mail inválido, identidade ambígua, papel desconhecido e projeto sem OWNER elegível são reportados sem PII. Execução repetida é idempotente.
- `ProjectMember`, `accessCode`, `inviteLink` e demais campos legados não foram removidos. Nenhuma migration foi criada nesta continuação.

## Autorização e frontend

`AUTHORIZATION_MATRIX.md` cataloga todos os grupos de endpoints. OWNER administra projeto/membros; MANAGER sincroniza GitHub; MEMBER escreve domínio; VIEWER lê. Atualização do projeto passou a exigir OWNER; ausência de membership continua `404`, e papel insuficiente `403`.

O frontend ganhou `features/members`: listagem, papel, desativação/reativação, transferência, saída e convites, com confirmação para ações destrutivas e controles administrativos ocultos para não-OWNER. A página não armazena tokens e usa a sessão/CSRF existentes.

## Testes e validações

Foram adicionados testes para templates, configuração SMTP/capture, retenção, proteção do banco de teste, memberships por papel, último OWNER, transferência, saída, substituição de convite, backfill vazio/legado/parcial/idempotente e UI de membros. O backfill de teste usa exclusivamente `traceflow_test`; o banco de desenvolvimento não é alvo.

Baseline: backend **76,38/61,68/76,41/77,45** e frontend **10,90/13,89/9,32/11,53** (statements/branches/functions/lines).

Final: backend **76,83/62,63/77,40/78,45**; frontend **13,88/15,21/13,30/14,11**. Passaram 129 testes backend (73 unitários e 56 integração/API) e 22 frontend. `architecture:check`, scanner de 171 arquivos, Prisma validate/generate, migrate/status em `traceflow_test`, cleanup dry-run/apply repetido, backfill dry-run/apply/idempotência, build Vite e smoke de health/readiness/401 foram aprovados. Audit backend: zero vulnerabilidades após Nodemailer 9.0.3. Audit frontend: duas entradas altas do mesmo advisory React Router RSC, não aplicável à SPA atual e sem correção não-breaking.

## Limitações e bloqueios para E7

- SMTP depende de credenciais/infraestrutura real e não foi chamado nos testes.
- Cleanup é comando operacional manual; agendamento e observabilidade pertencem ao deploy.
- Backfill foi validado em cenários artificiais isolados; casos reportados como manuais precisam de decisão do responsável antes de produção.
- Rate limit/session store continuam em memória/instância única; MFA, SSO e secret manager não fazem parte da E6.
- A E7 deve tratar auditoria, retenção e governança de dados. Não há bloqueio técnico conhecido após as validações finais.
