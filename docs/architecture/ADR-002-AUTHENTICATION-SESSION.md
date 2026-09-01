# ADR-002 — Autenticação e sessão

- **Estado:** aceita na E6
- **Data:** 24/07/2026

## Decisão

O TRACEFLOW usa sessão opaca server-side. Após cadastro/login, o navegador recebe somente `traceflow_session`, um token aleatório de 256 bits em cookie `HttpOnly`, `SameSite=Lax`, `Path=/` e `Secure` em produção. O MySQL armazena apenas SHA-256 do token, versão, expiração, revogação, último uso e hash do CSRF. Senhas usam Argon2id (`argon2@0.44.0`) com parâmetros explícitos.

Tokens de sessão não ficam em localStorage, sessionStorage, URL ou logs. Login sempre cria nova sessão e logout revoga a atual. Contas anonimizadas não autenticam; contas `DEACTIVATED` e `DELETION_PENDING` recebem somente sessão restrita governada por `requireAccountState`. Erros de credencial e recuperação evitam enumeração.

Mutations autenticadas exigem `X-CSRF-Token`. O valor bruto existe apenas no cliente em memória, e somente seu hash é persistido. `GET /api/auth/csrf` retorna o token CSRF estável associado à sessão atual. O token acompanha o ciclo de vida da sessão e deixa de ser válido quando ela é revogada, expira ou é substituída. CORS aceita credenciais apenas para a allowlist existente.

## Alternativas rejeitadas

- JWT no localStorage: amplia impacto de XSS e dificulta revogação imediata.
- JWT em cookie: ainda exigiria CSRF e lista de revogação para os requisitos atuais.
- cookie com identificador sequencial: previsível e inadequado.

## Consequências

Sessões exigem consulta ao banco por request e limpeza periódica pelo comando operacional E6. A L2 acrescenta UUID público para listar/revogar sem expor o ID interno. Troca de senha preserva a sessão atual e revoga as demais; reset e confirmação de novo e-mail revogam todas. Store distribuído/cache pode ser adicionado sem mudar o contrato do cookie. O provider de e-mail suporta SMTP em produção e capture somente em desenvolvimento/teste; tokens nunca retornam fora do ambiente de teste controlado.
