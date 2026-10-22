# Matriz OWASP ASVS 5.0.0 — níveis 1 e 2

Decomposição por requisito da meta L2 da §13.1 do `TRACEFLOW_CONTEXTO_ARQUITETURA.md`, feita pela
campanha v2 de erros e inconsistências (Fase 1, 14/10/2026), no commit `7952b01`. A matriz não
substitui o `docs/security/ASVS_BASELINE.md`: ela o decompõe requisito a requisito.

- **Fonte:** OWASP ASVS 5.0.0 (CC BY-SA 4.0). O resumo é paráfrase em português, sem o texto oficial.
- **Catálogo congelado:** `backend/test/fixtures/asvs-5.0.0-l1-l2.json` (identificador, nível e seção).
- **Completude:** `backend/test/conformance/asvs-matrix.test.js`.
- **Inventário (INV-nn) e reproduções (CF-nn):** `docs/issues/CONFORMIDADE_RELATORIO.md`.
- **Backlog:** `CONF-Fnn` são os itens novos da campanha; os demais já existiam em `docs/issues/TECHNICAL_BACKLOG.md`.

## Resumo

| Veredito | L1 | L1+L2 |
|---|---:|---:|
| ATENDIDO | 40 | 102 |
| PARCIAL | 5 | 36 |
| NÃO ATENDIDO | 6 | 21 |
| NÃO VERIFICÁVEL LOCALMENTE | 4 | 18 |
| NÃO APLICÁVEL | 15 | 76 |
| **Total** | **70** | **253** |

Aplicáveis: 177. Aplicáveis e verificáveis localmente: 159. Atendidos entre esses: 102 (64.2%).

A Fase 4 (Parte D) revisou seis linhas: V1.1.1, V8.2.1, V8.2.2, V8.3.1 e V8.4.1 passaram de atendido a não atendido pela H09, e V16.5.2 passou de parcial a não atendido pela H01.

As correções da revisão independente da PR #26 (16/10/2026) devolveram V8.2.1, V8.2.2, V8.3.1 e V8.4.1 a atendido: o caminho canônico (`1a2700c`) fecha a sonda H09 e o CONF-F51.

## V1 — Encoding and Sanitization

| ID | Nível | Resumo | Aplicabilidade | Veredito | Classe | Evidência | Limite / dono | Backlog |
|---|---|---|---|---|---|---|---|---|
| V1.1.1 | 2 | entrada decodificada para forma canônica uma vez, antes da validação | aplica | NÃO ATENDIDO | SONDA | `backend/src/middlewares/auth/project-authorization.middleware.js` decide sobre o caminho ainda codificado, e o roteador entrega o parâmetro já decodificado | a sonda H09 da Parte D (ID do caminho codificado, como `%39%38`) passa pelo middleware de projeto, que testa `req.path` bruto: um não membro lê 53 rotas e escreve em 17, e um VIEWER faz 18 escritas, inclusive as de OWNER | CONF-F51 |
| V1.1.2 | 2 | codificação de saída feita no último passo, pelo intérprete de destino | aplica | ATENDIDO | INSPEÇÃO | React escapa na renderização; `res.json`; `backend/src/shared/email/email.layout.js` escapa na montagem do HTML | — | — |
| V1.2.1 | 1 | codificação de saída adequada ao contexto HTML, atributo, CSS ou cabeçalho | aplica | ATENDIDO | INSPEÇÃO | `backend/src/shared/email/email.layout.js` (`escapeHtml`, `safeUrl`); nenhum `dangerouslySetInnerHTML` em `frontend/src` | — | — |
| V1.2.2 | 1 | URL montada com dado externo codificado e só com protocolos seguros | aplica | PARCIAL | INSPEÇÃO | `backend/src/modules/github/github.mapper.js` valida `githubUrl` com prefixo `https://github.com/`; a URL do repositório (`html_url`) é gravada sem validação e exibida como link | URL do repositório (K21) | CONF-F18 |
| V1.2.3 | 1 | saída JSON e JavaScript sem injeção | aplica | ATENDIDO | INSPEÇÃO | `res.json` em todas as respostas, inclusive as de erro (`backend/src/middlewares/error-handler.middleware.js`); nenhum script montado com dado externo | — | — |
| V1.2.4 | 1 | consultas parametrizadas ou ORM contra injeção de banco | aplica | ATENDIDO | INSPEÇÃO | Prisma e `$queryRaw` com template; as 5 chamadas `Unsafe` usam constantes ou inteiros validados (`backend/src/database/transaction-guard.js`, `backend/src/database/recovery-prisma.js`) | — | — |
| V1.2.5 | 1 | proteção contra injeção de comando do sistema operacional | INV-24: nenhuma chamada ao sistema operacional | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V1.2.6 | 2 | proteção contra injeção LDAP | INV-24: sem LDAP | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V1.2.7 | 2 | proteção contra injeção XPath | INV-24: sem XPath | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V1.2.8 | 2 | processador LaTeX seguro | INV-24: sem LaTeX | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V1.2.9 | 2 | caracteres especiais escapados em expressões regulares | aplica | ATENDIDO | INSPEÇÃO | o único `new RegExp` dinâmico usa segmentos constantes (`backend/src/modules/authorization/authorization.service.js`:24) | — | — |
| V1.3.1 | 1 | HTML de editor WYSIWYG higienizado por biblioteca | INV-24: sem editor WYSIWYG nem HTML de usuário | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V1.3.2 | 1 | sem eval nem execução dinâmica de código | aplica | ATENDIDO | INSPEÇÃO | zero `eval` e `new Function` em `backend/src` e `frontend/src` | — | — |
| V1.3.3 | 2 | dado higienizado antes de contexto perigoso, com tamanho limitado | aplica | ATENDIDO | INSPEÇÃO | nome de arquivo higienizado (`backend/src/modules/testCases/storage/test-evidence.validation.js`), cabeçalho `Content-Disposition` codificado (`backend/src/modules/testCases/test-case.controller.js`), redaction no log (`backend/src/shared/logger/redaction.js`) | — | — |
| V1.3.4 | 2 | SVG de usuário validado ou higienizado | aplica | ATENDIDO | INSPEÇÃO | upload recusa SVG, HTML e script (`backend/src/modules/testCases/storage/test-evidence.validation.js`) | — | — |
| V1.3.5 | 2 | Markdown, CSS e templates de usuário desativados ou higienizados | aplica | ATENDIDO | INSPEÇÃO | texto de usuário é exibido como texto puro; nenhuma biblioteca de Markdown em `frontend/package.json` | — | — |
| V1.3.6 | 2 | SSRF: destino externo validado contra allowlist | aplica | ATENDIDO | INSPEÇÃO | nenhuma chamada de saída usa URL vinda do usuário; destinos fixos em `backend/src/modules/github/github.client.js` e `backend/src/modules/github/github-credential.provider.js` | a allowlist de `backend/src/shared/security/ssrf.js` não é usada em runtime (V13.2.4) | — |
| V1.3.7 | 2 | templates nunca montados com entrada não confiável | aplica | ATENDIDO | INSPEÇÃO | templates de e-mail fixos no código, com interpolação escapada (`backend/src/shared/email/email.layout.js`) | — | — |
| V1.3.8 | 2 | consultas JNDI higienizadas | INV-24: sem JNDI | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V1.3.9 | 2 | conteúdo higienizado antes do memcache | INV-24: sem memcache | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V1.3.10 | 2 | strings de formato higienizadas | INV-24: sem formatação no estilo printf com entrada do usuário | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V1.3.11 | 2 | entrada higienizada antes do sistema de e-mail | aplica | ATENDIDO | INSPEÇÃO | endereços validados pelo schema de e-mail (`backend/src/shared/validation/common.schemas.js`); cabeçalhos montados pelo nodemailer | — | — |
| V1.4.1 | 2 | operações de memória seguras contra overflow | INV-24: runtime de memória gerenciada | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V1.4.2 | 2 | validação de sinal e faixa contra overflow de inteiro | aplica | ATENDIDO | AUTO-NOVO | `backend/test/conformance/asvs-sessao-senha.test.js` (ID acima do INT do MySQL responde 4xx); `positiveInteger` em `backend/src/shared/validation/common.schemas.js` | — | — |
| V1.4.3 | 2 | memória liberada sem ponteiro pendente | INV-24: runtime de memória gerenciada | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V1.5.1 | 1 | parser XML restritivo contra XXE | INV-24: sem XML (INV-09: só JSON) | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V1.5.2 | 2 | desserialização de dado não confiável sem tipos arbitrários | aplica | ATENDIDO | INSPEÇÃO | só `JSON.parse` seguido de schema; webhook depois do HMAC (`backend/src/modules/github/github-app.service.js`); `payload` do multipart validado (`backend/src/modules/testCases/test-evidence.middleware.js`) | — | — |

## V2 — Validation and Business Logic

| ID | Nível | Resumo | Aplicabilidade | Veredito | Classe | Evidência | Limite / dono | Backlog |
|---|---|---|---|---|---|---|---|---|
| V2.1.1 | 1 | documentação define regras de validação de cada dado | aplica | PARCIAL | INSPEÇÃO | entradas por rota em `docs/api/API_CONTRACTS.md`; limites comuns só no código (`backend/src/shared/validation/common.schemas.js`) | regras não consolidadas num documento | CONF-F16 |
| V2.1.2 | 2 | documentação define consistência entre dados combinados | aplica | PARCIAL | INSPEÇÃO | regras de domínio por módulo em `docs/data/` (ex.: `docs/data/PLANNING_HISTORY.md`) | sem visão geral das combinações | CONF-F16 |
| V2.1.3 | 2 | limites de negócio documentados por usuário e globais | aplica | PARCIAL | INSPEÇÃO | limites de taxa em `backend/.env.example`; limites de upload em `docs/data/TEST_CASE_HISTORY.md` | limites de páginas, preferências e convites dispersos no código | CONF-F16 |
| V2.2.1 | 1 | validação positiva por allowlist, padrão e faixa | aplica | ATENDIDO | AUTO-EXISTENTE | `strictObject` e enums em `backend/src/shared/validation/common.schemas.js`; `backend/test/conformance/asvs-sessao-senha.test.js` (campo extra responde 400) | — | — |
| V2.2.2 | 1 | validação imposta na camada de serviço confiável | aplica | ATENDIDO | AUTO-EXISTENTE | `backend/src/shared/validation/validate-request.middleware.js` em 187 das 208 rotas (Apêndice A do relatório) | — | — |
| V2.2.3 | 2 | combinações de dados relacionados conferidas | aplica | ATENDIDO | AUTO-EXISTENTE | vínculos exigem o mesmo projeto (`backend/test/api/lr1-authorization-hardening.test.js`); datas de sprint validadas no serviço | — | — |
| V2.3.1 | 1 | fluxos de negócio na ordem esperada, sem pular etapa | aplica | ATENDIDO | AUTO-EXISTENTE | tokens de uso único e transições de estado (`backend/test/api/auth-authorization.test.js`: recuperação e convite) | — | — |
| V2.3.2 | 2 | limites de negócio implementados conforme a documentação | aplica | PARCIAL | INSPEÇÃO | limites implementados (`backend/src/shared/validation/common.schemas.js`, `backend/src/shared/security/rate-limit.js`) | a documentação de referência está dispersa (V2.1.3) | CONF-F16 |
| V2.3.3 | 2 | operação de negócio inteira ou desfeita, com transação | aplica | ATENDIDO | AUTO-EXISTENTE | `prisma.$transaction` nas escritas compostas; prazo próprio (`backend/src/database/transaction-guard.js`) | — | — |
| V2.3.4 | 2 | trava contra reserva dupla de recurso limitado | aplica | ATENDIDO | AUTO-EXISTENTE | `backend/test/api/auth-authorization.test.js` (convite pendente único e último OWNER sob concorrência) | — | — |
| V2.4.1 | 2 | controles contra automação e uso excessivo | aplica | PARCIAL | AUTO-EXISTENTE | `backend/test/unit/security.test.js` (limites e isolamento por IP e por usuário) | contador em memória por instância; upload e SSE sem teto por usuário | E15-F07 |

## V3 — Web Frontend Security

| ID | Nível | Resumo | Aplicabilidade | Veredito | Classe | Evidência | Limite / dono | Backlog |
|---|---|---|---|---|---|---|---|---|
| V3.2.1 | 1 | navegador não interpreta resposta da API ou arquivo no contexto errado | aplica | ATENDIDO | AUTO-NOVO | `backend/test/conformance/asvs-http.test.js` (`nosniff` e CSP `default-src 'none'`); download como `attachment` (`backend/src/modules/testCases/test-case.controller.js`) | — | — |
| V3.2.2 | 1 | texto exibido com renderização segura, não como HTML | aplica | ATENDIDO | INSPEÇÃO | React renderiza texto; nenhum `dangerouslySetInnerHTML` ou `innerHTML` em `frontend/src` | — | — |
| V3.3.1 | 1 | cookie com Secure e prefixo __Host- ou __Secure- | aplica | NÃO ATENDIDO | AUTO-NOVO | `Secure` só em produção (`backend/src/modules/auth/auth.controller.js`); o nome `traceflow_session` não tem prefixo (reprodução CF-01) | — | CONF-F01 |
| V3.3.2 | 2 | SameSite de cada cookie conforme o propósito | aplica | ATENDIDO | AUTO-NOVO | `backend/test/conformance/asvs-sessao-senha.test.js` (`SameSite=Lax`); cookie do OAuth com `Lax` e caminho restrito | — | — |
| V3.3.3 | 2 | cookie com prefixo __Host- | aplica | NÃO ATENDIDO | AUTO-NOVO | sem prefixo (reprodução CF-01) | — | CONF-F01 |
| V3.3.4 | 2 | cookie de sessão HttpOnly e token só via Set-Cookie | aplica | ATENDIDO | AUTO-NOVO | `backend/test/conformance/asvs-sessao-senha.test.js` (HttpOnly; token ausente do corpo) | — | — |
| V3.4.1 | 1 | HSTS em todas as respostas, um ano, com subdomínios | aplica | PARCIAL | AUTO-NOVO | `backend/test/conformance/asvs-http.test.js` (HSTS de produção com um ano e `includeSubDomains`) | respostas do host do SPA: S2-09 (implantação) | — |
| V3.4.2 | 1 | Access-Control-Allow-Origin fixo ou validado por allowlist | aplica | ATENDIDO | AUTO-NOVO | `backend/test/conformance/asvs-http.test.js`; `backend/test/unit/security.test.js`; `backend/src/shared/security/cors.js` | — | — |
| V3.4.3 | 2 | CSP com object-src e base-uri none | aplica | PARCIAL | AUTO-NOVO | `backend/test/conformance/asvs-http.test.js` (`object-src 'none'`); a CSP real traz `base-uri 'self'` (`backend/src/shared/security/headers.js`) | CSP do SPA: S2-09 (implantação) | CONF-F05 |
| V3.4.4 | 2 | nosniff em todas as respostas | aplica | PARCIAL | AUTO-NOVO | `backend/test/conformance/asvs-http.test.js` (200, 400, 401, 403, 404, 413, 415 e 429) | respostas do host do SPA: S2-09 (implantação) | — |
| V3.4.5 | 2 | política de referrer contra vazamento | aplica | PARCIAL | AUTO-NOVO | `backend/test/conformance/asvs-http.test.js` (`no-referrer` na API) | o SPA não define política e leva token na URL (V14.2.1); host: S2-09 (implantação) | CONF-F06 |
| V3.4.6 | 2 | frame-ancestors em todas as respostas | aplica | PARCIAL | AUTO-NOVO | `backend/test/conformance/asvs-http.test.js` (`frame-ancestors 'none'`) | respostas do host do SPA: S2-09 (implantação) | — |
| V3.5.1 | 1 | token antiforjamento quando não se depende de preflight | aplica | ATENDIDO | AUTO-EXISTENTE | `backend/src/middlewares/auth/csrf.middleware.js`; `backend/test/api/auth-authorization.test.js` (CSRF inválido, de outra sessão e após revogação) | — | — |
| V3.5.2 | 1 | requisição sem preflight não alcança função sensível | aplica | ATENDIDO | AUTO-NOVO | `backend/test/conformance/asvs-http.test.js` (formulário entre sites recebe 415); `backend/src/shared/security/body.js` | — | — |
| V3.5.3 | 1 | função sensível só por métodos não seguros | aplica | NÃO ATENDIDO | INSPEÇÃO | `GET /api/settings/account/email-change/confirm` e `GET /api/account/reactivation/confirm` mudam estado (`backend/src/modules/settings/settings-public.routes.js`) | os callbacks OAuth são GET pela especificação | CONF-F06 |
| V3.5.4 | 2 | aplicações separadas em hostnames diferentes | aplica | NÃO VERIFICÁVEL LOCALMENTE | EXTERNO | — | S2-08 (infraestrutura) | — |
| V3.5.5 | 2 | postMessage descarta origem não confiável | INV-26: sem postMessage | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V3.7.1 | 2 | só tecnologias de cliente suportadas e seguras | aplica | ATENDIDO | INSPEÇÃO | React 19 e Vite; nenhum plugin de navegador (`frontend/package.json`) | — | — |
| V3.7.2 | 2 | redirecionamento para outro host só por allowlist | aplica | ATENDIDO | INSPEÇÃO | callbacks devolvem ao `frontendUrl` com `returnTo` interno higienizado (`backend/src/modules/auth/github-auth.service.js`) | — | — |

## V4 — API and Web Service

| ID | Nível | Resumo | Aplicabilidade | Veredito | Classe | Evidência | Limite / dono | Backlog |
|---|---|---|---|---|---|---|---|---|
| V4.1.1 | 1 | Content-Type com charset em toda resposta com corpo | aplica | ATENDIDO | AUTO-NOVO | `backend/test/conformance/asvs-http.test.js` (todas as classes de resposta); SSE com charset (`backend/test/api/project-events-sse.test.js`); download com charset acrescentado pelo `res.set` (`backend/src/modules/testCases/test-case.controller.js`) | — | — |
| V4.1.2 | 2 | só endpoints de navegador redirecionam HTTP para HTTPS | aplica | NÃO VERIFICÁVEL LOCALMENTE | EXTERNO | — | S2-09 (implantação) | — |
| V4.1.3 | 2 | cabeçalho de intermediário não sobrescrito pelo usuário | aplica | PARCIAL | INSPEÇÃO | `trust proxy` só por contagem de saltos, `true` recusado (`backend/src/config/env.js`) | configuração do proxy: S2-09 (implantação) | — |
| V4.2.1 | 2 | limites de mensagem HTTP corretos contra smuggling | aplica | NÃO VERIFICÁVEL LOCALMENTE | EXTERNO | — | proxy e servidor de implantação: S2-09 (implantação) | — |
| V4.3.1 | 2 | limite de custo de consulta GraphQL | INV-21: sem GraphQL | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V4.3.2 | 2 | introspecção GraphQL desligada em produção | INV-21: sem GraphQL | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V4.4.1 | 1 | WebSocket só sobre TLS | INV-21: sem WebSocket (INV-17: o stream é SSE) | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V4.4.2 | 2 | Origin conferida no handshake WebSocket | INV-21: sem WebSocket | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V4.4.3 | 2 | tokens dedicados de sessão WebSocket | INV-21: sem WebSocket | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V4.4.4 | 2 | token WebSocket obtido pela sessão HTTPS autenticada | INV-21: sem WebSocket | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |

## V5 — File Handling

| ID | Nível | Resumo | Aplicabilidade | Veredito | Classe | Evidência | Limite / dono | Backlog |
|---|---|---|---|---|---|---|---|---|
| V5.1.1 | 2 | documentação de tipos, extensões, tamanho e download seguro de upload | aplica | PARCIAL | INSPEÇÃO | tipos e limites em `docs/data/TEST_CASE_HISTORY.md` | o documento não descreve o download seguro (`attachment`, `nosniff`); a baseline ainda declara "sem upload" (K1) | CONF-F21 |
| V5.2.1 | 1 | arquivo aceito só até tamanho processável | aplica | ATENDIDO | INSPEÇÃO | 10 MiB por arquivo, 50 MiB por vídeo, 100 MiB por execução (`backend/src/modules/testCases/storage/test-evidence.validation.js`), impostos durante o stream (`backend/src/modules/testCases/storage/local-test-evidence.storage.js`) | — | — |
| V5.2.2 | 1 | extensão esperada e conteúdo compatível com o tipo | aplica | ATENDIDO | INSPEÇÃO | `file-type` sobre os primeiros 64 KiB e extensão declarada (`backend/src/modules/testCases/storage/test-evidence.validation.js`) | — | — |
| V5.2.3 | 2 | arquivo compactado conferido antes de extrair | INV-25: sem arquivo compactado | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V5.3.1 | 1 | arquivo enviado não executa como código no servidor | aplica | ATENDIDO | INSPEÇÃO | armazenamento fora de `public/`, `frontend/` e `dist/`, sem servidor estático (`backend/src/modules/testCases/storage/local-test-evidence.storage.js`) | — | — |
| V5.3.2 | 1 | caminho de arquivo gerado internamente | aplica | ATENDIDO | INSPEÇÃO | chave UUID conferida por regex antes de cada `join` (`backend/src/modules/testCases/storage/local-test-evidence.storage.js`) | — | — |
| V5.4.1 | 2 | nome do arquivo validado e informado no Content-Disposition | aplica | ATENDIDO | INSPEÇÃO | `attachment; filename="evidence"; filename*=UTF-8''…` (`backend/src/modules/testCases/test-case.controller.js`) | — | — |
| V5.4.2 | 2 | nome servido codificado conforme o RFC 6266 | aplica | ATENDIDO | INSPEÇÃO | `filename*` com `encodeURIComponent` (`backend/src/modules/testCases/test-case.controller.js`) | — | — |
| V5.4.3 | 2 | arquivo de fonte não confiável verificado por antivírus | aplica | NÃO ATENDIDO | INSPEÇÃO | não há varredura antivírus das evidências | — | CONF-F13 |

## V6 — Authentication

| ID | Nível | Resumo | Aplicabilidade | Veredito | Classe | Evidência | Limite / dono | Backlog |
|---|---|---|---|---|---|---|---|---|
| V6.1.1 | 1 | documentação dos controles contra credential stuffing e força bruta | aplica | ATENDIDO | INSPEÇÃO | `docs/security/THREAT_MODEL.md`:5 e variáveis do limitador em `backend/.env.example` | — | — |
| V6.1.2 | 2 | lista documentada de palavras de contexto proibidas | aplica | NÃO ATENDIDO | INSPEÇÃO | `backend/src/modules/auth/identity-policy.js` recusa só o nome de usuário e o e-mail; não há lista documentada | — | CONF-F03 |
| V6.1.3 | 2 | caminhos de autenticação documentados com seus controles | aplica | ATENDIDO | INSPEÇÃO | senha local (`docs/architecture/ADR-002-AUTHENTICATION-SESSION.md`) e OAuth do GitHub (`docs/architecture/ADR-012-GITHUB-OAUTH-APP-DECOUPLING.md`) | — | — |
| V6.2.1 | 1 | senha com pelo menos 8 caracteres | aplica | ATENDIDO | AUTO-NOVO | `backend/test/conformance/asvs-sessao-senha.test.js` (mínimo de 12) | — | — |
| V6.2.2 | 1 | usuário pode trocar a senha | aplica | ATENDIDO | AUTO-EXISTENTE | `backend/test/api/settings-l2.test.js` (troca de senha preserva a sessão atual) | — | — |
| V6.2.3 | 1 | troca de senha exige a senha atual e a nova | aplica | ATENDIDO | AUTO-NOVO | `backend/test/conformance/asvs-sessao-senha.test.js`; `backend/test/api/settings-l2.test.js` | — | — |
| V6.2.4 | 1 | senha conferida contra as 3000 mais comuns | aplica | NÃO ATENDIDO | AUTO-NOVO | a lista local tem 15 itens (`backend/src/modules/auth/identity-policy.js`); 4 senhas comuns aceitas (reprodução CF-03) | — | CONF-F03 |
| V6.2.5 | 1 | senha de qualquer composição, sem regra de caracteres | aplica | ATENDIDO | AUTO-NOVO | `backend/test/conformance/asvs-sessao-senha.test.js` | — | — |
| V6.2.6 | 1 | campo de senha mascarado | aplica | ATENDIDO | INSPEÇÃO | `type="password"` com botão de exibição (`frontend/src/features/auth/components/PasswordField.jsx`) | — | — |
| V6.2.7 | 1 | colar e gerenciador de senhas permitidos | aplica | ATENDIDO | INSPEÇÃO | `autocomplete` `current-password`/`new-password` e nenhum bloqueio de colar (`frontend/src/features/auth/components/PasswordField.jsx`) | — | — |
| V6.2.8 | 1 | senha conferida exatamente como digitada | aplica | ATENDIDO | AUTO-NOVO | `backend/test/conformance/asvs-sessao-senha.test.js` (sem corte nem troca de caixa) | — | — |
| V6.2.9 | 2 | senha de pelo menos 64 caracteres permitida | aplica | ATENDIDO | AUTO-NOVO | `backend/test/conformance/asvs-sessao-senha.test.js` (até 128) | — | — |
| V6.2.10 | 2 | sem rotação periódica obrigatória | aplica | ATENDIDO | INSPEÇÃO | nenhuma expiração de senha em `backend/src/modules/auth/identity-policy.js` ou `backend/src/modules/auth/auth.service.js` | — | — |
| V6.2.11 | 2 | lista de palavras de contexto aplicada | aplica | NÃO ATENDIDO | INSPEÇÃO | não há lista documentada (V6.1.2) | — | CONF-F03 |
| V6.2.12 | 2 | senha conferida contra senhas vazadas | aplica | NÃO ATENDIDO | INSPEÇÃO | não há verificação de senhas vazadas | — | CONF-F03 |
| V6.3.1 | 1 | controles contra credential stuffing e força bruta implementados | aplica | ATENDIDO | AUTO-EXISTENTE | `backend/test/unit/security.test.js`; limitador de autenticação por IP e identificador (`backend/src/shared/security/rate-limit.js`) | — | — |
| V6.3.2 | 1 | sem contas padrão | aplica | ATENDIDO | INSPEÇÃO | nenhuma conta semeada; nomes como `admin` reservados (`backend/src/modules/auth/identity-policy.js`) | — | — |
| V6.3.3 | 2 | MFA ou combinação de fatores | aplica | NÃO ATENDIDO | INSPEÇÃO | sem MFA (INV-23) | — | L1-F04 |
| V6.3.4 | 2 | sem caminho de autenticação não documentado; força consistente | aplica | ATENDIDO | INSPEÇÃO | só senha local e OAuth do GitHub (`docs/architecture/ADR-002-AUTHENTICATION-SESSION.md`, `docs/architecture/ADR-012-GITHUB-OAUTH-APP-DECOUPLING.md`); estados de conta aplicados aos dois | — | — |
| V6.4.1 | 1 | códigos iniciais aleatórios, com expiração e uso único | aplica | ATENDIDO | AUTO-EXISTENTE | tokens de verificação e convite de 32 bytes, com prazo e uso único (`backend/test/api/auth-authorization.test.js`) | — | — |
| V6.4.2 | 1 | sem dica de senha nem pergunta secreta | aplica | ATENDIDO | INSPEÇÃO | o modelo `User` não tem campo de dica nem de pergunta secreta (`backend/prisma/schema.prisma`) | — | — |
| V6.4.3 | 2 | recuperação de senha segura | aplica | ATENDIDO | AUTO-EXISTENTE | `backend/test/api/auth-authorization.test.js` (recuperação uniforme e token de uso único) | — | — |
| V6.4.4 | 2 | perda de fator MFA com prova de identidade | INV-23: sem MFA | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V6.5.1 | 2 | segredos de consulta e códigos de uso único | INV-23: sem OTP nem segredo de consulta | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V6.5.2 | 2 | segredos de consulta guardados com hash | INV-23: sem segredo de consulta | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V6.5.3 | 2 | segredos e sementes OTP gerados por CSPRNG | INV-23: sem OTP | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V6.5.4 | 2 | entropia mínima de códigos fora de banda | INV-23: sem código fora de banda | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V6.5.5 | 2 | validade definida de código fora de banda e TOTP | INV-23: sem código fora de banda nem TOTP | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V6.6.1 | 2 | OTP por telefone só com número validado | INV-23: sem SMS nem telefonia | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V6.6.2 | 2 | código fora de banda ligado à requisição original | INV-23: sem código fora de banda | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V6.6.3 | 2 | código fora de banda com limite de tentativas | INV-23: sem código fora de banda | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V6.8.1 | 2 | identidade não falsificável por outro provedor | aplica | ATENDIDO | INSPEÇÃO | identidade pelo ID numérico do GitHub; sem ligação automática por e-mail (`backend/src/modules/auth/github-auth.service.js`) | — | — |
| V6.8.2 | 2 | assinatura de asserções de autenticação validada | INV-23: sem asserção assinada consumida | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V6.8.3 | 2 | asserção SAML usada uma vez | INV-23: sem SAML | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V6.8.4 | 2 | força e recência informadas pelo provedor conferidas | INV-23: o app não depende de força informada pelo provedor | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |

## V7 — Session Management

| ID | Nível | Resumo | Aplicabilidade | Veredito | Classe | Evidência | Limite / dono | Backlog |
|---|---|---|---|---|---|---|---|---|
| V7.1.1 | 2 | timeout por inatividade e vida máxima documentados e justificados | aplica | NÃO ATENDIDO | INSPEÇÃO | TTL absoluto configurado (`backend/.env.example`); sem timeout por inatividade nem justificativa frente ao NIST | — | CONF-F04 |
| V7.1.2 | 2 | sessões simultâneas por conta documentadas | aplica | NÃO ATENDIDO | INSPEÇÃO | nenhum documento define o limite nem o comportamento | — | CONF-F04 |
| V7.1.3 | 2 | sessão federada e coordenação de vida documentadas | aplica | PARCIAL | INSPEÇÃO | `docs/architecture/ADR-012-GITHUB-OAUTH-APP-DECOUPLING.md` descreve o login pelo GitHub | não diz que a sessão local independe da sessão do GitHub | CONF-F22 |
| V7.2.1 | 1 | token de sessão verificado no backend | aplica | ATENDIDO | INSPEÇÃO | `backend/src/modules/auth/auth.service.js` confere hash, revogação, expiração e versão | — | — |
| V7.2.2 | 1 | token de sessão dinâmico, não chave estática | aplica | ATENDIDO | INSPEÇÃO | token aleatório por login (`backend/src/modules/auth/auth.service.js`) | — | — |
| V7.2.3 | 1 | token de referência único, CSPRNG, 128 bits ou mais | aplica | ATENDIDO | INSPEÇÃO | `randomBytes(32)` (`backend/src/modules/auth/auth.service.js`) | — | — |
| V7.2.4 | 1 | novo token na autenticação e encerramento do anterior | aplica | NÃO ATENDIDO | AUTO-NOVO | cria token novo, mas o token apresentado continua válido (reprodução CF-02) | — | CONF-F02 |
| V7.3.1 | 2 | timeout por inatividade com reautenticação | aplica | NÃO ATENDIDO | AUTO-NOVO | `lastSeenAt` é gravado e nunca conferido; sessão ociosa por 7 dias continua válida (reprodução CF-04) | — | CONF-F04 |
| V7.3.2 | 2 | vida máxima absoluta da sessão | aplica | ATENDIDO | AUTO-EXISTENTE | `backend/test/api/auth-authorization.test.js` (TTL de 8 h e de 30 dias com "manter conectado", sem renovação) | — | — |
| V7.4.1 | 1 | sessão encerrada não pode ser reutilizada | aplica | ATENDIDO | AUTO-EXISTENTE | `backend/test/api/auth-authorization.test.js` (logout invalida a sessão) | — | — |
| V7.4.2 | 1 | sessões encerradas quando a conta é desativada ou excluída | aplica | PARCIAL | INSPEÇÃO | desativação revoga as outras sessões e mantém a atual restrita (`backend/src/modules/settings/settings.repository.js`:293-320, `docs/architecture/ADR-002-AUTHENTICATION-SESSION.md`); pedido de exclusão revoga todas | sessão restrita é decisão do ADR-002 | CONF-F23 |
| V7.4.3 | 2 | opção de encerrar as outras sessões após troca de fator | aplica | ATENDIDO | AUTO-EXISTENTE | `backend/test/api/settings-l2.test.js` (troca de senha encerra as outras sessões) | — | — |
| V7.4.4 | 2 | logout visível em toda página autenticada | aplica | ATENDIDO | INSPEÇÃO | menu da conta no shell (`frontend/src/app/layout/AppShell.jsx`) | — | — |
| V7.4.5 | 2 | administrador encerra sessões de um usuário ou de todos | aplica | NÃO ATENDIDO | INSPEÇÃO | não há papel administrativo global (D-TCC-01) | — | CONF-F14 |
| V7.5.1 | 2 | reautenticação antes de mudar atributo sensível da conta | aplica | ATENDIDO | INSPEÇÃO | `requireSensitiveAuthentication` na troca de e-mail, exclusão e desvinculação (`backend/src/modules/settings/settings.service.js`) | — | — |
| V7.5.2 | 2 | ver e encerrar sessões após nova autenticação | aplica | PARCIAL | AUTO-EXISTENTE | `backend/test/api/settings-l2.test.js` (lista e revoga sessões) | revogar não pede reautenticação | CONF-F17 |
| V7.6.1 | 2 | vida da sessão entre RP e IdP conforme documentado | aplica | PARCIAL | INSPEÇÃO | reautenticação pelo GitHub com validade de 10 min (`backend/src/modules/auth/github-auth.service.js`) | ciclo da sessão federada não documentado (V7.1.3) | CONF-F22 |
| V7.6.2 | 2 | sessão criada só com ação explícita do usuário | aplica | ATENDIDO | INSPEÇÃO | o OAuth começa por `POST /api/auth/github/start`, acionado pelo usuário (`backend/src/modules/auth/github-auth.service.js`) | — | — |

## V8 — Authorization

| ID | Nível | Resumo | Aplicabilidade | Veredito | Classe | Evidência | Limite / dono | Backlog |
|---|---|---|---|---|---|---|---|---|
| V8.1.1 | 1 | documentação de acesso por função e por dado | aplica | ATENDIDO | INSPEÇÃO | `docs/security/AUTHORIZATION_MATRIX.md` | — | — |
| V8.1.2 | 2 | documentação de acesso por campo | aplica | PARCIAL | INSPEÇÃO | `docs/security/AUTHORIZATION_MATRIX.md` é por rota; a minimização por campo está nos mappers | regras por campo não documentadas | CONF-F15 |
| V8.2.1 | 1 | acesso a funções restrito a quem tem permissão | aplica | ATENDIDO | SONDA | desde `1a2700c` (PR #26, TF-REV-001), caminho da `/api` com `%` recebe o 404 opaco antes da autorização (`backend/src/middlewares/canonical-path.middleware.js`); a varredura repete a matriz com o ID codificado em cada posição (`backend/test/conformance/autorizacao-varredura.test.js`, `backend/test/unit/pr26-caminho-canonico.test.js`) | — | CONF-F51 (fechado) |
| V8.2.2 | 1 | acesso a dados restrito por item (IDOR/BOLA) | aplica | ATENDIDO | SONDA | desde `1a2700c` (PR #26, TF-REV-001), caminho da `/api` com `%` recebe o 404 opaco antes da autorização (`backend/src/middlewares/canonical-path.middleware.js`); a varredura repete a matriz com o ID codificado em cada posição (`backend/test/conformance/autorizacao-varredura.test.js`, `backend/test/unit/pr26-caminho-canonico.test.js`); com ID plano, 404 opaco em toda rota de projeto | — | CONF-F51 (fechado) |
| V8.2.3 | 2 | acesso a campos restrito (BOPLA) | aplica | ATENDIDO | AUTO-EXISTENTE | schemas estritos e DTOs; `backend/test/api/auth-authorization.test.js` (e-mail minimizado na lista de membros) | — | — |
| V8.3.1 | 1 | autorização na camada de serviço confiável | aplica | ATENDIDO | SONDA | desde `1a2700c` (PR #26, TF-REV-001), caminho da `/api` com `%` recebe o 404 opaco antes da autorização (`backend/src/middlewares/canonical-path.middleware.js`); a varredura repete a matriz com o ID codificado em cada posição (`backend/test/conformance/autorizacao-varredura.test.js`, `backend/test/unit/pr26-caminho-canonico.test.js`); as leituras de alertas também conferem a membership no serviço (`backend/test/api/pr26-alertas-leitura.test.js`, L-17) | — | CONF-F51 (fechado) |
| V8.4.1 | 2 | controles entre tenants | aplica | ATENDIDO | SONDA | desde `1a2700c` (PR #26, TF-REV-001), caminho da `/api` com `%` recebe o 404 opaco antes da autorização (`backend/src/middlewares/canonical-path.middleware.js`); a varredura repete a matriz com o ID codificado em cada posição (`backend/test/conformance/autorizacao-varredura.test.js`, `backend/test/unit/pr26-caminho-canonico.test.js`); vínculos pelo corpo entre projetos recusados (`backend/test/conformance/vinculos-e-recursos-pessoais.test.js`) | — | CONF-F51 (fechado) |

## V9 — Self-contained Tokens

| ID | Nível | Resumo | Aplicabilidade | Veredito | Classe | Evidência | Limite / dono | Backlog |
|---|---|---|---|---|---|---|---|---|
| V9.1.1 | 1 | token autocontido validado por assinatura ou MAC | INV-21: a aplicação não consome token autocontido; o único JWT é emitido para o GitHub (INV-10) | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V9.1.2 | 1 | só algoritmos de allowlist para tokens autocontidos | INV-21: a aplicação não consome token autocontido; o único JWT é emitido para o GitHub (INV-10) | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V9.1.3 | 1 | chave de validação de origem confiável | INV-21: a aplicação não consome token autocontido; o único JWT é emitido para o GitHub (INV-10) | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V9.2.1 | 1 | janela de validade do token conferida | INV-21: a aplicação não consome token autocontido; o único JWT é emitido para o GitHub (INV-10) | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V9.2.2 | 2 | tipo e propósito do token conferidos | INV-21: a aplicação não consome token autocontido; o único JWT é emitido para o GitHub (INV-10) | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V9.2.3 | 2 | audiência do token conferida | INV-21: a aplicação não consome token autocontido; o único JWT é emitido para o GitHub (INV-10) | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V9.2.4 | 2 | tokens de uma chave para várias audiências com audiência restrita | INV-21: a aplicação não consome token autocontido; o único JWT é emitido para o GitHub (INV-10) | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |

## V10 — OAuth and OIDC

| ID | Nível | Resumo | Aplicabilidade | Veredito | Classe | Evidência | Limite / dono | Backlog |
|---|---|---|---|---|---|---|---|---|
| V10.1.1 | 2 | tokens só para componentes que precisam deles | aplica | ATENDIDO | INSPEÇÃO | token de usuário do GitHub só em memória no backend, nunca no frontend (`backend/src/modules/github/github-credential.provider.js`, `docs/privacy/DATA_FLOW_MAP.md`:9) | — | — |
| V10.1.2 | 2 | cliente só aceita valores do fluxo iniciado pela mesma sessão | aplica | ATENDIDO | INSPEÇÃO | `state` igual ao cookie, com hash, ligado à sessão e de uso único (`backend/src/modules/auth/github-auth.service.js`) | — | — |
| V10.2.1 | 2 | fluxo de código protegido contra CSRF (PKCE ou state) | aplica | ATENDIDO | INSPEÇÃO | PKCE S256 e `state` no login (`backend/src/modules/auth/github-auth.service.js`); `state` ligado à sessão na instalação da App (`backend/src/modules/github/github-app.service.js`) | — | — |
| V10.2.2 | 2 | defesa contra mix-up entre servidores de autorização | INV-10: um único servidor de autorização (GitHub) | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V10.3.1 | 2 | servidor de recursos aceita só tokens da sua audiência | INV-27: a aplicação não é servidor de recursos OAuth | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V10.3.2 | 2 | decisão do servidor de recursos baseada nas claims | INV-27: a aplicação não é servidor de recursos OAuth | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V10.3.3 | 2 | usuário identificado por claim não reatribuível | INV-27: a aplicação não é servidor de recursos OAuth | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V10.3.4 | 2 | força e recência da autenticação no token conferidas | INV-27: a aplicação não é servidor de recursos OAuth | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V10.4.1 | 1 | redirect URI conferida por comparação exata | INV-27: a aplicação não é servidor de autorização | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V10.4.2 | 1 | código de autorização de uso único | INV-27: a aplicação não é servidor de autorização | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V10.4.3 | 1 | código de autorização de vida curta | INV-27: a aplicação não é servidor de autorização | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V10.4.4 | 1 | só os grants de que o cliente precisa | INV-27: a aplicação não é servidor de autorização | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V10.4.5 | 1 | replay de refresh token mitigado | INV-27: a aplicação não é servidor de autorização | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V10.4.6 | 2 | PKCE exigido pelo servidor de autorização | INV-27: a aplicação não é servidor de autorização | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V10.4.7 | 2 | registro dinâmico de cliente controlado | INV-27: a aplicação não é servidor de autorização | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V10.4.8 | 2 | refresh token com expiração absoluta | INV-27: a aplicação não é servidor de autorização | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V10.4.9 | 2 | tokens revogáveis pelo usuário | INV-27: a aplicação não é servidor de autorização | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V10.4.10 | 2 | cliente confidencial autenticado nos canais de fundo | INV-27: a aplicação não é servidor de autorização | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V10.4.11 | 2 | só os escopos necessários atribuídos ao cliente | INV-27: a aplicação não é servidor de autorização | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V10.5.1 | 2 | replay de ID Token mitigado | INV-23: o OAuth do GitHub não emite ID Token (sem OIDC) | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V10.5.2 | 2 | usuário identificado pela claim sub do ID Token | INV-23: o OAuth do GitHub não emite ID Token (sem OIDC) | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V10.5.3 | 2 | metadados de servidor de autorização falsos recusados | INV-23: o OAuth do GitHub não emite ID Token (sem OIDC) | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V10.5.4 | 2 | audiência do ID Token conferida | INV-23: o OAuth do GitHub não emite ID Token (sem OIDC) | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V10.5.5 | 2 | logout por canal de fundo OIDC seguro | INV-23: o OAuth do GitHub não emite ID Token (sem OIDC) | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V10.6.1 | 2 | modos de resposta permitidos pelo provedor OpenID | INV-27: a aplicação não é provedor OpenID nem servidor de autorização | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V10.6.2 | 2 | logout forçado mitigado pelo provedor OpenID | INV-27: a aplicação não é provedor OpenID nem servidor de autorização | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V10.7.1 | 2 | consentimento do usuário em cada autorização | INV-27: a aplicação não é provedor OpenID nem servidor de autorização | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V10.7.2 | 2 | informação clara no pedido de consentimento | INV-27: a aplicação não é provedor OpenID nem servidor de autorização | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V10.7.3 | 2 | consentimentos revisáveis e revogáveis | INV-27: a aplicação não é provedor OpenID nem servidor de autorização | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |

## V11 — Cryptography

| ID | Nível | Resumo | Aplicabilidade | Veredito | Classe | Evidência | Limite / dono | Backlog |
|---|---|---|---|---|---|---|---|---|
| V11.1.1 | 2 | política documentada de gestão e ciclo de vida de chaves | aplica | PARCIAL | INSPEÇÃO | `docs/security/SECRETS_POLICY.md` cobre o ciclo de vida dos segredos | sem alinhamento a padrão de gestão de chaves | CONF-F09 |
| V11.1.2 | 2 | inventário criptográfico mantido | aplica | NÃO ATENDIDO | INSPEÇÃO | não há inventário de chaves, algoritmos e certificados | — | CONF-F09 |
| V11.2.1 | 2 | implementações criptográficas validadas pela indústria | aplica | ATENDIDO | INSPEÇÃO | `node:crypto` e `argon2` (`backend/src/modules/auth/auth.service.js`); nenhuma primitiva própria | — | — |
| V11.2.2 | 2 | agilidade criptográfica | aplica | PARCIAL | INSPEÇÃO | algoritmos e parâmetros fixos no código (`backend/src/modules/auth/auth.service.js`) | troca exige mudança de código; sem rehash de senha | CONF-F09 |
| V11.2.3 | 2 | primitivas com pelo menos 128 bits de segurança | aplica | PARCIAL | INSPEÇÃO | SHA-256, HMAC SHA-256, tokens de 256 bits e Argon2id atendem | chave RSA 2048 da GitHub App (cerca de 112 bits), imposta pelo GitHub | CONF-F09 |
| V11.3.1 | 1 | sem modo de bloco inseguro nem padding fraco | INV-27: sem cifragem simétrica de dados | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V11.3.2 | 1 | só cifras e modos aprovados | INV-27: sem cifragem simétrica de dados | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V11.3.3 | 2 | dado cifrado protegido contra alteração | INV-27: sem cifragem simétrica de dados | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V11.4.1 | 1 | só funções de hash aprovadas; sem MD5 | aplica | ATENDIDO | INSPEÇÃO | SHA-256 em todo hash; zero MD5 e SHA-1 em `backend/src` | — | — |
| V11.4.2 | 2 | senha guardada com KDF intensiva e parâmetros atuais | aplica | ATENDIDO | INSPEÇÃO | Argon2id com 19 MiB, t=2 e p=1 (`backend/src/modules/auth/auth.service.js`) | — | — |
| V11.4.3 | 2 | hash resistente a colisão com 256 bits para integridade | aplica | ATENDIDO | INSPEÇÃO | SHA-256 nas evidências e no HMAC do webhook (`backend/src/modules/github/github-app.service.js`) | — | — |
| V11.4.4 | 2 | KDF com estiramento ao derivar chave de senha | INV-27: nenhuma chave derivada de senha | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V11.5.1 | 2 | valores não adivinháveis por CSPRNG com 128 bits ou mais | aplica | ATENDIDO | INSPEÇÃO | `randomBytes(32)` para sessão, reset, convite, verificação e state (`backend/src/modules/auth/auth.service.js`, `backend/src/modules/auth/github-auth.service.js`); UUID só em identificadores sem papel de segredo | — | — |
| V11.6.1 | 2 | geração de chave e assinatura com algoritmos aprovados | aplica | ATENDIDO | INSPEÇÃO | JWT RS256 com a chave emitida pelo GitHub (`backend/src/modules/github/github-credential.provider.js`) | — | — |

## V12 — Secure Communication

| ID | Nível | Resumo | Aplicabilidade | Veredito | Classe | Evidência | Limite / dono | Backlog |
|---|---|---|---|---|---|---|---|---|
| V12.1.1 | 1 | só versões recomendadas de TLS | aplica | NÃO VERIFICÁVEL LOCALMENTE | EXTERNO | — | S2-08 (infraestrutura) | — |
| V12.1.2 | 2 | só suítes de cifra recomendadas | aplica | NÃO VERIFICÁVEL LOCALMENTE | EXTERNO | — | S2-08 (infraestrutura) | — |
| V12.1.3 | 2 | certificado de cliente mTLS confiável | INV-27: sem mTLS | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V12.2.1 | 1 | TLS em todo serviço HTTP externo, sem rebaixamento | aplica | NÃO VERIFICÁVEL LOCALMENTE | EXTERNO | — | S2-08 (infraestrutura) | — |
| V12.2.2 | 1 | certificado público confiável nos serviços externos | aplica | NÃO VERIFICÁVEL LOCALMENTE | EXTERNO | — | S2-08 (infraestrutura) | — |
| V12.3.1 | 2 | protocolo cifrado em todas as conexões de entrada e saída | aplica | PARCIAL | INSPEÇÃO | saída para o GitHub só por HTTPS, com host fixo (`backend/src/modules/github/github.client.js`) | MySQL e SMTP: S2-08 (infraestrutura) | — |
| V12.3.2 | 2 | cliente TLS valida o certificado | aplica | ATENDIDO | INSPEÇÃO | nenhum `rejectUnauthorized: false` nem `NODE_TLS_REJECT_UNAUTHORIZED` em `backend/src` | — | — |
| V12.3.3 | 2 | TLS entre serviços internos HTTP | aplica | NÃO VERIFICÁVEL LOCALMENTE | EXTERNO | — | S2-08 (infraestrutura) | — |
| V12.3.4 | 2 | certificados confiáveis entre serviços internos | aplica | NÃO VERIFICÁVEL LOCALMENTE | EXTERNO | — | S2-08 (infraestrutura) | — |

## V13 — Configuration

| ID | Nível | Resumo | Aplicabilidade | Veredito | Classe | Evidência | Limite / dono | Backlog |
|---|---|---|---|---|---|---|---|---|
| V13.1.1 | 2 | necessidades de comunicação documentadas | aplica | ATENDIDO | INSPEÇÃO | `docs/privacy/DATA_FLOW_MAP.md` (navegador, MySQL, GitHub, SMTP, logs e CI/CD) | — | — |
| V13.2.1 | 2 | comunicação entre componentes autenticada com contas de serviço | aplica | NÃO VERIFICÁVEL LOCALMENTE | EXTERNO | — | S2-08 (infraestrutura) | — |
| V13.2.2 | 2 | contas de serviço com menor privilégio | aplica | NÃO VERIFICÁVEL LOCALMENTE | EXTERNO | — | S2-08 (infraestrutura); o `KILL` do ADR-020 exige o mesmo usuário do app | — |
| V13.2.3 | 2 | sem credencial padrão entre serviços | aplica | NÃO VERIFICÁVEL LOCALMENTE | EXTERNO | — | S2-08 (infraestrutura) | — |
| V13.2.4 | 2 | allowlist dos destinos externos | aplica | PARCIAL | INSPEÇÃO | destinos fixos no código (`backend/src/modules/github/github.client.js`, `backend/src/modules/github/github-credential.provider.js`) | a allowlist de `backend/src/shared/security/ssrf.js` não é usada em runtime | CONF-F10 |
| V13.2.5 | 2 | servidor configurado com allowlist de saída | aplica | NÃO VERIFICÁVEL LOCALMENTE | EXTERNO | — | S2-10 (operação) | — |
| V13.3.1 | 2 | solução de gestão de segredos | aplica | NÃO VERIFICÁVEL LOCALMENTE | EXTERNO | `docs/security/SECRETS_POLICY.md` | S2-08 (infraestrutura); o roadmap enfraqueceu o critério (D-RM-19) | E15-F06 |
| V13.3.2 | 2 | acesso a segredos com menor privilégio | aplica | NÃO VERIFICÁVEL LOCALMENTE | EXTERNO | — | S2-08 (infraestrutura) | — |
| V13.4.1 | 1 | sem metadados de controle de versão na implantação | aplica | NÃO VERIFICÁVEL LOCALMENTE | EXTERNO | — | S2-09 (implantação) | — |
| V13.4.2 | 2 | modos de depuração desligados em produção | aplica | ATENDIDO | AUTO-EXISTENTE | `backend/test/unit/shared-infrastructure.test.js` (500 sem stack na resposta); nenhum modo de depuração no Express nem no build do React | — | — |
| V13.4.3 | 2 | sem listagem de diretórios | aplica | PARCIAL | INSPEÇÃO | a API não serve arquivos estáticos | host do SPA: S2-09 (implantação) | — |
| V13.4.4 | 2 | método TRACE recusado | aplica | ATENDIDO | AUTO-NOVO | `backend/test/conformance/asvs-http.test.js` | — | — |
| V13.4.5 | 2 | documentação e monitoramento expostos só de propósito | aplica | ATENDIDO | INSPEÇÃO | `/health*` público por decisão registrada (`docs/security/AUTHORIZATION_MATRIX.md`:9); nenhuma documentação de API exposta | — | — |

## V14 — Data Protection

| ID | Nível | Resumo | Aplicabilidade | Veredito | Classe | Evidência | Limite / dono | Backlog |
|---|---|---|---|---|---|---|---|---|
| V14.1.1 | 2 | dados sensíveis identificados e classificados por nível | aplica | PARCIAL | INSPEÇÃO | `docs/privacy/PERSONAL_DATA_INVENTORY.md` identifica os dados pessoais | sem níveis de proteção | CONF-F19 |
| V14.1.2 | 2 | requisitos de proteção por nível documentados | aplica | PARCIAL | INSPEÇÃO | retenção em `docs/privacy/DATA_RETENTION_POLICY.md`; redaction em `backend/src/shared/logger/redaction.js` | sem requisitos por nível | CONF-F19 |
| V14.2.1 | 1 | dado sensível fora da URL e da query string | aplica | NÃO ATENDIDO | INSPEÇÃO | links de e-mail com `?token=` (`backend/src/shared/email/email.service.js`); troca de e-mail e reativação repassam o token por GET | — | CONF-F06 |
| V14.2.2 | 2 | dado sensível fora de caches de servidor | aplica | ATENDIDO | AUTO-NOVO | `backend/test/conformance/asvs-http.test.js` (`no-store` sob `/api`); a API não tem cache próprio | — | — |
| V14.2.3 | 2 | dado sensível não vai a terceiros | aplica | ATENDIDO | INSPEÇÃO | nenhum rastreador ou analytics em `frontend/src` e `frontend/index.html` | — | — |
| V14.2.4 | 2 | controles de dado sensível conforme a política | aplica | PARCIAL | INSPEÇÃO | redaction (`backend/src/shared/logger/redaction.js`), retenção (`backend/src/shared/maintenance/privacy-retention.js`) | lacunas de retenção a confirmar na H33 | CONF-F19 |
| V14.3.1 | 1 | dado autenticado apagado do cliente ao encerrar a sessão | aplica | NÃO ATENDIDO | INSPEÇÃO | o logout limpa a memória, mas mantém `traceflow.projects.pinned:<id>` e `traceflow.projects.recent:<id>` (`frontend/src/app/layout/quick-projects.js`, `frontend/src/features/auth/AuthContext.jsx`); sem `Clear-Site-Data` | — | CONF-F07 |
| V14.3.2 | 2 | Cache-Control no-store contra cache do navegador | aplica | ATENDIDO | AUTO-NOVO | `backend/test/conformance/asvs-http.test.js`; `backend/test/conformance/asvs-sessao-senha.test.js` | — | — |
| V14.3.3 | 2 | armazenamento do navegador sem dado sensível | aplica | ATENDIDO | INSPEÇÃO | só tema, barra lateral, IDs de projetos e evento de sessão; token CSRF em memória (`frontend/src/app/layout/quick-projects.js`) | — | — |

## V15 — Secure Coding and Architecture

| ID | Nível | Resumo | Aplicabilidade | Veredito | Classe | Evidência | Limite / dono | Backlog |
|---|---|---|---|---|---|---|---|---|
| V15.1.1 | 1 | prazos de remediação de componentes documentados por risco | aplica | PARCIAL | INSPEÇÃO | `docs/security/DEPENDENCY_RISK_REGISTER.md`:126-133 | prazos qualitativos ("imediatamente", "no ciclo atual"), sem número | CONF-F20 |
| V15.1.2 | 2 | inventário de componentes (SBOM) | aplica | NÃO ATENDIDO | INSPEÇÃO | sem SBOM | — | E15-F09 |
| V15.1.3 | 2 | funcionalidades custosas documentadas, com prevenção | aplica | PARCIAL | INSPEÇÃO | custos e limites nos ADR-013, ADR-017, ADR-018 e ADR-021 | chamadas ao GitHub sem timeout não aparecem como risco | CONF-F08 |
| V15.2.1 | 1 | componentes dentro dos prazos de remediação | aplica | ATENDIDO | INSPEÇÃO | `scripts/check-npm-audit.mjs` e `npm audit` em 14/10/2026: zero vulnerabilidades no backend e no frontend | — | — |
| V15.2.2 | 2 | defesas contra perda de disponibilidade em operações custosas | aplica | PARCIAL | INSPEÇÃO | limites de upload, sync com trava e lease, SSE com vida máxima (`backend/src/shared/security/rate-limit.js`, `backend/src/modules/testCases/storage/test-evidence.validation.js`) | `@octokit/request` 9.2.4 ignora `request.timeout` (K11) | CONF-F08 |
| V15.2.3 | 2 | produção sem código de teste ou desenvolvimento exposto | aplica | ATENDIDO | INSPEÇÃO | ecos de token só com `env.isTest`; provider `capture` recusado em produção (`backend/src/config/env.js`) | — | — |
| V15.3.1 | 1 | só o subconjunto necessário de campos devolvido | aplica | ATENDIDO | AUTO-EXISTENTE | `backend/test/api/auth-authorization.test.js` (cadastro e `/me` sem hash); DTOs nos mappers | — | — |
| V15.3.2 | 2 | chamadas de saída sem seguir redirecionamento | aplica | NÃO ATENDIDO | INSPEÇÃO | Octokit e troca de código OAuth seguem redirect (`backend/src/modules/github/github-credential.provider.js`:81-91) | — | CONF-F08 |
| V15.3.3 | 2 | proteção contra mass assignment | aplica | ATENDIDO | AUTO-NOVO | `backend/test/conformance/asvs-sessao-senha.test.js`; `strictObject` em `backend/src/shared/validation/common.schemas.js` | — | — |
| V15.3.4 | 2 | IP original transferido por campo confiável | aplica | PARCIAL | AUTO-EXISTENTE | `backend/test/unit/security.test.js` (isolamento por IP com `trust proxy` por saltos) | proxy de implantação: S2-09 (implantação) | — |
| V15.3.5 | 2 | tipos garantidos e igualdade estrita | aplica | ATENDIDO | INSPEÇÃO | schemas zod (`backend/src/shared/validation/common.schemas.js`); só o idioma `== null` em igualdade frouxa | — | — |
| V15.3.6 | 2 | código protegido contra prototype pollution | aplica | ATENDIDO | AUTO-NOVO | `backend/test/conformance/asvs-http.test.js` (`__proto__` no corpo não polui); S202-F06 registra o descarte silencioso | — | — |
| V15.3.7 | 2 | defesa contra poluição de parâmetros HTTP | aplica | ATENDIDO | AUTO-NOVO | `backend/test/conformance/asvs-http.test.js`; `backend/test/conformance/asvs-sessao-senha.test.js` (parâmetro repetido responde 400) | — | — |

## V16 — Security Logging and Error Handling

| ID | Nível | Resumo | Aplicabilidade | Veredito | Classe | Evidência | Limite / dono | Backlog |
|---|---|---|---|---|---|---|---|---|
| V16.1.1 | 2 | inventário documentado dos logs | aplica | PARCIAL | INSPEÇÃO | `docs/privacy/DATA_FLOW_MAP.md`:13 | sem eventos por camada, formato, acesso e retenção | CONF-F12 |
| V16.2.1 | 2 | log com metadados de quando, onde, quem e o quê | aplica | PARCIAL | INSPEÇÃO | requisição com horário, `requestId`, rota e status (`backend/src/middlewares/request-context.middleware.js`) | o 500 sai sem stack e com mensagem genérica (K10) | CONF-F11 |
| V16.2.2 | 2 | relógio sincronizado e horário em UTC | aplica | PARCIAL | INSPEÇÃO | `toISOString` (`backend/src/shared/logger/logger.js`) | sincronização do relógio: S2-10 (operação) | — |
| V16.2.3 | 2 | logs só nos destinos documentados | aplica | ATENDIDO | INSPEÇÃO | stdout e stderr e `AuditEvent`, como em `docs/privacy/DATA_FLOW_MAP.md`:13 | — | — |
| V16.2.4 | 2 | formato comum de log | aplica | ATENDIDO | INSPEÇÃO | JSON por linha (`backend/src/shared/logger/logger.js`) | — | — |
| V16.2.5 | 2 | registro conforme o nível de proteção do dado | aplica | ATENDIDO | AUTO-EXISTENTE | `backend/test/unit/shared-infrastructure.test.js` (redaction de chaves e e-mail); `backend/src/shared/logger/redaction.js` | — | — |
| V16.3.1 | 2 | autenticação registrada, com sucesso e falha | aplica | ATENDIDO | INSPEÇÃO | `AUTH_LOGIN_SUCCESS` e `AUTH_LOGIN_FAILURE` (`backend/src/modules/auth/auth.controller.js`) | — | — |
| V16.3.2 | 2 | falha de autorização registrada | aplica | ATENDIDO | INSPEÇÃO | 403 e 404 registrados no log da aplicação (`backend/src/middlewares/error-handler.middleware.js`) | — | — |
| V16.3.3 | 2 | eventos de segurança documentados e tentativas de burla registrados | aplica | PARCIAL | INSPEÇÃO | limitador e tentativas sensíveis registrados (`backend/src/shared/security/rate-limit.js`) | sem lista documentada dos eventos de segurança | CONF-F12 |
| V16.3.4 | 2 | erros inesperados e falhas de controle registrados | aplica | PARCIAL | AUTO-EXISTENTE | `backend/test/unit/shared-infrastructure.test.js` (500 registrado) | sem stack e com mensagem genérica (K10) | CONF-F11 |
| V16.4.1 | 2 | logs codificados contra injeção | aplica | ATENDIDO | INSPEÇÃO | JSON por linha escapa quebras (`backend/src/shared/logger/logger.js`) | — | — |
| V16.4.2 | 2 | logs protegidos contra acesso e alteração | aplica | NÃO VERIFICÁVEL LOCALMENTE | EXTERNO | — | S2-10 (operação) | — |
| V16.4.3 | 2 | logs enviados a sistema separado | aplica | NÃO VERIFICÁVEL LOCALMENTE | EXTERNO | — | S2-10 (operação) | — |
| V16.5.1 | 2 | mensagem genérica em erro inesperado | aplica | ATENDIDO | AUTO-EXISTENTE | `backend/test/unit/shared-infrastructure.test.js` (erro inesperado sanitizado com correlação, sem stack) | — | — |
| V16.5.2 | 2 | operação segura quando recurso externo falha | aplica | NÃO ATENDIDO | SONDA | erros do GitHub normalizados e com retentativa limitada (`backend/src/modules/github/github-request.js`) | a sonda H01 mostra que um GitHub que aceita a conexão e não responde prende a execução para sempre: o timeout é ignorado (K11) e o heartbeat renova o lease | CONF-F08, CONF-F52 |
| V16.5.3 | 2 | falha segura, sem fail-open | aplica | ATENDIDO | AUTO-EXISTENTE | transação vencida nunca confirma (`backend/src/database/transaction-guard.js`); validação antes do processamento (`backend/src/shared/validation/validate-request.middleware.js`) | — | — |

## V17 — WebRTC

| ID | Nível | Resumo | Aplicabilidade | Veredito | Classe | Evidência | Limite / dono | Backlog |
|---|---|---|---|---|---|---|---|---|
| V17.1.1 | 2 | TURN só para endereços não reservados | INV-21: sem WebRTC | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V17.2.1 | 2 | chave do certificado DTLS gerida pela política | INV-21: sem WebRTC | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V17.2.2 | 2 | suítes DTLS aprovadas no servidor de mídia | INV-21: sem WebRTC | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V17.2.3 | 2 | autenticação SRTP conferida no servidor de mídia | INV-21: sem WebRTC | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V17.2.4 | 2 | servidor de mídia tolera pacote SRTP malformado | INV-21: sem WebRTC | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V17.3.1 | 2 | sinalização resiste a inundação | INV-21: sem WebRTC | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
| V17.3.2 | 2 | sinalização tolera mensagem malformada | INV-21: sem WebRTC | NÃO APLICÁVEL | INSPEÇÃO | — | — | — |
