# TRACEFLOW — L4.2 — Correções da homologação e reteste focado

Baseline recebida: `daniel-dev` em `bc48e26bb212b8a85dfbc78eeda0cd3f7fad56a7`
Data da correção: 2026-08-15
Escopo: 6 DEFs do Work QA e a observação de confirmação duplicada

## 1. Resumo executivo

> **L4.2 — CORREÇÕES IMPLEMENTADAS**

> **BASELINE PRONTA PARA RETESTE QA FOCADO**

O Work QA entregou 88 cenários, com 44 PASS, 6 FAIL e 38 BLOCKED. Os seis DEFs e a observação
adicional foram reproduzidos automaticamente e consolidados em quatro causas raiz: logging padrão
permissivo, ausência defensiva de membership na lista de membros, mensagem padrão de validação em
capabilities públicas e falta de single-flight em confirmações automáticas sob StrictMode.

Todos os DEFs recebidos foram corrigidos. Não há DEF técnico pendente nesta L4.2. Os 38 BLOCKEDs por
browser, mailbox, GitHub, repositórios descartáveis, webhook/túnel, fixtures ou viewport continuam
fora do escopo e não foram convertidos artificialmente em PASS.

Esta entrega executou reteste técnico automatizado e regressões críticas. RT01–RT05 ainda precisam
ser executados em browser/ambiente operacional pelo Work QA; nenhum resultado manual foi presumido.

## 2. Causas raiz

1. O error handler incluía `error.stack` automaticamente sempre que o ambiente não era produção e
   registrava a mensagem bruta de um erro 5xx inesperado. O response já era seguro, mas o log padrão
   preservava caminhos do filesystem e `node_modules`.
2. Quando o projeto não existia, o middleware de autorização deixava a rota prosseguir para manter a
   validação e os contratos específicos dos services. `projectMembershipService.list`, porém,
   desreferenciava `requesterMembership` sem uma guarda defensiva.
3. Os schemas de verificação de e-mail, reset, convite e confirmações de Settings usavam mensagens
   padrão do Zod para tamanho/tipo inválido de token.
4. `VerifyEmailScreen` e as páginas de confirmação disparavam a operação no `useEffect` sem uma
   coalescência que sobrevivesse ao ciclo adicional do StrictMode.

## 3. Correções

| DEF        | Causa raiz                                                     | Correção canônica                                                                                                                                                                                                                      | Regressão                                                                              | Status    |
| ---------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------- |
| DEF-QA-001 | Stack automático fora de produção e mensagem 5xx bruta         | Log padrão mantém requestId, método, path, status, código, nome e mensagem segura; 4xx esperados nunca incluem stack; 5xx inesperado usa fallback; stack somente por `includeErrorStack: true` explícito e apenas para erro inesperado | 401, 403, 404, 409, 429 e 500; sem path, `node_modules` ou segredo; response sem stack | CORRIGIDO |
| DEF-QA-002 | `requesterMembership` ausente era desreferenciado em `list`    | Guarda defensiva no service retorna 404 `RESOURCE_NOT_FOUND`; demais perspectivas foram exercitadas para confirmar ausência de 500; convite também valida existência do projeto no service/repository                                  | `/projects/999999/members` e cinco perspectivas relacionadas                           | CORRIGIDO |
| DEF-QA-003 | Mensagem padrão do Zod no token de verificação                 | Helper compartilhado `publicCapabilityToken` com mensagem pública estável por contexto                                                                                                                                                 | token curto, ausente, numérico e nulo; estado não alterado                             | CORRIGIDO |
| DEF-QA-004 | Mensagem padrão do Zod no token de reset                       | Mesmo helper, com mensagem específica de redefinição                                                                                                                                                                                   | token curto; `passwordHash` preservado                                                 | CORRIGIDO |
| DEF-QA-005 | `updateMany=0` da revogação administrativa usava erro de token | Helper administrativo `invitationNotFound()` retorna 404 opaco; fluxos baseados em token continuam usando `INVITATION_INVALID`                                                                                                         | Project A + invitation B retorna 404                                                   | CORRIGIDO |
| DEF-QA-006 | Mesma fronteira administrativa do DEF-QA-005                   | Mesmo ponto de correção e teste H09/K02, sem lógica duplicada                                                                                                                                                                          | invitation e membership B preservados                                                  | CORRIGIDO |

### Ordem de autorização e validação preservada

Uma primeira tentativa de bloquear todo projeto inexistente diretamente no middleware tornou alguns
400 de validação e `ROUTE_NOT_FOUND` em 404 prematuro. Os gates detectaram a regressão. A tentativa
foi descartada: o middleware preserva a ordem anterior e os services responsáveis agora garantem o
404, inclusive a guarda específica que impede o 500 de membros. Os contratos existentes passaram
novamente em 69/69 no reteste isolado.

## 4. Observação adicional — confirmação duplicada

Foi criado `runSingleFlight`, um coalescedor compartilhado em memória por `operação + token`. O mapa
vive no módulo, portanto sobrevive ao remount de verificação do StrictMode; a entrada existe somente
enquanto a Promise está pendente e é removida no encerramento, permitindo uma tentativa futura real.
Não há timer, debounce, cooldown, retry automático ou remoção do StrictMode.

A correção foi aplicada a:

- verificação de e-mail por POST;
- confirmação de alteração de e-mail;
- confirmação de reativação.

As duas últimas já se beneficiavam da deduplicação HTTP de GET, mas agora também executam uma única
operação de tela sob StrictMode. O backend continua responsável por consumo único/idempotência de
tokens; a UI não é a única proteção.

## 5. Segurança

### Logging

- erros esperados 4xx: sem stack, caminho local, `node_modules` ou segredo;
- erro inesperado 5xx: fallback sanitizado no log operacional padrão;
- correlação preservada por requestId, method, path, statusCode e errorCode;
- diagnóstico com stack é opt-in explícito e nunca altera o response público;
- responses continuam sem stack e sem mensagem interna.

### Capabilities públicas

`publicCapabilityToken` centraliza tipo, tamanho e mensagem segura. Foram cobertos verificação,
redefinição, convite, confirmação de mudança de e-mail e reativação. Campos normais de formulário
continuam retornando mensagens úteis e específicas.

### Fronteira cross-project

Revogação administrativa usa `projectId + invitationId` e responde 404 opaco quando o par não existe.
O convite do outro projeto permanece PENDING, e a membership cross-project continua 404 e ativa.
Rotas por token preservam `INVITATION_INVALID`; D01 não foi alterada.

## 6. Banco

- Nenhuma alteração de schema ou migration.
- Nenhuma migration histórica modificada.
- Prisma format, validate e generate: PASS, Prisma 6.19.3.
- Desenvolvimento `traceflow`: 33 migrations aplicadas.
- Teste `traceflow_test`: 33 migrations aplicadas.
- E8 read-only: PASS, sem reconciliação ou escrita.
- Testes automatizados usaram exclusivamente `traceflow_test`; dados artificiais do QA no banco de
  desenvolvimento não foram removidos ou modificados pela L4.2.

## 7. Testes

Todos os comandos Node da validação foram executados com Node 22.

### Reprodução antes da correção

- Backend focado: 13 falhas reproduzidas; 44 testes preexistentes permaneceram verdes.
- Frontend StrictMode: 3 falhas reproduzidas; cada confirmação era chamada duas vezes.
- Evidências reproduzidas: 500 em members, 400 cross-project, mensagem `Too small`, stack/path no log
  e duplicidade de operação.

### Reteste focado depois da correção

- Causas backend: 61/61 PASS.
- StrictMode frontend: 26/26 PASS.
- Regressão crítica backend (auth, settings, privacy, projetos, autorização): 96/96 PASS.
- Regressão crítica frontend (AuthContext, rotas, http-client, Settings, membros, convite,
  ErrorPage): 85/85 PASS.

### Gates completos

| Gate                          | Resultado                                                          |
| ----------------------------- | ------------------------------------------------------------------ |
| Backend total                 | 47 arquivos, 347/347 PASS                                          |
| Backend unit                  | 34 arquivos, 206/206 PASS                                          |
| Backend integration/API       | 13 arquivos, 141/141 PASS                                          |
| Frontend total                | 32 arquivos, 177/177 PASS                                          |
| Frontend build                | PASS, Vite 8.0.16, 374 módulos                                     |
| Backend coverage              | statements 87,82%; branches 74,24%; functions 90,50%; lines 90,08% |
| Frontend coverage             | statements 58,92%; branches 57,58%; functions 49,68%; lines 60,24% |
| Lint e format check           | PASS nos dois pacotes                                              |
| Architecture check            | PASS, nenhuma violação                                             |
| Política de audit             | 5/5 PASS; 0 high, 0 critical; nenhuma exceção aplicada             |
| `npm audit --audit-level=low` | 0 vulnerabilidades em backend e frontend                           |
| Secret scan                   | PASS, 298 arquivos                                                 |
| `git diff --check`            | PASS                                                               |

### Flakiness observada

Na primeira execução completa, ainda durante uma correção intermediária que também produziu seis
regressões contratuais reais, um teste de `mvp-contracts` atingiu o timeout de 30 s. O teste passou
imediatamente quando isolado junto de auth/authorization (69/69), e a suite completa posterior passou
347/347 em 19,33 s. O timeout não foi reproduzido e ficou classificado como ocorrência transitória do
ambiente de teste; as seis regressões de contrato não foram ignoradas e foram corrigidas antes dos
gates finais.

## 8. Reteste técnico focado

| Cenário                             | Antes                            | Depois                                                                | Status            |
| ----------------------------------- | -------------------------------- | --------------------------------------------------------------------- | ----------------- |
| C02 — token de verificação inválido | Inglês técnico do Zod            | `Link de verificação inválido ou expirado.`; conta inalterada         | PASS automatizado |
| C02 — POST duplicado                | Duas operações sob StrictMode    | Uma operação efetiva por token                                        | PASS automatizado |
| C09 — token de reset inválido       | Inglês técnico do Zod            | `Link de redefinição de senha inválido ou expirado.`; hash preservado | PASS automatizado |
| H09 — invitationId cruzada          | 400 `INVITATION_INVALID`         | 404 `RESOURCE_NOT_FOUND`; convite preservado                          | PASS automatizado |
| J04 — projeto inexistente           | `/members` gerava 500 secundário | `/members` retorna 404; sem stack                                     | PASS automatizado |
| K02 — recurso filho cross-project   | invitationId não era opaco       | invitation e membership cruzados retornam 404 e permanecem intactos   | PASS automatizado |
| K06 — sanitização                   | Stack/path no log padrão         | 401/403/404/409/429/500 sem estrutura interna no padrão               | PASS automatizado |

Reteste manual RT01–RT05: **PENDENTE DO WORK QA**. A tentativa de conexão ao browser do ambiente
retornou `No browser is available`; portanto, nenhum resultado visual/manual foi presumido.

## 9. Dependências externas

Os 38 BLOCKEDs continuam vinculados a mailbox/SMTP, GitHub OAuth, GitHub App/API, repositórios
descartáveis, webhook/túnel HTTPS, fixtures temporais e validação de viewport. Nenhuma infraestrutura
nova foi criada para mascarar esses bloqueios.

## 10. Git

Saída de `git status --short` ao encerrar a entrega:

```text
 M backend/src/middlewares/error-handler.middleware.js
 M backend/src/modules/auth/auth.validation.js
 M backend/src/modules/projects/project-invitation.repository.js
 M backend/src/modules/projects/project-invitation.validation.js
 M backend/src/modules/projects/services/project-invitation.service.js
 M backend/src/modules/projects/services/project-membership.service.js
 M backend/src/modules/settings/settings.validation.js
 M backend/src/shared/validation/common.schemas.js
 M backend/test/api/auth-authorization.test.js
 M backend/test/unit/request-validation.test.js
 M backend/test/unit/shared-infrastructure.test.js
 M frontend/src/features/auth/pages/VerifyEmailScreen.jsx
 M frontend/src/features/settings/ConfirmationPage.jsx
 M frontend/test/auth/EmailVerification.test.jsx
 M frontend/test/features/SettingsPages.test.jsx
?? "BES_TCC_Proposta de Desenvolvimento de Ferramenta_v2023 Somativa 2.pdf"
?? OWASP_Application_Security_Verification_Standard_5.0.0_en.pdf
?? docs/deliveries/L4_2_QA_FIXES.md
?? frontend/src/shared/services/single-flight.js
```

Os dois PDFs já existiam antes desta entrega e foram preservados sem alteração. Nenhum commit, push,
PR, merge, rebase ou troca de branch foi executado.

Mensagem de commit sugerida:

```text
fix: resolve L4.1 QA defects in auth and project boundaries
```
