# LR.1 — Hardening de autorização, autenticação e identidade

## 1. Baseline e escopo

| Campo | Valor |
|---|---|
| Branch | `daniel-dev` |
| SHA inicial | `f3a2a4c7ab871ef054594f48ebfafecda5a5a710` |
| Data | 2026-08-20 |
| Natureza | Correção e hardening dos achados validados na revisão da PR #13 |
| Migration nova | Nenhuma |

Esta entrega não homologa integrações externas nem altera o status de homologação de S1-01 ou
S1-03. As evidências abaixo são automatizadas e locais; elas não equivalem a execução E2E com
SMTP real, GitHub real ou validação manual em navegador.

## 2. Findings tratados

| ID | Severidade original | Causa raiz | Correção | Teste | Status |
|---|---|---|---|---|---|
| B1 — bypass de autorização por caixa e fail-open | BLOCKER | O Express reconhecia rotas sem distinguir caixa, enquanto a resolução e a classificação de papel usavam paths não canônicos; falha de resolução project-scoped seguia com `next()` | Path de autorização em lowercase, método normalizado, `requiredRole({ method, path })`, identificação explícita de escopo e `404 RESOURCE_NOT_FOUND` fail-closed | Matriz real com 135 combinações; cadeia de tomada cross-project; projeto e filhos inexistentes | PASS |
| H1 — open redirect em `returnTo` | HIGH | Dot-segments, percent-encoding e separadores ambíguos podiam normalizar um caminho aparentemente interno para URL protocol-relative | Política equivalente no backend e frontend, com validação antes/depois de decode e normalização por origin sentinela; callback revalida o destino persistido | Suites backend/frontend com todos os casos permitidos e rejeitados e callback sem `Location` externo | PASS |
| M2 — `accountStatus` nas rotas de auth | MEDIUM | Rotas `/api/auth/*` relevantes eram montadas antes da política global de estado de conta | `requireAccountState` aplicado às mutations de username, senha, reenvio e reautenticação GitHub, preservando `me`, `csrf`, `logout` e fluxos públicos permitidos | Pipeline Express real para `ACTIVE`, `DEACTIVATED`, `DELETION_PENDING` e `ANONYMIZED` | PASS |
| M3 — bypass do cooldown de username | MEDIUM | `/auth/username` e Settings permitiam caminhos com políticas diferentes | `/auth/username` restrito a `mustSetUsername=true`; Settings permanece como fluxo normal com cooldown e `usernameChangedAt` | Bootstrap, rejeição fora do bootstrap, cooldown, tentativa de bypass e duplicidade | PASS |
| M12 — convite pessoal sem prova de e-mail | MEDIUM | Busca por igualdade textual de e-mail permitia listar/atuar sobre convite antes de comprovar posse da caixa postal | E-mail verificado exigido em `mine`, `accept` e `decline` por `invitationId`; fluxo por token permanece separado | Conta não verificada bloqueada sem conteúdo sensível; conta verificada, outro destinatário e estados terminais | PASS |
| L2 — reset pendente após troca de senha | LOW | A troca voluntária não invalidava todos os tokens de recuperação pendentes | Alteração de hash, incremento de `sessionVersion`, revogação de sessões e consumo de reset tokens executados na mesma transação | Token emitido antes da troca falha nos endpoints Auth e Settings; nova senha autentica | PASS |
| L3 — corrida no cadastro local | LOW | A pré-consulta não cobria colisão concorrente no `INSERT` | `P2002` no cadastro convertido em `409 CONFLICT` com mensagem opaca | Duas requisições concorrentes produzem exatamente um `201`, um `409` e um usuário | PASS |
| L4 — `P2002` no cadastro GitHub | LOW | Toda unique violation era interpretada como conflito de e-mail | Pós-conflito reavalia `githubUserId`, e-mail verificado e username; recupera identidade segura, rejeita e-mail sem auto-link e tenta novo username | Testes unitários para colisão de identidade, e-mail e username | PASS |
| L5 — código de verificação de e-mail | LOW | `EMAIL_VERIFICATION_REQUIRED` existia como literal fora do catálogo | Código adicionado a `ERROR_CODES` e consumido pelo middleware; frontend preserva o código sem limpar sessão | API valida o código canônico; testes do cliente HTTP e erro compartilhado verificam ausência de logout/evento restrito | PASS |
| L8 — DTO de sync settings | LOW | O controller devolvia `Project` bruto após atualização | Resposta passa por `publicProject`, o mesmo mapper público canônico | Regressão nega `accessCode`, `accessCodeRole` e `inviteLink` | PASS |

## 3. Decisões de segurança preservadas

- Usuário sem membership ativa recebe `404`, reduzindo enumeração entre projetos.
- Usuário com membership ativa e papel insuficiente recebe `403`.
- O backend continua sendo a autoridade para estado da conta, membership, papel e invariantes.
- `OWNER` é o maior papel do projeto, não um administrador global.
- `returnTo` aceita apenas pathname interno com search/hash opcionais.
- Convites pessoais por `invitationId` exigem e-mail verificado; o fluxo por token continua separado.
- `/api/auth/username` serve somente ao bootstrap com `mustSetUsername=true`.
- Toda troca voluntária de senha invalida tokens de recuperação pendentes.
- PKCE permanece com `code_challenge`, `S256` e `code_verifier`.
- O tratamento de erros mantém logs operacionais mínimos, sem stack, paths internos ou segredos por padrão.

## 4. Matriz adversarial observada

O teste de API executou 9 rotas, 5 condições de papel/membership e 3 variantes de caixa, totalizando
135 requisições. Em cada célula abaixo, os três valores representam, na ordem,
`lowercase / UPPERCASE / MixedCase`. Todas as respostas atuais coincidiram com o esperado.

| Rota | Role | Membership | Variante de caixa | Esperado | Atual |
|---|---|---|---|---|---|
| GET project | NONE | Sem membership ativa | lowercase / UPPERCASE / MixedCase | 404 / 404 / 404 | 404 / 404 / 404 |
| GET project | VIEWER | Ativa | lowercase / UPPERCASE / MixedCase | 200 / 200 / 200 | 200 / 200 / 200 |
| GET project | MEMBER | Ativa | lowercase / UPPERCASE / MixedCase | 200 / 200 / 200 | 200 / 200 / 200 |
| GET project | MANAGER | Ativa | lowercase / UPPERCASE / MixedCase | 200 / 200 / 200 | 200 / 200 / 200 |
| GET project | OWNER | Ativa | lowercase / UPPERCASE / MixedCase | 200 / 200 / 200 | 200 / 200 / 200 |
| PUT project | NONE | Sem membership ativa | lowercase / UPPERCASE / MixedCase | 404 / 404 / 404 | 404 / 404 / 404 |
| PUT project | VIEWER | Ativa | lowercase / UPPERCASE / MixedCase | 403 / 403 / 403 | 403 / 403 / 403 |
| PUT project | MEMBER | Ativa | lowercase / UPPERCASE / MixedCase | 403 / 403 / 403 | 403 / 403 / 403 |
| PUT project | MANAGER | Ativa | lowercase / UPPERCASE / MixedCase | 403 / 403 / 403 | 403 / 403 / 403 |
| PUT project | OWNER | Ativa | lowercase / UPPERCASE / MixedCase | 200 / 200 / 200 | 200 / 200 / 200 |
| GET access-code | NONE | Sem membership ativa | lowercase / UPPERCASE / MixedCase | 404 / 404 / 404 | 404 / 404 / 404 |
| GET access-code | VIEWER | Ativa | lowercase / UPPERCASE / MixedCase | 403 / 403 / 403 | 403 / 403 / 403 |
| GET access-code | MEMBER | Ativa | lowercase / UPPERCASE / MixedCase | 403 / 403 / 403 | 403 / 403 / 403 |
| GET access-code | MANAGER | Ativa | lowercase / UPPERCASE / MixedCase | 403 / 403 / 403 | 403 / 403 / 403 |
| GET access-code | OWNER | Ativa | lowercase / UPPERCASE / MixedCase | 200 / 200 / 200 | 200 / 200 / 200 |
| GET invitations | NONE | Sem membership ativa | lowercase / UPPERCASE / MixedCase | 404 / 404 / 404 | 404 / 404 / 404 |
| GET invitations | VIEWER | Ativa | lowercase / UPPERCASE / MixedCase | 403 / 403 / 403 | 403 / 403 / 403 |
| GET invitations | MEMBER | Ativa | lowercase / UPPERCASE / MixedCase | 403 / 403 / 403 | 403 / 403 / 403 |
| GET invitations | MANAGER | Ativa | lowercase / UPPERCASE / MixedCase | 403 / 403 / 403 | 403 / 403 / 403 |
| GET invitations | OWNER | Ativa | lowercase / UPPERCASE / MixedCase | 200 / 200 / 200 | 200 / 200 / 200 |
| PATCH member | NONE | Sem membership ativa | lowercase / UPPERCASE / MixedCase | 404 / 404 / 404 | 404 / 404 / 404 |
| PATCH member | VIEWER | Ativa | lowercase / UPPERCASE / MixedCase | 403 / 403 / 403 | 403 / 403 / 403 |
| PATCH member | MEMBER | Ativa | lowercase / UPPERCASE / MixedCase | 403 / 403 / 403 | 403 / 403 / 403 |
| PATCH member | MANAGER | Ativa | lowercase / UPPERCASE / MixedCase | 403 / 403 / 403 | 403 / 403 / 403 |
| PATCH member | OWNER | Ativa | lowercase / UPPERCASE / MixedCase | 200 / 200 / 200 | 200 / 200 / 200 |
| DELETE member | NONE | Sem membership ativa | lowercase / UPPERCASE / MixedCase | 404 / 404 / 404 | 404 / 404 / 404 |
| DELETE member | VIEWER | Ativa | lowercase / UPPERCASE / MixedCase | 403 / 403 / 403 | 403 / 403 / 403 |
| DELETE member | MEMBER | Ativa | lowercase / UPPERCASE / MixedCase | 403 / 403 / 403 | 403 / 403 / 403 |
| DELETE member | MANAGER | Ativa | lowercase / UPPERCASE / MixedCase | 403 / 403 / 403 | 403 / 403 / 403 |
| DELETE member | OWNER | Ativa | lowercase / UPPERCASE / MixedCase | 204 / 204 / 204 | 204 / 204 / 204 |
| PATCH github sync-settings | NONE | Sem membership ativa | lowercase / UPPERCASE / MixedCase | 404 / 404 / 404 | 404 / 404 / 404 |
| PATCH github sync-settings | VIEWER | Ativa | lowercase / UPPERCASE / MixedCase | 403 / 403 / 403 | 403 / 403 / 403 |
| PATCH github sync-settings | MEMBER | Ativa | lowercase / UPPERCASE / MixedCase | 403 / 403 / 403 | 403 / 403 / 403 |
| PATCH github sync-settings | MANAGER | Ativa | lowercase / UPPERCASE / MixedCase | 403 / 403 / 403 | 403 / 403 / 403 |
| PATCH github sync-settings | OWNER | Ativa | lowercase / UPPERCASE / MixedCase | 200 / 200 / 200 | 200 / 200 / 200 |
| GET requirement | NONE | Sem membership ativa | lowercase / UPPERCASE / MixedCase | 404 / 404 / 404 | 404 / 404 / 404 |
| GET requirement | VIEWER | Ativa | lowercase / UPPERCASE / MixedCase | 200 / 200 / 200 | 200 / 200 / 200 |
| GET requirement | MEMBER | Ativa | lowercase / UPPERCASE / MixedCase | 200 / 200 / 200 | 200 / 200 / 200 |
| GET requirement | MANAGER | Ativa | lowercase / UPPERCASE / MixedCase | 200 / 200 / 200 | 200 / 200 / 200 |
| GET requirement | OWNER | Ativa | lowercase / UPPERCASE / MixedCase | 200 / 200 / 200 | 200 / 200 / 200 |
| GET task | NONE | Sem membership ativa | lowercase / UPPERCASE / MixedCase | 404 / 404 / 404 | 404 / 404 / 404 |
| GET task | VIEWER | Ativa | lowercase / UPPERCASE / MixedCase | 200 / 200 / 200 | 200 / 200 / 200 |
| GET task | MEMBER | Ativa | lowercase / UPPERCASE / MixedCase | 200 / 200 / 200 | 200 / 200 / 200 |
| GET task | MANAGER | Ativa | lowercase / UPPERCASE / MixedCase | 200 / 200 / 200 | 200 / 200 / 200 |
| GET task | OWNER | Ativa | lowercase / UPPERCASE / MixedCase | 200 / 200 / 200 | 200 / 200 / 200 |

Regressões adicionais confirmaram:

- usuário sem acesso ao Project B recebe `404` em projeto, access code e mutation de membro, inclusive em uppercase;
- `MEMBER` recebe `403` ao tentar promover membership a `OWNER`, inclusive com segmento `MEMBERS` em caixa divergente;
- projeto, requirement e task inexistentes recebem `404 RESOURCE_NOT_FOUND` opaco, sem código Prisma, stack ou detalhe interno;
- o DTO retornado por sync settings não contém `accessCode`, `accessCodeRole` ou `inviteLink`.

## 5. Evidência de regressão

Todos os comandos aceitos abaixo foram executados com Node `v22.23.2` e sem redução de thresholds.

### Backend

| Gate | Resultado |
|---|---|
| `npm run lint` | PASS |
| `npm run format:check` | PASS |
| `npm run architecture:check` | PASS |
| `npm run test:unit` | PASS — 35 arquivos, 222 testes |
| `npm run test:integration` | PASS — 16 arquivos, 165 testes |
| `npm test` | PASS — 51 arquivos, 387 testes |
| `npm run test:coverage` | PASS — 88,32% statements; 74,60% branches; 91,35% functions; 90,85% lines |
| `npm run security:secrets` | PASS — 308 arquivos |
| `npm audit` | PASS — 0 vulnerabilidades |

A primeira repetição pós-instalação da suíte de integração apresentou interferência transitória entre
arquivos (um parse HTTP inválido e uma sessão perdida). Os dois arquivos passaram isoladamente e a
suíte completa passou em nova execução, sem alteração de código entre as execuções.

### Frontend

| Gate | Resultado |
|---|---|
| `npm run lint` | PASS |
| `npm run format:check` | PASS |
| `npm test` | PASS — 34 arquivos, 203 testes |
| `npm run test:coverage` | PASS — 61,22% statements; 59,12% branches; 52,02% functions; 62,44% lines |
| `npm run build` | PASS — 380 módulos transformados |
| `npm audit` | PASS — 0 vulnerabilidades |

### Prisma e dependências

| Gate | Resultado |
|---|---|
| Prisma CLI e Client | `6.12.0`, alinhados e fixados em versão exata |
| `prisma format` | PASS |
| `prisma validate` | PASS |
| `prisma generate` | PASS |
| `prisma migrate status` | PASS — 34 migrations; schema atualizado |
| Migration criada ou histórica alterada | Não |

O audit inicial identificou três vulnerabilidades HIGH na cadeia de desenvolvimento de
`@prisma/config` 6.19.3 por `deepmerge-ts`. A remediação compatível fixou Prisma CLI e Client em
6.12.0, removeu essa cadeia vulnerável e manteve o schema/API no major 6. O audit final encontrou
zero vulnerabilidades no backend e no frontend.

## 6. Itens explicitamente adiados

Permanecem fora da LR.1 e não são classificados como resolvidos:

- autorização de repositórios GitHub no nível do usuário;
- reconexão ou troca de repositório;
- processamento e retry de webhook;
- GitHub rate limiting;
- exportação LGPD, lifecycle completo de exclusão, anonimização e históricos de e-mail;
- limpeza ampla de legado;
- `GitBranch` e collation;
- migrations sobre banco populado;
- hardening geral de transações serializáveis;
- polling GitHub;
- acessibilidade geral do frontend;
- documentação completa do projeto;
- sincronização com novas alterações de `main`.

## 7. Parecer

**LR.1 CONCLUÍDA** para o escopo técnico automatizado definido nesta entrega.

As correções fecham o bypass por caixa, tornam a autorização project-scoped fail-closed, preservam
os contratos `404/403`, restringem redirects e estados de conta, consolidam as políticas de
identidade e senha, tratam colisões concorrentes e removem capabilities sensíveis do DTO geral.
Não houve migration, commit, push, alteração de PR ou homologação externa.
