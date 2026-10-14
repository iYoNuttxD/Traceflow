# Relatório da campanha v2 — erros e inconsistências do TraceFlow

Campanha de verificação contra o OWASP ASVS 5.0.0 (L1+L2), o `TRACEFLOW_CONTEXTO_ARQUITETURA.md` e o
`TRACEFLOW_ROADMAP_INCREMENTAL.md`, nas versões anexadas pelo João. O enunciado é o arquivo
`docs/issues/CONFORMIDADE_V2_PROMPT_ERROS_E_INCONSISTENCIAS.md`, mantido fora do git a pedido do
João. A campanha só verifica: nenhuma linha de código de produção, schema, migration, CI ou documento
de referência muda.

## 0. Cabeçalho

| Item | Valor |
|---|---|
| Commit verificado | `7952b01fad68da0d91dd3e2f79c759f5745bb1db` (`joao-dev-v2`, 69 commits à frente de `origin/joao-dev-v2`, sem CI) |
| Última fase concluída | 2 |
| Pontos ⚑1–⚑8 | aprovados com as recomendações do enunciado (14/10/2026) |
| Ponto ⚑9 | aprovado só `node scripts/check-npm-audit.mjs`; recusados `gh api`, os validadores `db:test:validate-*` e o worker e o job em processo separado |
| Efeito do ⚑9 | ARQ-04 (drift) e ARQ-31 (proteção da branch) ficam `NÃO VERIFICÁVEL LOCALMENTE` até a CI da PR; H05 e H22 rodam em processo único |

## 1. Referências congeladas

Hashes recalculados em 14/10/2026, iguais aos do enunciado.

| Referência | SHA-256 | Correspondência |
|---|---|---|
| `OWASP_Application_Security_Verification_Standard_5.0.0_en.pdf` | `a2fa1bbe38f12cac86d3a0f0023327e9772201f65a7f741f282f5e785d268fc5` | catálogo de 345 requisitos (70 L1, 183 L2, 92 L3) |
| `TRACEFLOW_CONTEXTO_ARQUITETURA.md` | `e904fd62910f71bea52c11c0978bc024106abfb658bfee48fbfbdd3073d5c702` | blob `589af2b` |
| `TRACEFLOW_ROADMAP_INCREMENTAL.md` | `4c18dbbc7e2a8511fda5a8e2677e1664a3c368fa60f37b7132c35d2a787267f8` | blob `53f4500` |
| Documento oficial do TCC (Somativa 2, PDF) | `05fe0ec93c35d1a65d58f53e520caf7590da83e0e78e842c0c4ece96e02f643a` | texto extraído com `pdftotext -enc UTF-8`; UC01–UC15 nos Quadros 3-69 a 3-83 |

## 2. Divergências anexo × repositório

### 2.1 Anexo de arquitetura: 9 trechos

`git diff 589af2b HEAD:TRACEFLOW_CONTEXTO_ARQUITETURA.md` tem 9 trechos, todos ligados a um
identificador.

| Trecho (anexo → repositório) | Assunto | D-id |
|---|---|---|
| L3 → L3 | público do documento | D-ARQ-01 |
| L7 → L7-11 | nota "Estado executável após a E15" reescrita sem o rótulo | D-ARQ-08 |
| L228 → L232-235 | commits: Conventional Commits e `[TASK-<ID>]` | D-ARQ-02 |
| L701 → L708 | GitHub App por instalação; PAT não suportado | D-ARQ-03 |
| L704 → L711 | não persistir tokens do GitHub | D-ARQ-04 |
| L965 → L973 | PR: documentação canônica ou `Documentação: N/A` | D-ARQ-05 |
| L986 → L994-995 | DoD: documentação canônica ou `N/A` | D-ARQ-05 |
| L992-1014 → L1001-1011 | §18 substituída | D-ARQ-06 |
| L1075 → L1072 | ADR para alteração da estratégia de GitHub App | D-ARQ-07 |

### 2.2 Anexo do roadmap: 48 trechos

`git diff 53f4500 HEAD:TRACEFLOW_ROADMAP_INCREMENTAL.md` tem 48 trechos (+328/−87), todos ligados a
um ou mais identificadores.

| Trechos | Assunto | D-id |
|---|---|---|
| 01 | nota LR.7 (21/08/2026) no cabeçalho | D-RM-14 |
| 02, 03, 04, 05, 21, 23, 25, 32, 33, 38, 44, 45, 46, 47 | troca Azure → OCI em títulos, objetivos, dependências, fluxogramas e tabelas | D-RM-01 |
| 26, 27, 28, 30, 39 | Azure → OCI com critério acrescentado (Free Tier, VMs, rede privada) | D-RM-01, D-RM-02 |
| 29, 34 | Azure → OCI com critério acrescentado e critério enfraquecido (segredos; credenciais da automação) | D-RM-01, D-RM-02, D-RM-19 |
| 31, 35, 36, 37, 40, 41, 42, 43 | critérios OCI acrescentados (firewall, Nginx, URLs da GitHub App, restore de volumes) | D-RM-02 |
| 06, 11 | UC05 movido do S1-01 para o S1-03 | D-RM-04 |
| 07, 15, 16, 18, 19 | caixas `[x]` e notas de estado da Sprint 1 | D-RM-07 |
| 08 | S1-01: caixas `[x]`; "E2E" trocado por "frontend automatizados"; item novo de homologação externa | D-RM-03, D-RM-07, D-RM-16 |
| 09 | S1-02: nota de estado e "decisão de segurança" da resposta genérica | D-RM-06, D-RM-07 |
| 10 | S1-02: caixas `[x]`; "configurar provider" reescrito; item novo de homologação SMTP | D-RM-05, D-RM-07, D-RM-16 |
| 12 | S1-03: nota de estado e "decisões de produto" sobre `OWNER` e administração global | D-RM-07, D-RM-17 |
| 13, 20 | S1-03 e S1-09: caixas `[x]` e item novo de homologação ou revalidação | D-RM-07, D-RM-16 |
| 14 | S1-04: caixas `[x]` e revisão do modelo (ADR-010, ADR-011) | D-RM-07, D-RM-15 |
| 17 | S1-07: caixas `[x]` com itens reescritos e desdobrados | D-RM-07, D-RM-18 |
| 22 | S2-01: caixas `[x]` e notas de estado e da campanha | D-RM-08 |
| 24 | S2-05: marco incremental P9 | D-RM-09 |
| 48 | seções IND, GITHUB e PR24-FIX acrescentadas ao fim | D-RM-10, D-RM-11, D-RM-12 |

Os cartões S2-02 e S2-03 não aparecem no `diff`: continuam iguais ao anexo, com todas as caixas
abertas e sem nota (D-RM-13).

### 2.3 Classificação final

| D-id | Classe | Registro ou motivo |
|---|---|---|
| D-ARQ-01 | DE | editorial |
| D-ARQ-02 | DA | `CONTRIBUTING.md` acrescenta convenção sem tirar a menção aos RFs |
| D-ARQ-03 | DL | ADR-009 (GitHub App) e ADR-012; confirmação de que o runtime não aceita PAT fica na Parte B (ARQ-23) |
| D-ARQ-04 | DL | ADR-009 e ADR-012; confirmação no schema fica na Parte B (ARQ-23) |
| D-ARQ-05 | DE | o critério continua; só admite registrar `N/A` |
| D-ARQ-06 | DX | as 17 regras para agentes saíram sem registro que as substitua uma a uma; a Parte B verifica as 17 (ARQ-34) |
| D-ARQ-07 | DL | a migração para GitHub App já ocorreu (ADR-009) |
| D-ARQ-08 | DE | editorial |
| D-RM-01 | **DR** | não há ADR de implantação; o ADR-017 só diz que "a implantação pretendida é OCI"; o S2-08 mantém "[ ] criar ADR e diagrama" |
| D-RM-02 | DA | condicionada ao ADR do D-RM-01 |
| D-RM-03 | **DX** | E2E retirado do checklist do S1-01 sem decisão de dispensa (E15-F10 e S104-F02 seguem abertos) |
| D-RM-04 | DE | editorial; o TCC põe o UC05 com o Administrador do Sistema (ver D-RM-17) |
| D-RM-05 | DE | a homologação SMTP continua aberta |
| D-RM-06 | DL | o ADR-002 registra que "erros de credencial e recuperação evitam enumeração"; a afirmação é testada na H14 |
| D-RM-07 | DE | toda marcação é alegação, verificada na Parte C |
| D-RM-08 | DE | alegação; a nota ainda cita "dependência relaxada" entre S1-09 e S2-01, verificada na Parte C |
| D-RM-09 | DE | alegação; o texto diz que não conclui S2-04/S2-05 |
| D-RM-10 | DE | mapa de fases internas, sem equivalência com cartões |
| D-RM-11 | DL | compatível com o TCC: UC03 passo 9 ("quando houver repositório configurado") e exceção E9.2 (salvar sem sincronização); UC04 fluxo A1 (sincronização automática agendada); registro no ADR-017 e nos relatórios GITHUB-01..04.1 |
| D-RM-12 | DE | decisão pendente de retenção de SyncRun (K22) |
| D-RM-13 | DE | omissão: S2-02 e S2-03 implementados sem estado no cartão (K6) |
| D-RM-14 | DE | nota desatualizada: "checklists não promovidos" e "39 migrations", hoje 74 (K18) |
| D-RM-15 | DL | ADR-010 e ADR-011 registram a revisão do modelo de sprint e marco; os critérios do cartão continuam valendo |
| D-RM-16 | DA | itens de homologação externa e de revalidação acrescentados (S1-01, S1-02, S1-03, S1-09) |
| D-RM-17 | **DX contra o TCC** | ver seção 2.4 |
| D-RM-18 | DA | itens do S1-07 desdobrados, com integração, responsividade e inventário visual acrescentados |
| D-RM-19 | **DX** | o S2-08 trocou "segredos ficam em **serviço** seguro" por "em **mecanismo** seguro", e o S2-09 trocou "credenciais federadas ou identidade gerenciada" por "credenciais OCI de menor privilégio", que admite chave estática. O critério do S2-09 contra segredo estático de longa duração continua no texto, sem o meio que o atendia |

### 2.4 Divergências com o documento oficial do TCC

O TCC é a fonte de maior precedência (§3 do anexo de arquitetura).

| ID | TCC | Repositório | Classe |
|---|---|---|---|
| D-TCC-01 (= D-RM-17) | Ator **Administrador do Sistema**: vê e gerencia todos os projetos (UC03, Quadro 3-71); cadastra e edita usuários e os vincula a projetos (UC05, Quadro 3-73); define perfil global "Administrador do Sistema" ou "Membro da Equipe", sem remover o único administrador (UC06, Quadro 3-74) | papéis **por projeto** (`OWNER`, `MANAGER`, `MEMBER`, `VIEWER`), cadastro pelo próprio usuário e nenhuma administração global ("decisões de produto" do S1-03 no roadmap). O roadmap anexado já descreve os papéis por projeto | **DX contra o TCC**: pede decisão do João. Ou o texto do TCC muda para o modelo implementado, ou o produto ganha a administração global |
| D-TCC-02 | Quadro 3-72 com título "UC01 – Sincronizar dados do GitHub" e identificador UC04 | — | ambiguidade editorial no próprio TCC (regra 15 da §18): o título deveria ser UC04 |

## 3. Inventário de superfície

Levantado do código em execução no commit verificado. O inventário de rotas sai do roteador do
Express (`backend/test/conformance/helpers/route-inventory.js`, que a Parte D reutiliza na H09). As
justificativas de "não aplicável" da Parte A citam as linhas abaixo.

| ID | Superfície | Fato |
|---|---|---|
| INV-01 | API HTTP | 208 rotas (98 GET, 55 POST, 19 PATCH, 24 DELETE, 12 PUT), todas sob `/api` exceto `/health*`; lista no Apêndice A |
| INV-02 | Rotas públicas | 14: cadastro, login, recuperação e redefinição de senha, verificação de e-mail, início e callback do OAuth do GitHub, callback da GitHub App, confirmação de troca de e-mail, confirmação de reativação, webhook da GitHub App e os três `/health*` |
| INV-03 | Proteção das rotas autenticadas | `authenticate` e `csrf` montados globalmente em `/api` antes das rotas de módulo; nenhuma rota mutável autenticada fica sem CSRF; o CSRF ignora GET, HEAD e OPTIONS |
| INV-04 | Autorização de projeto | middleware `authorize` global depois da autenticação; o escopo de projeto é decidido por regex de caminho dentro dele |
| INV-05 | Validação | 187 de 208 rotas com `validateRequest`; as 21 sem ele estão no Apêndice A (coluna "Validação") |
| INV-06 | Sessão | cookie `traceflow_session` com token opaco de 32 bytes, guardado como hash SHA-256; `httpOnly`, `Secure` só em produção, `SameSite` configurável (padrão `lax`), `path=/`; TTL de 8 h ou 30 dias com "manter conectado" |
| INV-07 | Cookie auxiliar do OAuth | `traceflow_github_oauth` (state e verificador PKCE), `httpOnly`, `Lax`, `path=/api/auth/github/callback`, 10 min |
| INV-08 | Cabeçalhos | Helmet com CSP `default-src 'none'` e `frame-ancestors 'none'`, `frameguard` DENY, `Referrer-Policy: no-referrer`, `nosniff`, HSTS só em produção, sem `X-Powered-By`; `Cache-Control: no-store` sob `/api` |
| INV-09 | Corpo da requisição | só JSON (415 para outros tipos), limite de 100 kb; webhook com corpo cru de até 1 MB; multipart só no registro de execução de caso de teste |
| INV-10 | Saída para o GitHub | Octokit (`@octokit/rest` 21) para a REST API, com JWT RS256 da App emitido pelo backend e token de instalação por cliente; troca de código OAuth por `fetch` em `github.com/login/oauth/access_token` |
| INV-11 | Entrada do GitHub | webhook com HMAC SHA-256 e deduplicação por `X-GitHub-Delivery` |
| INV-12 | E-mail | nodemailer com SMTP em produção; provider `capture` fora de produção |
| INV-13 | Banco | MySQL por Prisma 6.12.0, 74 migrations; cliente de recuperação separado para `KILL QUERY`/`KILL` (ADR-020) |
| INV-14 | Arquivos | evidências de teste no diretório `TEST_EVIDENCE_STORAGE_DIR`, fora de `public/`, `frontend/` e `dist/` |
| INV-15 | Navegador | `localStorage` com `traceflow.theme`, `traceflow.sidebar.collapsed`, `traceflow.projects.pinned:<id>`, `traceflow.projects.recent:<id>` e `traceflow:auth-session-event`; token CSRF só em memória; sem `sessionStorage` |
| INV-16 | Estado em memória | limitador de taxa (`MemoryStore`) e publicador de SSE; uma instância |
| INV-17 | Stream | SSE em `GET /api/projects/:projectId/events`, até 15 min, heartbeat de 25 s |
| INV-18 | Processos | API (`src/server.js`), worker de sincronização (`src/github-worker.js`, ADR-017) e jobs por `npm run` (`notifications:due`, `notifications:github-events`, `traceability:alerts`, `privacy:retention`, `privacy:deletions`, `projects:purge`, `e6:cleanup` e os de manutenção E8, E11, LR.2, S1-04 e ADR-011) |
| INV-19 | Dependências de runtime do backend | `@octokit/rest`, `@prisma/client` 6.12.0, `argon2`, `cors`, `dotenv`, `express` 4.22, `express-rate-limit` 8, `file-type` 22.0.2, `helmet` 8, `multer` 2.4.0, `nodemailer` 10.0.9, `zod` 4 |
| INV-20 | Dependências de runtime do frontend | `react` 19, `react-dom` 19, `react-router` 8.3.0, `axios`, `@xyflow/react`, `elkjs`; `vite` e `@vitejs/plugin-react` também estão em `dependencies`, embora sejam de build (indício para ARQ-05) |
| INV-21 | Superfícies ausentes | sem GraphQL, WebSocket, WebRTC, SSR, OIDC (o OAuth do GitHub não emite ID Token) e sem consumo de token autocontido; o único token autocontido é o JWT que o backend **emite** para o GitHub |
| INV-22 | HTML do SPA | `frontend/index.html` com script inline, servido pelo host de implantação, sem cabeçalhos versionados no repositório |
| INV-23 | Fatores de autenticação | senha local e OAuth do GitHub; sem MFA, OTP, TOTP, código fora de banda, segredo de consulta, SMS ou telefonia, SAML ou asserção assinada consumida |
| INV-24 | Intérpretes e runtime | sem LDAP, XPath, XML, LaTeX, memcache, JNDI, chamada ao sistema operacional (`child_process`), `eval` ou editor WYSIWYG; código próprio só em runtime de memória gerenciada (Node.js e navegador) |
| INV-25 | Formatos de upload | arquivos simples (imagem, vídeo, PDF, texto, log, JSON); sem arquivo compactado nem extração |
| INV-26 | Mensagens entre janelas | o frontend não usa `postMessage` nem escuta o evento `message` |
| INV-27 | Papéis criptográficos e OAuth | a aplicação não cifra dados com chave simétrica, não usa mTLS, não deriva chave de senha e não é servidor de autorização, servidor de recursos nem provedor OpenID |

## 4. Parte A — OWASP ASVS 5.0.0, níveis 1 e 2

Matriz completa em `docs/security/ASVS_5_0_L1_L2_MATRIX.md`, com o catálogo congelado em
`backend/test/fixtures/asvs-5.0.0-l1-l2.json` e a completude travada por
`backend/test/conformance/asvs-matrix.test.js`.

### 4.1 Números

| Veredito | L1 | L1+L2 |
|---|---:|---:|
| ATENDIDO | 40 | 103 |
| PARCIAL | 5 | 37 |
| NÃO ATENDIDO | 6 | 19 |
| NÃO VERIFICÁVEL LOCALMENTE | 4 | 18 |
| NÃO APLICÁVEL | 15 | 76 |
| **Total** | **70** | **253** |

- **Aplicáveis:** 177.
- **Aplicáveis e verificáveis localmente:** 159, dos quais 103 atendidos (64,8%).
- **L1 não atendidos (6):** V3.3.1, V3.5.3, V6.2.4, V7.2.4, V14.2.1 e V14.3.1.
- **A meta L2 da §13.1 do anexo não é atingida hoje.** São 19 requisitos não atendidos e 37 parciais; os
  18 não verificáveis dependem de S2-08 a S2-10.

### 4.2 Verificações automatizadas novas (⚑1)

| Arquivo | O que trava |
|---|---|
| `backend/test/conformance/asvs-http.test.js` | cabeçalhos, CSP, `nosniff`, `Referrer-Policy` e `Content-Type` com charset em 200, 400, 401, 403, 404, 413, 415 e 429; HSTS de produção; CORS; formulário entre sites recusado (415); `TRACE` sem eco; parâmetro repetido e `__proto__` |
| `backend/test/conformance/asvs-sessao-senha.test.js` | atributos do cookie; tamanhos e composição livre da senha; conferência exata da senha; senha atual na troca; `no-store` autenticado; parâmetro repetido e campo extra em rota autenticada; ID acima do INT do MySQL responde 4xx |
| `backend/test/conformance/asvs-matrix.test.js` | 253 identificadores com o nível certo; vereditos admitidos; todo positivo com caminho existente; todo não aplicável com inventário; todo não verificável com dono |

A hipótese de que um ID acima do INT do MySQL derrubaria a API com 500 foi **refutada**: as quatro rotas
testadas respondem 4xx.

### 4.3 Reproduções (testes vermelhos, fora de commit)

Rodadas em 14/10/2026 num arquivo temporário de `backend/test/conformance/`, apagado antes do commit.

| Reprodução | Resultado |
|---|---|
| o nome do cookie de sessão tem prefixo `__Host-` ou `__Secure-` | falhou: `expected false to be true` (CF-01) |
| novo login, enviando o cookie anterior, encerra esse cookie | falhou: `/api/auth/me` com o cookie anterior respondeu 200 (CF-02) |
| cadastro recusa `1qaz2wsx3edc`, `1q2w3e4r5t6y`, `passwordpassword` e `qazwsxedcrfv` | falhou nas quatro: 201 (CF-03) |
| sessão com `lastSeenAt` de 7 dias atrás exige nova autenticação | falhou: 200 (CF-04) |

### 4.4 Achados conhecidos confirmados na Fase 1

| ID | Situação | Evidência |
|---|---|---|
| K1 | confirmado | `ASVS_BASELINE.md:31` dá upload como atendido, e a L77 põe o V5 como não aplicável "sem upload" |
| K2 | confirmado | a baseline cita 58 identificadores com prefixo V (cerca de 60 no total) de 253 |
| K8 | confirmado | `ASVS_BASELINE.md:16` cita `backend/src/shared/auth/`, que não existe; a L12 não menciona as 5 chamadas `Unsafe` |
| K9 | confirmado | a troca de código OAuth tem timeout, mas não define `redirect` (`github-credential.provider.js:81-91`) |
| K10 | confirmado | `app.js:201` monta o handler sem `includeErrorStack`; o teste `shared-infrastructure.test.js:164` trava o log sem stack |
| K11 | confirmado | `@octokit/request` 9.2.4 repassa ao `fetch` só `redirect` e `signal`; zero ocorrências de "timeout" no pacote |
| K21 | confirmado | `THREAT_MODEL.md:95` afirma URLs persistidas só HTTPS do GitHub; `github.mapper.js:27` grava `html_url` sem validação |

### 4.5 Achados da Parte A

Cada achado tem um item `CONF-Fnn` de mesmo número no backlog (Fase 5).

### [ALTA] CF-01 — Cookie de sessão sem prefixo `__Host-`

- Onde: `backend/src/config/env.js:585` (nome padrão `traceflow_session`); `backend/src/modules/auth/auth.controller.js:6-15`
- Norma: ASVS V3.3.1 (L1) e V3.3.3 (L2)
- Esperado: nome com `__Host-`, com `Secure`, `Path=/` e sem `Domain`
- Observado: `traceflow_session=…; HttpOnly; SameSite=Lax; Path=/`, sem prefixo; `Secure` só em produção
- Reprodução: cadastro e leitura do `Set-Cookie` (seção 4.3)
- Consequência: sem a garantia do prefixo, um subdomínio ou um intermediário comprometido pode fixar ou sobrescrever o cookie
- Origem: S1-01 (ADR-002)
- Proposta: nome padrão `__Host-traceflow_session` em produção, mantendo `Secure` e `Path=/`

### [ALTA] CF-02 — Novo login não encerra o token apresentado

- Onde: `backend/src/modules/auth/auth.service.js:125-147`
- Norma: ASVS V7.2.4 (L1)
- Esperado: o login emite token novo e encerra o token que o agente apresentou
- Observado: depois do segundo login, `GET /api/auth/me` com o cookie anterior responde 200
- Reprodução: login A; login B enviando o cookie A; `/me` com A (seção 4.3)
- Consequência: token roubado ou fixado continua válido mesmo depois de a vítima autenticar de novo
- Origem: S1-01
- Proposta: revogar a sessão do cookie apresentado no login local e no login pelo GitHub

### [ALTA] CF-03 — Senhas comuns aceitas; sem senhas vazadas nem palavras de contexto

- Onde: `backend/src/modules/auth/identity-policy.js:19-35` (15 itens, 5 deles com menos de 12 caracteres)
- Norma: ASVS V6.2.4 (L1), V6.1.2, V6.2.11 e V6.2.12 (L2)
- Esperado: recusa das 3000 senhas mais comuns que cabem na política; checagem contra senhas vazadas; lista documentada de palavras de contexto
- Observado: quatro senhas comuns de 12 ou mais caracteres aceitas com 201
- Reprodução: `POST /api/auth/register` com cada senha (seção 4.3)
- Consequência: contas com senha trivial ficam expostas a credential stuffing, mesmo com o limitador
- Origem: S1-01 e S1-02
- Proposta: lista versionada com pelo menos 3000 senhas comuns de 12 ou mais caracteres; palavras de contexto documentadas (TraceFlow, PUCPR, nomes do produto); avaliar checagem contra base de vazadas por k-anonimato

### [MÉDIA] CF-04 — Sem timeout por inatividade; política de sessão não documentada

- Onde: `backend/src/modules/auth/auth.service.js:150-164`; `docs/architecture/ADR-002-AUTHENTICATION-SESSION.md`
- Norma: ASVS V7.3.1, V7.1.1 e V7.1.2 (L2)
- Esperado: reautenticação depois de inatividade definida; documentação de vida máxima, inatividade e sessões simultâneas, com justificativa frente ao NIST
- Observado: sessão com `lastSeenAt` de 7 dias responde 200; nenhum documento trata de inatividade nem de sessões simultâneas
- Reprodução: seção 4.3
- Consequência: sessão esquecida em máquina compartilhada vale até 30 dias
- Origem: S1-01
- Proposta: conferir `lastSeenAt` contra um limite de inatividade configurável e registrar a política no ADR-002

### [MÉDIA] CF-05 — CSP com `base-uri 'self'`

- Onde: `backend/src/shared/security/headers.js:4-10`
- Norma: ASVS V3.4.3 (L2)
- Esperado: no mínimo `object-src 'none'` e `base-uri 'none'`
- Observado: `base-uri 'self'`, herdado do padrão do Helmet
- Reprodução: `GET /health` com configuração de produção e leitura do cabeçalho
- Consequência: pequena na API JSON; a CSP do SPA, ainda inexistente, tende a copiar a da API
- Origem: fundação de segurança (E-phase)
- Proposta: acrescentar `baseUri: ["'none'"]` às diretivas

### [ALTA] CF-06 — Token sensível em URL e confirmação por GET

- Onde: `backend/src/shared/email/email.service.js:15-19`; `backend/src/modules/settings/settings-public.routes.js:7-16`; `frontend/src/features/settings/settings.api.js:95-100`
- Norma: ASVS V14.2.1 (L1), V3.5.3 (L1) e V3.4.5 (L2)
- Esperado: token fora da query string; confirmação por POST; política de referrer também no SPA
- Observado: links com `?token=`; `GET /api/settings/account/email-change/confirm?token=` e `GET /api/account/reactivation/confirm?token=` mudam estado; o SPA não define política de referrer nem limpa a URL
- Reprodução: inventário de rotas (Apêndice A) e leitura dos templates
- Consequência: o token fica no histórico do navegador, em logs de proxy e pode sair no `Referer`
- Origem: S1-02 e L-phases (troca de e-mail e reativação)
- Proposta: token no fragmento do link ou lido pela página e enviado por POST; confirmações por POST; política de referrer no SPA; `history.replaceState` depois da leitura

### [ALTA] CF-07 — Logout deixa dados do usuário no navegador

- Onde: `frontend/src/features/auth/AuthContext.jsx:72-88`; `frontend/src/app/layout/quick-projects.js:31-37`
- Norma: ASVS V14.3.1 (L1)
- Esperado: dados autenticados apagados do armazenamento do cliente ao encerrar a sessão
- Observado: as chaves `traceflow.projects.pinned:<id>` e `traceflow.projects.recent:<id>` continuam; o logout não envia `Clear-Site-Data`
- Reprodução: H18 da Parte D (jsdom)
- Consequência: em máquina compartilhada, a próxima pessoa vê quais projetos a anterior fixou e abriu (só IDs)
- Origem: frontend (navegação rápida de projetos)
- Proposta: apagar as chaves do usuário no logout e enviar `Clear-Site-Data: "storage"` na resposta do logout

### [MÉDIA] CF-08 — Chamadas de saída sem timeout efetivo e seguindo redirect

- Onde: `backend/src/modules/github/github.client.js:34-38`; `backend/src/modules/github/github-credential.provider.js:56-70` e `:81-91`
- Norma: ASVS V15.2.2, V15.3.2, V16.5.2 e V15.1.3 (L2); §8 do anexo (cliente externo com timeout)
- Esperado: timeout efetivo por chamada; redirect não seguido
- Observado: `request: { timeout }` é ignorado pelo `@octokit/request` 9.2.4, que só repassa `signal` e `redirect`; o Octokit e a troca OAuth seguem redirect
- Reprodução: inspeção do pacote; sonda H01 na Parte D
- Consequência: um GitHub lento prende a sincronização manual ou a do worker; o POST com `client_secret` pode ser reenviado num 307 ou 308
- Origem: cliente GitHub (E5, E9) e login pelo GitHub
- Proposta: `AbortSignal.timeout(ms)` por chamada, por hook do Octokit, e `redirect: 'error'` nas duas saídas

### [MÉDIA] CF-09 — Sem inventário criptográfico; política de chaves parcial

- Onde: `docs/security/SECRETS_POLICY.md`
- Norma: ASVS V11.1.1, V11.1.2, V11.2.2 e V11.2.3 (L2)
- Esperado: inventário de chaves, algoritmos e certificados; política alinhada a um padrão; exceção da chave RSA de 2048 bits registrada
- Observado: só a política de segredos; algoritmos e parâmetros fixos no código
- Reprodução: inspeção
- Consequência: troca de algoritmo e resposta a incidente sem mapa do que existe
- Origem: documentação de segurança
- Proposta: seção de inventário (SHA-256, HMAC SHA-256, Argon2id, RS256 da App, `randomBytes`) com a exceção da RSA 2048 imposta pelo GitHub

### [MÉDIA] CF-10 — Allowlist de saída sem uso em runtime

- Onde: `backend/src/shared/security/ssrf.js:27-52`; `backend/src/shared/validation/common.schemas.js:95-98`
- Norma: ASVS V13.2.4 (L2)
- Esperado: destinos externos definidos por allowlist aplicada
- Observado: `isAllowedExternalUrl` só é usada em teste; os destinos são fixos no código
- Reprodução: inspeção
- Consequência: pequena hoje, porque nenhuma URL vem do usuário; a regra não impede regressão
- Origem: fundação de segurança (E-phase)
- Proposta: aplicar a allowlist nos clientes de saída, ou remover o código sem uso e registrar a decisão

### [MÉDIA] CF-11 — Erro 500 registrado sem stack e com mensagem genérica

- Onde: `backend/src/app.js:201`; `backend/src/middlewares/error-handler.middleware.js:103`, `:119` e `:162-168`
- Norma: ASVS V16.2.1 e V16.3.4 (L2); §13.10 do anexo (detalhe técnico só no servidor)
- Esperado: log do servidor com o detalhe técnico do erro inesperado
- Observado: `includeErrorStack` desligado e mensagem trocada pelo texto genérico quando o status é 500 ou maior
- Reprodução: `backend/test/unit/shared-infrastructure.test.js:164` trava o comportamento atual
- Consequência: incidente de produção sem informação para diagnóstico
- Origem: fundação de erros (E-phase)
- Proposta: registrar stack e mensagem real no log (com redaction), mantendo a resposta genérica

### [MÉDIA] CF-12 — Inventário de logs e eventos de segurança não documentados

- Onde: `docs/privacy/DATA_FLOW_MAP.md:13`
- Norma: ASVS V16.1.1 e V16.3.3 (L2)
- Esperado: inventário de eventos por camada, formato, destino, acesso e retenção; lista dos eventos de segurança registrados
- Observado: uma linha no mapa de fluxo de dados
- Reprodução: inspeção
- Consequência: operação sem referência para alertas e retenção dos logs
- Origem: documentação de operação
- Proposta: documento de logging com os eventos do app, do worker e dos jobs

### [MÉDIA] CF-13 — Evidências sem verificação antivírus

- Onde: `backend/src/modules/testCases/storage/test-evidence.validation.js`
- Norma: ASVS V5.4.3 (L2)
- Esperado: arquivo de fonte não confiável verificado antes de ser servido
- Observado: há allowlist e detecção de tipo, mas nenhuma varredura
- Reprodução: inspeção
- Consequência: PDF ou vídeo malicioso enviado por um membro chega aos outros membros do projeto
- Origem: S1-07
- Proposta: varredura (ClamAV) antes do registro, ou exceção registrada com justificativa

### [MÉDIA] CF-14 — Sem encerramento administrativo de sessões

- Onde: produto inteiro (D-TCC-01)
- Norma: ASVS V7.4.5 (L2); UC05 e UC06 do TCC
- Esperado: administrador encerra as sessões de um usuário ou de todos
- Observado: não há papel administrativo global
- Reprodução: inspeção
- Consequência: conta comprometida depende do próprio titular para encerrar sessões
- Origem: S1-03 (decisões de produto)
- Proposta: depende da decisão sobre o D-TCC-01

### [BAIXA] CF-15 — Regras de autorização por campo não documentadas

- Onde: `docs/security/AUTHORIZATION_MATRIX.md`
- Norma: ASVS V8.1.2 (L2)
- Esperado: regras de leitura e escrita por campo documentadas
- Observado: a matriz é por rota; a minimização (por exemplo, o e-mail na lista de membros) está só nos mappers
- Reprodução: inspeção
- Consequência: regra implícita se perde em refatoração
- Origem: documentação de segurança
- Proposta: seção de campos restritos por papel na matriz

### [MÉDIA] CF-16 — Regras de validação e limites de negócio sem documento de referência

- Onde: `docs/api/API_CONTRACTS.md`; `backend/src/shared/validation/common.schemas.js`
- Norma: ASVS V2.1.1 (L1), V2.1.2, V2.1.3 e V2.3.2 (L2)
- Esperado: regras de validação, consistência entre dados e limites de negócio documentados
- Observado: entradas por rota no contrato; limites comuns e de negócio só no código ou em documentos de cada módulo
- Reprodução: inspeção
- Consequência: não há como conferir se um limite implementado é o pretendido
- Origem: documentação de API
- Proposta: seção "Validação e limites" no contrato, gerada ou conferida a partir dos schemas

### [MÉDIA] CF-17 — Encerrar sessões não pede reautenticação

- Onde: `backend/src/modules/settings/settings.service.js:428-435`; `backend/src/modules/settings/settings.routes.js:42-48`
- Norma: ASVS V7.5.2 (L2)
- Esperado: encerrar sessões depois de nova autenticação com pelo menos um fator
- Observado: listar e revogar sessões funciona sem reautenticação
- Reprodução: inspeção
- Consequência: quem tomou uma sessão pode derrubar as do titular
- Origem: L-phase (configurações)
- Proposta: `requireSensitiveAuthentication` nas revogações

### [MÉDIA] CF-18 — URL do repositório gravada sem validação de protocolo e host

- Onde: `backend/src/modules/github/github.mapper.js:27`; `docs/security/THREAT_MODEL.md:95`
- Norma: ASVS V1.2.2 (L1); documento que afirma o contrário do código (K21)
- Esperado: só `https://github.com/…`, como já se faz com `githubUrl` dos artefatos
- Observado: `html_url` gravado como veio e exibido como link
- Reprodução: inspeção; a sonda entra na Parte D (H35)
- Consequência: pequena enquanto o GitHub for a fonte; o modelo de ameaças afirma uma garantia que não existe
- Origem: integração GitHub (E9, GITHUB-02)
- Proposta: validar com o mesmo `safeGithubUrl` dos artefatos e corrigir o `THREAT_MODEL.md`

### [BAIXA] CF-19 — Dados sensíveis sem nível de proteção

- Onde: `docs/privacy/PERSONAL_DATA_INVENTORY.md`
- Norma: ASVS V14.1.1, V14.1.2 e V14.2.4 (L2)
- Esperado: classificação por nível e requisitos por nível
- Observado: inventário de dados pessoais, sem níveis
- Reprodução: inspeção
- Consequência: controles aplicados caso a caso
- Origem: documentação de privacidade
- Proposta: coluna de nível no inventário e requisitos por nível

### [MÉDIA] CF-20 — Prazos de remediação de dependências sem número

- Onde: `docs/security/DEPENDENCY_RISK_REGISTER.md:126-133`
- Norma: ASVS V15.1.1 (L1)
- Esperado: prazos por risco
- Observado: "imediatamente" para crítico e "no ciclo atual" para alto; nada para moderado e baixo
- Reprodução: inspeção
- Consequência: não há como medir atraso de remediação
- Origem: documentação de supply chain
- Proposta: prazos em dias por severidade

### [BAIXA] CF-21 — Documentação de upload sem o download seguro

- Onde: `docs/data/TEST_CASE_HISTORY.md:103-119`
- Norma: ASVS V5.1.1 (L2)
- Esperado: tipos, extensões, tamanhos e como o arquivo é servido com segurança
- Observado: tipos e limites documentados; download (`attachment`, `nosniff`, nome opaco) não
- Reprodução: inspeção
- Consequência: a proteção de download pode se perder numa refatoração
- Origem: S1-07
- Proposta: parágrafo de download no documento

### [BAIXA] CF-22 — Sessão federada sem documentação

- Onde: `docs/architecture/ADR-012-GITHUB-OAUTH-APP-DECOUPLING.md`
- Norma: ASVS V7.1.3 e V7.6.1 (L2)
- Esperado: como a sessão local se relaciona com a sessão no GitHub e quando há reautenticação
- Observado: o ADR descreve o fluxo, não a vida da sessão
- Reprodução: inspeção
- Consequência: expectativa errada sobre logout e reautenticação pelo GitHub
- Origem: login pelo GitHub (L1)
- Proposta: seção de sessão no ADR-012

### [MÉDIA] CF-23 — Desativação da conta mantém a sessão atual

- Onde: `backend/src/modules/settings/settings.repository.js:293-320`; `docs/architecture/ADR-002-AUTHENTICATION-SESSION.md`
- Norma: ASVS V7.4.2 (L1)
- Esperado: todas as sessões encerradas quando a conta é desativada
- Observado: as outras sessões são revogadas; a atual continua, restrita à reativação e ao cancelamento
- Reprodução: inspeção
- Consequência: decisão registrada no ADR-002, mas diverge do requisito L1
- Origem: L-phase (ciclo de vida da conta, ADR-010)
- Proposta: decisão explícita do João: aceitar com justificativa no ADR-002 ou encerrar a sessão e usar link de reativação

### [MÉDIA] CF-24 — Baseline ASVS desatualizada e contraditória

- Onde: `docs/security/ASVS_BASELINE.md:12`, `:16`, `:31`, `:77` e `:78`
- Norma: §13.1 do anexo (matriz ASVS mantida); documento que afirma o contrário do código (K1, K2, K8)
- Esperado: baseline coerente com o código e com a matriz por requisito
- Observado: V5 "sem upload" contra o upload do S1-07; "não há OAuth no runtime" contra o login pelo GitHub; caminho inexistente; chamadas `Unsafe` omitidas; cerca de 60 de 253 identificadores
- Reprodução: inspeção
- Consequência: a baseline induz a erro quem a usa como fonte
- Origem: documentação de segurança
- Proposta: reduzir a baseline a um resumo que aponta para a matriz e corrigir as quatro afirmações

## 5. Parte B — `TRACEFLOW_CONTEXTO_ARQUITETURA.md`

Matriz completa em `docs/issues/CONFORMIDADE_MATRIZ_ARQUITETURA.md`.

### 5.1 Números

| Veredito | Regras |
|---|---:|
| CONFORME | 12 |
| NÃO CONFORME | 21 |
| NÃO VERIFICÁVEL LOCALMENTE | 3 (ARQ-04, ARQ-31 e ARQ-32, por causa do ⚑9) |
| **Total** | **36** |

Conformidade sobre as regras verificáveis: 12 de 33 (36,4%).

### 5.2 Verificações estáticas

**Verdes, no commit** (`backend/test/conformance/architecture-rules.test.js`):
- ARQ-02: zero mock, fake, stub, dummy ou lorem em `backend/src` e `frontend/src`;
- ARQ-06: Octokit só no módulo GitHub;
- ARQ-09: frontend sem Octokit e sem chamada a `api.github.com`;
- ARQ-19: SQL `Unsafe` só em `recovery-prisma.js`, `transaction-guard.js` e `health.js`;
- ARQ-23: o schema só guarda hashes de token e o `claimToken` interno.

**Vermelhas, só como reprodução** (script no scratchpad, saída abaixo):

| Verificação | Resultado |
|---|---|
| ARQ-11: campo de estado fechado como enum | 31 campos `String`, entre eles `Project.status`, `Task.status`, `Task.priority`, `Requirement.type`, `Requirement.status`, `PullRequest.state` e `Issue.state` |
| ARQ-12: toda relação com `onDelete` explícito | 10 de 132 sem: `ProjectInvitation.createdBy`, `acceptedBy` e `declinedBy`, `Task.project`, `Task.requirement`, `TaskMovement.project`, `TaskMovement.task`, `TaskHistoryEntry.actorUser`, `TaskComment.authorUser` e `TaskTimeEntry.startedBy` |
| ARQ-34: todo RF do §5 do anexo na matriz técnica | 60 no anexo, 58 na matriz; faltam RF37 ("Emitir relatórios do projeto") e RF57 ("Exportar relatórios em PDF") |
| ARQ-35: nove campos e número único por ADR | 8 de 23 completos; ADR-009, ADR-010 e ADR-011 duplicados |
| ARQ-16: todo `code` emitido em `ERROR_CODES` | 12 fora do catálogo; 9 deles também fora do contrato, entre eles `GITHUB_SYNC_BUSY`, `PROJECT_WRITE_BUSY`, `GITHUB_SYNC_LEASE_LOST` e `GITHUB_INITIAL_SYNC_FAILED`; os códigos `*_NOT_APPLIED_TO_VIEW` dos indicadores podem ser limitações e não erros, o que a H36 separa na Fase 4 |

### 5.3 Achados conhecidos verificados na Fase 2

| ID | Situação | Evidência |
|---|---|---|
| K3 | confirmado | duplicados e campos na tabela acima |
| K12 | confirmado | `GITHUB_SYNC_BUSY` e `PROJECT_WRITE_BUSY` fora de `ERROR_CODES` e de `API_CONTRACTS.md` |
| K13 | confirmado | `backend/src/app.js:68-73` monta limitador em `/api/auth/github/repositories/authorization/start`, sem rota |
| K14 | confirmado | a linha `SHARED-SWITCH` de `docs/design/UI_SURFACE_INVENTORY.md:922` fica depois de uma linha em branco, fora da tabela, e `scripts/check-ui-inventory.mjs` só conta linhas sob um cabeçalho: o total declarado na L69 é 244, e sem a linha em branco seria 245; já vinha assim da `main` |
| K15 | refutado em parte | as linhas 35 e 38 de `docs/privacy/PERSONAL_DATA_INVENTORY.md` dizem que a exportação inclui as notificações e as preferências; só faltam os nomes `notifications.json` e `notification-preferences.json` (`settings.service.js:154-155`), que as seções de casos de teste e de defeitos listam (L107 e L124) |
| K16 | confirmado | `RF_TECHNICAL_MATRIX.md:94` cita RF37 e RF57, que não têm linha, e diz que RF42, RF55 e RF56 estão "já marcados como `IMPLEMENTADO`", embora as três linhas tenham ressalva; a mesma nota dá a homologação visual do RF30 e do RF59 como pendente, enquanto o inventário de UI marca a central e as preferências de notificação como `VISUALLY APPROVED` em 13/10; a L214 diz que não há agendador periódico, contra a linha do RF21 |
| K17 | confirmado | `SYSTEM_ARCHITECTURE.md` não menciona notificações, alertas nem os ADR-019 a ADR-021; a L186 diz que a espera de trava não altera o timeout global nem todos os escritores, contra o ADR-019 |
| K19 | confirmado | README e CONTRIBUTING sem `notifications:due`, `notifications:github-events`, `traceability:alerts` e `db:test:validate-schema-drift`; nenhum `package.json` declara `engines` |
| K20 | confirmado | carimbos `20260910120000` (S1-06 e S1-09) e `20261011010000` (PR #24 e S2-02) repetidos em `backend/prisma/migrations` |
| K24 | confirmado | 25 linhas em 14 arquivos versionados citam prompts que não estão no repositório; 14 delas são links Markdown quebrados (relatórios e mapas das campanhas), e as outras 11 são caminhos (8 no backlog, ADR-020:21, ADR-021:14 e `S2_01_MAPA_TESTES.md:3`); os runbooks `TASK_NOTIFICATIONS.md:89` e `GITHUB_EVENT_NOTIFICATIONS.md:91` citam a divergência D-RM-01 sem indicar a fonte; até o commit `7569479` ela só existia no prompt da v1, e hoje está na seção 2.3 deste relatório |

### 5.4 Achados da Parte B

Cada achado tem um item `CONF-Fnn` de mesmo número no backlog (Fase 5).

### [MÉDIA] CF-25 — Interface sem aviso de privacidade

- Onde: `frontend/src/features/auth/pages/RegisterScreen.jsx`; `frontend/src/features/settings/PrivacySettingsPage.jsx`; `docs/privacy/PRIVACY_NOTICE_DRAFT.md`
- Norma: §14.3 do anexo ("exibir aviso de privacidade claro"); ARQ-28
- Esperado: aviso de privacidade acessível ao titular, ao menos no cadastro e nas configurações de privacidade
- Observado: nenhuma tela mostra aviso; existe só o rascunho técnico, que se declara pendente de validação jurídica e operacional (prazos, base legal, controlador, canal formal, transferências e backups)
- Reprodução: busca por "aviso de privacidade", "política de privacidade" e "privacy notice" em `frontend/src`, sem resultado
- Consequência: tratamento de dados pessoais sem transparência ao titular, inclusive de produtividade e de autoria de commits
- Origem: E7 (`b4c682f`, rascunho) e L2 (`b1f0303`, telas de privacidade)
- Proposta: página de aviso com link no cadastro e nas configurações; texto final depende da validação jurídica (E15-F11)

### [BAIXA] CF-26 — Commits sem RF, cartão ou fase

- Onde: histórico da `joao-dev-v2` (últimos 200 commits sem merge)
- Norma: §6.3 do anexo; ARQ-03
- Esperado: commits mencionam os RFs sempre que possível
- Observado: 91 de 200 sem RF, cartão nem fase; 47 deles são `feat:`
- Reprodução: `git log --no-merges -200 --format=%s` com a busca de `RF\d+`, cartões e fases
- Consequência: rastreabilidade RF → commit depende de memória
- Origem: entregas da `main` (77 dos 91) e da `joao-dev-v2` (14)
- Proposta: regra de commit (commitlint) que aceite RF, cartão ou fase, com exceção explícita para manutenção

### [MÉDIA] CF-27 — Dependência sem justificativa e ferramentas de build em runtime

- Onde: `frontend/package.json`
- Norma: §7 e §6.4 do anexo; ARQ-05
- Esperado: dependência nova justificada em ADR ou PR; ferramentas de build fora das dependências de runtime
- Observado: `elkjs` só aparece em `docs/deliveries/S1_09_TRACEABILITY_GRAPH_WORKSPACE_UX_REPORT.md:8`, como "já presente no baseline", sem justificativa nem ADR (o `FRONTEND_STRUCTURE.md` cita só o `@xyflow/react`); `vite` e `@vitejs/plugin-react` em `dependencies`
- Reprodução: busca de `elkjs` em `docs/`, README e CONTRIBUTING; leitura do manifesto
- Consequência: auditoria de supply chain e imagem de produção carregam o que não roda
- Origem: S1-09 (`dbc50a6`, `elkjs`) e estrutura inicial (`ceb0abe`, `vite` em `dependencies`)
- Proposta: registrar o `elkjs` no ADR do grafo e mover as duas ferramentas de build para `devDependencies`

### [MÉDIA] CF-28 — Prisma fora de repository e pontos cegos do `architecture:check`

- Onde: `backend/src/shared/maintenance/auth-cleanup.js`, `backend/src/shared/maintenance/privacy-retention.js`, `backend/src/shared/http/health.js`; `backend/scripts/check-architecture.js`
- Norma: §8.1 e regra 8 da §18 do anexo; ARQ-06
- Esperado: acesso ao Prisma concentrado em repository; regra automática que o garanta
- Observado: jobs de manutenção e o health usam o Prisma direto; o check não cobre services, helpers, `shared` nem jobs, e não enxerga `import()` dinâmico
- Reprodução: leitura do check (`layerOf` só classifica route, controller, service, repository e client, e a proibição de acesso ao banco vale só para route, controller, mapper e client; `extractImportSpecifiers` exige espaço depois de `import`) e busca de `prisma` fora de `*.repository.js`
- Consequência: a separação de camadas pode regredir sem alarme
- Origem: E3 (`7b0c25b`, `health.js`), E6 (`4a02b67`, `auth-cleanup.js`) e E7 (`b4c682f`, `privacy-retention.js`)
- Proposta: repositories para a manutenção e regra do check para qualquer arquivo fora de repository e de `src/database`

### [MÉDIA] CF-29 — Organização de módulos diferente do anexo sem registro

- Onde: `backend/src/modules/`; `docs/architecture/MODULE_CONVENTIONS.md`
- Norma: §9 do anexo; ARQ-08 (divergência DR)
- Esperado: módulos por domínio (`users`, `alerts`, `comments`, `reports`) ou registro da escolha diferente
- Observado: alertas dentro de `traceability`, comentários dentro de `tasks`, usuários divididos entre `auth`, `settings` e `privacy`; nada registra a decisão
- Reprodução: listagem de `backend/src/modules`
- Consequência: quem segue o anexo procura módulos que não existem
- Origem: L2 (`b1f0303`, módulo `settings`), comentários do RF29 e do RF31 (`666d31a`, em `tasks`) e S2-01 (`1ab5361`, alertas em `traceability`)
- Proposta: registrar a organização real em `MODULE_CONVENTIONS.md` (ou ADR), com o mapa domínio → módulo

### [MÉDIA] CF-30 — Vínculos de rastreabilidade sem origem, autor nem evidência

- Onde: `backend/prisma/schema.prisma` (`TaskCommit`, `TaskIssue`, `TestCaseTask`, `Task.pullRequestId`)
- Norma: §10.3 do anexo; ARQ-10
- Esperado: cada vínculo com tipo, origem manual ou automática, autor, data, validade, evidência e última verificação, conforme aplicável
- Observado: só ids e `createdAt` (nem isso em `TestCaseTask`); a sugestão de commit confirmada vira `TaskCommit` sem marca de origem; o autor só fica no `AuditEvent`, que expira em 365 dias
- Reprodução: leitura do schema
- Consequência: vínculo automático indistinguível de manual e sem autor depois da retenção da auditoria
- Origem: vínculo de tarefa e commit (`23d34a8`, 10/06/2026) e casos de teste (`bd218af`, `TestCaseTask`)
- Proposta: colunas de origem e autor nas tabelas de vínculo, preenchidas pelos serviços, com migration de dados para os vínculos existentes

### [MÉDIA] CF-31 — Estados fechados como `String` e listas duplicadas

- Onde: `backend/prisma/schema.prisma`; `backend/src/modules/tasks/task.schema.js:4` e `backend/src/modules/tasks/task.validation.js:14`
- Norma: §11.1 do anexo; ARQ-11
- Esperado: enum no Prisma ou validação centralizada única
- Observado: 31 campos de estado como `String`; a lista de status da tarefa repetida em dois arquivos
- Reprodução: script da seção 5.2
- Consequência: valor inválido gravado por caminho que pule a validação; listas divergem com o tempo
- Origem: campos `String` desde a estrutura inicial (`ceb0abe`); listas da E2 (`2ac8421`) e da E4 (`ade0ff2`)
- Proposta: enums para os estados de domínio, a começar por tarefa, requisito, projeto, PR e issue, ou uma constante única importada pelos dois arquivos

### [MÉDIA] CF-32 — Relações sem política de exclusão explícita

- Onde: `backend/prisma/schema.prisma`
- Norma: §11.1 do anexo; ARQ-12
- Esperado: `onDelete` declarado em cada relação
- Observado: 10 de 132 relações dependem do padrão implícito (`RESTRICT` ou `SET NULL`)
- Reprodução: script da seção 5.2
- Consequência: exclusão ou anonimização falha ou deixa órfão sem que o schema mostre a intenção
- Origem: estrutura inicial (`Task`), quadro Kanban (`547c485`, `TaskMovement`), E6 (convites), E11 (histórico), comentários (`666d31a`) e S1-06 (`32af5b2`, tempo)
- Proposta: declarar a política nas 10 relações, em migration que não mude o comportamento atual

### [MÉDIA] CF-33 — Contrato da API diferente do anexo sem ADR

- Onde: `backend/src/app.js:199`; `backend/src/shared/errors/app-error.js`; `docs/api/API_CONTRACTS.md:2143-2147`
- Norma: §12.1 a §12.3 e §20 do anexo; ARQ-14, ARQ-15 e ARQ-16 (divergência DR)
- Esperado: `/api/v1`, envelope `{data, meta}`, paginação de coleções grandes e erro `{error: {code, message, details, requestId}}`, ou ADR que registre outra escolha
- Observado: `/api`, nomes de chave por recurso, 12 coleções sem paginação e erro plano; o contrato admite a divergência, mas não há ADR. O próprio contrato promete `{message, code, requestId}`, e o `AppError.toPublic` só inclui `code`, `details` e `requestId` quando `exposeTechnicalDetails` é verdadeiro, com padrão falso (`backend/src/shared/errors/app-error.js:11` e `:24-39`)
- Reprodução: inventário de rotas (Apêndice A) e leitura do erro
- Consequência: cliente não tem como correlacionar erro de domínio com o log; coleções crescem sem limite
- Origem: estrutura inicial (`ceb0abe`, base `/api`) e E3 (`7b0c25b`, `exposeTechnicalDetails`)
- Proposta: ADR "versão e contrato da API" registrando a escolha; `code` e `requestId` em todo erro; paginação das coleções (S104-F03)

### [MÉDIA] CF-34 — DELETE com status inconsistente

- Onde: 24 rotas DELETE (Apêndice A)
- Norma: §12.4 do anexo; ARQ-17
- Esperado: `204` para exclusão sem corpo, de forma consistente
- Observado: 8 respondem 204 e 16 respondem 200 com corpo
- Reprodução: inventário das rotas e leitura dos controllers
- Consequência: o cliente trata cada exclusão de um jeito
- Origem: vários módulos
- Proposta: registrar a regra no contrato e alinhar as rotas novas; as antigas mudam só com versão de contrato

### [MÉDIA] CF-35 — Configuração sem timeouts do servidor e com sobras

- Onde: `backend/src/server.js:9`; `backend/src/app.js:68-73`; `backend/src/config/env.js:549-553`; `backend/src/shared/logger/logger.js`
- Norma: §13.8 do anexo ("definir limites de payload e timeouts"); ARQ-25
- Esperado: timeouts do servidor HTTP definidos; configuração sem sobras
- Observado: sem `requestTimeout`, `headersTimeout` e `keepAliveTimeout`; limitador montado em rota inexistente (K13); `DEACTIVATED_ACCOUNT_RETENTION_DAYS` lido e nunca usado; logger sem nível mínimo; frontend sem `.env.example`
- Reprodução: leitura dos arquivos
- Consequência: conexão lenta ocupa o servidor; configuração que parece ativa não tem efeito
- Origem: estrutura inicial (`ceb0abe`, `server.js`), E7 (`b4c682f`, variável sem uso), renovação da autorização do GitHub (`6e912d4`, limitador órfão) e E12 (`5364cfc`, variáveis do frontend)
- Proposta: timeouts explícitos no `server.js`; remover o limitador órfão e a variável sem uso, ou ligá-la à retenção

### [MÉDIA] CF-36 — Resumo da sincronização sem ignorados nem itens com erro

- Onde: `backend/src/modules/github/services/github-sync-run.service.js` (resumo da execução)
- Norma: §13.10 do anexo ("operações em lote devem informar itens criados, atualizados, ignorados e com erro"); ARQ-27
- Esperado: o resumo informa ignorados e itens com erro
- Observado: `found`, `created` e `updated` por artefato; branch sem SHA ignorada só aparece no log
- Reprodução: leitura do DTO da execução
- Consequência: falha parcial aparece como sucesso parcial sem contagem
- Origem: endurecimento da sincronização (`398f72e`) e PR #24
- Proposta: acrescentar `skipped` e `failed` ao resumo, com a contagem das branches ignoradas

### [MÉDIA] CF-37 — Sem E2E de navegador e sem decisão de dispensa

- Onde: projeto inteiro; roadmap S1-01 (D-RM-03)
- Norma: §15.2 do anexo; DoD do roadmap; ARQ-29 (divergência DX)
- Esperado: E2E dos fluxos críticos ou decisão explícita de dispensa
- Observado: nenhum Playwright ou Cypress; o checklist do S1-01 tirou o E2E; o backlog dá prioridades diferentes ao tema (E15-F10 MÉDIA, S104-F02 ALTA)
- Reprodução: busca nos manifestos e na CI
- Consequência: integração frontend e backend só verificada por jsdom e API
- Origem: S1-01 e seguintes
- Proposta: decisão do João sobre o E2E e prioridade única no backlog

### [MÉDIA] CF-38 — RF37 e RF57 fora da matriz técnica

- Onde: `docs/traceability/RF_TECHNICAL_MATRIX.md`
- Norma: regra 4 da §18 do anexo (não renumerar nem omitir RFs); ARQ-34
- Esperado: todo RF do §5 com linha na matriz, mesmo não implementado
- Observado: RF37 e RF57 sem linha, embora a nota da L94 os cite
- Reprodução: script da seção 5.2
- Consequência: relatórios e PDF somem da cobertura declarada
- Origem: matriz técnica
- Proposta: linhas para RF37 e RF57 com estado `NÃO IMPLEMENTADO` e cartões S2-06 e S2-07

### [MÉDIA] CF-39 — ADRs com número repetido e sem os campos mínimos

- Onde: `docs/architecture/ADR-*.md`
- Norma: §20 do anexo; ARQ-35
- Esperado: número único e nove campos por ADR
- Observado: ADR-009, ADR-010 e ADR-011 duplicados; 15 de 23 sem algum dos campos (os mais antigos sem contexto, alternativas, consequências e impactos)
- Reprodução: script da seção 5.2
- Consequência: referência ambígua por número; decisões antigas sem consequências registradas
- Origem: numeração paralela entre a `main` (conta, GitHub e legado) e a branch do cronograma (RF10 e S1-04); dos 15 incompletos, 13 vêm da `main` (ADR-002 a ADR-008 e ADR-009 a ADR-014 de lá) e 2 do cronograma (ADR-010 e ADR-011 de sprints)
- Proposta: renumerar os três duplicados (mantendo o nome antigo citado) e completar os campos

### [MÉDIA] CF-40 — Documentação viva contraditória

- Onde: `docs/architecture/SYSTEM_ARCHITECTURE.md`, `docs/traceability/RF_TECHNICAL_MATRIX.md`, `docs/design/UI_SURFACE_INVENTORY.md`, `README.md`, `CONTRIBUTING.md`, `docs/issues/TECHNICAL_BACKLOG.md`, `docs/api/API_CONTRACTS.md`
- Norma: §3 e regra 15 da §18 do anexo; ARQ-36
- Esperado: documentos coerentes entre si e com o código
- Observado: K12, K14, K16, K17, K19, K20 e K24 (seção 5.3)
- Reprodução: seção 5.3
- Consequência: quem lê o documento decide com informação errada (por exemplo, que não há agendador)
- Origem: da `main`, K12, K14, a L214 do K16, a L186 do K17 e o validador de drift do K19; da `joao-dev-v2`, a L94 do K16 (resolvida na junção `0ce1516`), a ausência do S2-01 ao S2-03 no K17, os jobs do K19 e o K24; o K20 vem de entregas paralelas das duas branches
- Proposta: corrigir os sete pontos num commit de documentação; versionar ou deslinkar os prompts citados

## Apêndice A — Rotas registradas

Gerado do roteador do Express no commit verificado. "Sessão" indica se `authenticate` vem antes da
rota. "CSRF" vale só para métodos que mudam estado. "Validação" indica `validateRequest` na própria
rota.

| ID | Método | Caminho | Sessão | CSRF | Validação |
|---|---|---|---|---|---|
| INV-R001 | GET | `/api/account/audit-events` | sim | — | sim |
| INV-R002 | GET | `/api/account/reactivation/confirm` | **pública** | — | sim |
| INV-R003 | POST | `/api/account/reactivation/start` | sim | sim | sim |
| INV-R004 | POST | `/api/auth/change-password` | sim | sim | sim |
| INV-R005 | GET | `/api/auth/csrf` | sim | — | não |
| INV-R006 | POST | `/api/auth/email-verification/resend` | sim | sim | sim |
| INV-R007 | POST | `/api/auth/email-verification/verify` | **pública** | não | sim |
| INV-R008 | POST | `/api/auth/forgot-password` | **pública** | não | sim |
| INV-R009 | GET | `/api/auth/github/callback` | **pública** | — | não |
| INV-R010 | POST | `/api/auth/github/reauth/start` | sim | sim | sim |
| INV-R011 | POST | `/api/auth/github/start` | **pública** | não | sim |
| INV-R012 | POST | `/api/auth/login` | **pública** | não | sim |
| INV-R013 | POST | `/api/auth/logout` | sim | sim | não |
| INV-R014 | GET | `/api/auth/me` | sim | — | não |
| INV-R015 | POST | `/api/auth/register` | **pública** | não | sim |
| INV-R016 | POST | `/api/auth/reset-password` | **pública** | não | sim |
| INV-R017 | PATCH | `/api/auth/username` | sim | sim | sim |
| INV-R018 | DELETE | `/api/defects/:id` | sim | sim | sim |
| INV-R019 | GET | `/api/defects/:id` | sim | — | sim |
| INV-R020 | PUT | `/api/defects/:id` | sim | sim | sim |
| INV-R021 | POST | `/api/defects/:id/correction-tasks` | sim | sim | sim |
| INV-R022 | GET | `/api/defects/:id/history` | sim | — | sim |
| INV-R023 | GET | `/api/defects/:id/retests` | sim | — | sim |
| INV-R024 | GET | `/api/github-app/callback` | **pública** | — | não |
| INV-R025 | GET | `/api/github/app/installations` | sim | — | não |
| INV-R026 | GET | `/api/github/app/installations/:installationId/repositories` | sim | — | sim |
| INV-R027 | POST | `/api/github/app/installations/start` | sim | sim | sim |
| INV-R028 | GET | `/api/github/app/repositories` | sim | — | sim |
| INV-R029 | DELETE | `/api/milestones/:id` | sim | sim | sim |
| INV-R030 | GET | `/api/milestones/:id` | sim | — | sim |
| INV-R031 | PUT | `/api/milestones/:id` | sim | sim | sim |
| INV-R032 | PATCH | `/api/milestones/:id/status` | sim | sim | sim |
| INV-R033 | GET | `/api/notifications` | sim | — | sim |
| INV-R034 | PATCH | `/api/notifications/:notificationId` | sim | sim | sim |
| INV-R035 | POST | `/api/notifications/read-all` | sim | sim | sim |
| INV-R036 | GET | `/api/notifications/unread-count` | sim | — | sim |
| INV-R037 | GET | `/api/projects` | sim | — | não |
| INV-R038 | POST | `/api/projects` | sim | sim | sim |
| INV-R039 | DELETE | `/api/projects/:id` | sim | sim | sim |
| INV-R040 | GET | `/api/projects/:id` | sim | — | sim |
| INV-R041 | PUT | `/api/projects/:id` | sim | sim | sim |
| INV-R042 | DELETE | `/api/projects/:id/permanent` | sim | sim | sim |
| INV-R043 | POST | `/api/projects/:id/restore` | sim | sim | sim |
| INV-R044 | GET | `/api/projects/:projectId/access-code` | sim | — | sim |
| INV-R045 | PATCH | `/api/projects/:projectId/access-code` | sim | sim | sim |
| INV-R046 | POST | `/api/projects/:projectId/access-code/regenerate` | sim | sim | sim |
| INV-R047 | GET | `/api/projects/:projectId/artifacts` | sim | — | sim |
| INV-R048 | GET | `/api/projects/:projectId/audit-events` | sim | — | sim |
| INV-R049 | GET | `/api/projects/:projectId/commits` | sim | — | sim |
| INV-R050 | GET | `/api/projects/:projectId/defects` | sim | — | sim |
| INV-R051 | POST | `/api/projects/:projectId/defects` | sim | sim | sim |
| INV-R052 | GET | `/api/projects/:projectId/defects/detection-candidates` | sim | — | sim |
| INV-R053 | GET | `/api/projects/:projectId/events` | sim | — | sim |
| INV-R054 | PUT | `/api/projects/:projectId/github/integration` | sim | sim | sim |
| INV-R055 | POST | `/api/projects/:projectId/github/sync` | sim | sim | sim |
| INV-R056 | PATCH | `/api/projects/:projectId/github/sync-settings` | sim | sim | sim |
| INV-R057 | GET | `/api/projects/:projectId/github/sync/status` | sim | — | sim |
| INV-R058 | DELETE | `/api/projects/:projectId/indicator-preference` | sim | sim | sim |
| INV-R059 | GET | `/api/projects/:projectId/indicator-preference` | sim | — | sim |
| INV-R060 | PUT | `/api/projects/:projectId/indicator-preference` | sim | sim | sim |
| INV-R061 | GET | `/api/projects/:projectId/indicators/activity` | sim | — | sim |
| INV-R062 | GET | `/api/projects/:projectId/indicators/catalog` | sim | — | sim |
| INV-R063 | GET | `/api/projects/:projectId/indicators/dashboard` | sim | — | sim |
| INV-R064 | GET | `/api/projects/:projectId/indicators/github` | sim | — | sim |
| INV-R065 | GET | `/api/projects/:projectId/indicators/progress` | sim | — | sim |
| INV-R066 | GET | `/api/projects/:projectId/indicators/quality` | sim | — | sim |
| INV-R067 | GET | `/api/projects/:projectId/indicators/sprints` | sim | — | sim |
| INV-R068 | GET | `/api/projects/:projectId/indicators/tasks` | sim | — | sim |
| INV-R069 | GET | `/api/projects/:projectId/indicators/traceability` | sim | — | sim |
| INV-R070 | GET | `/api/projects/:projectId/invitations` | sim | — | sim |
| INV-R071 | POST | `/api/projects/:projectId/invitations` | sim | sim | sim |
| INV-R072 | DELETE | `/api/projects/:projectId/invitations/:invitationId` | sim | sim | sim |
| INV-R073 | GET | `/api/projects/:projectId/issues` | sim | — | sim |
| INV-R074 | GET | `/api/projects/:projectId/kanban` | sim | — | sim |
| INV-R075 | GET | `/api/projects/:projectId/kanban/metrics` | sim | — | sim |
| INV-R076 | GET | `/api/projects/:projectId/kanban/movements` | sim | — | sim |
| INV-R077 | GET | `/api/projects/:projectId/members` | sim | — | sim |
| INV-R078 | DELETE | `/api/projects/:projectId/members/:membershipId` | sim | sim | sim |
| INV-R079 | PATCH | `/api/projects/:projectId/members/:membershipId` | sim | sim | sim |
| INV-R080 | POST | `/api/projects/:projectId/members/:membershipId/reactivate` | sim | sim | sim |
| INV-R081 | DELETE | `/api/projects/:projectId/members/me` | sim | sim | sim |
| INV-R082 | GET | `/api/projects/:projectId/milestones` | sim | — | sim |
| INV-R083 | POST | `/api/projects/:projectId/milestones` | sim | sim | sim |
| INV-R084 | POST | `/api/projects/:projectId/ownership/transfer` | sim | sim | sim |
| INV-R085 | GET | `/api/projects/:projectId/pull-requests` | sim | — | sim |
| INV-R086 | GET | `/api/projects/:projectId/requirements` | sim | — | sim |
| INV-R087 | POST | `/api/projects/:projectId/requirements` | sim | sim | sim |
| INV-R088 | GET | `/api/projects/:projectId/schedule` | sim | — | sim |
| INV-R089 | GET | `/api/projects/:projectId/sprints` | sim | — | sim |
| INV-R090 | POST | `/api/projects/:projectId/sprints` | sim | sim | sim |
| INV-R091 | GET | `/api/projects/:projectId/tasks` | sim | — | sim |
| INV-R092 | POST | `/api/projects/:projectId/tasks` | sim | sim | sim |
| INV-R093 | GET | `/api/projects/:projectId/tasks/history` | sim | — | sim |
| INV-R094 | GET | `/api/projects/:projectId/tasks/metrics` | sim | — | sim |
| INV-R095 | GET | `/api/projects/:projectId/test-cases` | sim | — | sim |
| INV-R096 | POST | `/api/projects/:projectId/test-cases` | sim | sim | sim |
| INV-R097 | GET | `/api/projects/:projectId/traceability/alerts` | sim | — | sim |
| INV-R098 | GET | `/api/projects/:projectId/traceability/alerts/:alertId` | sim | — | sim |
| INV-R099 | POST | `/api/projects/:projectId/traceability/alerts/:alertId/dismiss` | sim | sim | sim |
| INV-R100 | POST | `/api/projects/:projectId/traceability/alerts/reconcile` | sim | sim | sim |
| INV-R101 | GET | `/api/projects/:projectId/traceability/alerts/summary` | sim | — | sim |
| INV-R102 | GET | `/api/projects/:projectId/traceability/artifacts/:artifactType/:artifactId` | sim | — | sim |
| INV-R103 | GET | `/api/projects/:projectId/traceability/commit-coverage` | sim | — | sim |
| INV-R104 | GET | `/api/projects/:projectId/traceability/commit-suggestions` | sim | — | sim |
| INV-R105 | POST | `/api/projects/:projectId/traceability/commit-suggestions/:suggestionId/confirm` | sim | sim | sim |
| INV-R106 | POST | `/api/projects/:projectId/traceability/commit-suggestions/:suggestionId/reject` | sim | sim | sim |
| INV-R107 | POST | `/api/projects/:projectId/traceability/commit-suggestions/scan` | sim | sim | sim |
| INV-R108 | GET | `/api/projects/:projectId/traceability/issue-coverage` | sim | — | sim |
| INV-R109 | GET | `/api/projects/:projectId/traceability/pull-request-coverage` | sim | — | sim |
| INV-R110 | GET | `/api/projects/:projectId/traceability/requirement-task-coverage` | sim | — | sim |
| INV-R111 | GET | `/api/projects/:projectId/traceability/requirements` | sim | — | sim |
| INV-R112 | GET | `/api/projects/:projectId/traceability/requirements-matrix` | sim | — | sim |
| INV-R113 | GET | `/api/projects/:projectId/traceability/requirements/:requirementId` | sim | — | sim |
| INV-R114 | GET | `/api/projects/:projectId/traceability/requirements/:requirementId/current` | sim | — | sim |
| INV-R115 | GET | `/api/projects/:projectId/traceability/requirements/:requirementId/history` | sim | — | sim |
| INV-R116 | GET | `/api/projects/:projectId/traceability/tasks-without-technical-links` | sim | — | sim |
| INV-R117 | GET | `/api/projects/:projectId/traceability/tasks/:taskId` | sim | — | sim |
| INV-R118 | POST | `/api/projects/from-github` | sim | sim | sim |
| INV-R119 | POST | `/api/projects/invitations/:invitationId/accept` | sim | sim | sim |
| INV-R120 | POST | `/api/projects/invitations/:invitationId/decline` | sim | sim | sim |
| INV-R121 | POST | `/api/projects/invitations/accept` | sim | sim | sim |
| INV-R122 | POST | `/api/projects/invitations/decline` | sim | sim | sim |
| INV-R123 | POST | `/api/projects/invitations/details` | sim | sim | sim |
| INV-R124 | GET | `/api/projects/invitations/mine` | sim | — | não |
| INV-R125 | POST | `/api/projects/join` | sim | sim | sim |
| INV-R126 | GET | `/api/projects/join/details` | sim | — | sim |
| INV-R127 | DELETE | `/api/requirements/:id` | sim | sim | sim |
| INV-R128 | GET | `/api/requirements/:id` | sim | — | sim |
| INV-R129 | PUT | `/api/requirements/:id` | sim | sim | sim |
| INV-R130 | PATCH | `/api/requirements/:id/confirm-completion` | sim | sim | sim |
| INV-R131 | PATCH | `/api/requirements/:id/status` | sim | sim | sim |
| INV-R132 | GET | `/api/requirements/:id/tasks` | sim | — | sim |
| INV-R133 | PUT | `/api/requirements/:id/tasks` | sim | sim | sim |
| INV-R134 | GET | `/api/settings/account` | sim | — | não |
| INV-R135 | POST | `/api/settings/account/deactivate` | sim | sim | sim |
| INV-R136 | DELETE | `/api/settings/account/email-change` | sim | sim | não |
| INV-R137 | POST | `/api/settings/account/email-change` | sim | sim | sim |
| INV-R138 | GET | `/api/settings/account/email-change/confirm` | **pública** | — | sim |
| INV-R139 | GET | `/api/settings/account/email-change/status` | sim | — | não |
| INV-R140 | PATCH | `/api/settings/account/profile` | sim | sim | sim |
| INV-R141 | PATCH | `/api/settings/account/username` | sim | sim | sim |
| INV-R142 | GET | `/api/settings/integrations/github` | sim | — | não |
| INV-R143 | DELETE | `/api/settings/integrations/github-identity` | sim | sim | sim |
| INV-R144 | GET | `/api/settings/integrations/github-identity` | sim | — | não |
| INV-R145 | POST | `/api/settings/integrations/github-identity/link/start` | sim | sim | sim |
| INV-R146 | DELETE | `/api/settings/integrations/github/authorizations/:authorizationId` | sim | sim | sim |
| INV-R147 | GET | `/api/settings/notifications` | sim | — | sim |
| INV-R148 | PUT | `/api/settings/notifications` | sim | sim | sim |
| INV-R149 | DELETE | `/api/settings/privacy/deletion` | sim | sim | sim |
| INV-R150 | GET | `/api/settings/privacy/deletion` | sim | — | não |
| INV-R151 | POST | `/api/settings/privacy/deletion` | sim | sim | sim |
| INV-R152 | POST | `/api/settings/privacy/export` | sim | sim | não |
| INV-R153 | POST | `/api/settings/security/password` | sim | sim | sim |
| INV-R154 | POST | `/api/settings/security/password/initialize` | sim | sim | sim |
| INV-R155 | GET | `/api/settings/security/sessions` | sim | — | não |
| INV-R156 | DELETE | `/api/settings/security/sessions/:sessionId` | sim | sim | sim |
| INV-R157 | POST | `/api/settings/security/sessions/revoke-others` | sim | sim | não |
| INV-R158 | DELETE | `/api/sprints/:id` | sim | sim | sim |
| INV-R159 | GET | `/api/sprints/:id` | sim | — | sim |
| INV-R160 | PUT | `/api/sprints/:id` | sim | sim | sim |
| INV-R161 | GET | `/api/sprints/:id/impact` | sim | — | sim |
| INV-R162 | GET | `/api/sprints/:id/progress` | sim | — | sim |
| INV-R163 | PATCH | `/api/sprints/:id/status` | sim | sim | sim |
| INV-R164 | GET | `/api/sprints/:id/tasks` | sim | — | sim |
| INV-R165 | PUT | `/api/sprints/:id/tasks` | sim | sim | sim |
| INV-R166 | DELETE | `/api/tasks/:id` | sim | sim | sim |
| INV-R167 | GET | `/api/tasks/:id` | sim | — | sim |
| INV-R168 | PUT | `/api/tasks/:id` | sim | sim | sim |
| INV-R169 | GET | `/api/tasks/:id/comments` | sim | — | sim |
| INV-R170 | POST | `/api/tasks/:id/comments` | sim | sim | sim |
| INV-R171 | DELETE | `/api/tasks/:id/comments/:commentId` | sim | sim | sim |
| INV-R172 | PATCH | `/api/tasks/:id/comments/:commentId` | sim | sim | sim |
| INV-R173 | GET | `/api/tasks/:id/commits` | sim | — | sim |
| INV-R174 | POST | `/api/tasks/:id/commits` | sim | sim | sim |
| INV-R175 | DELETE | `/api/tasks/:id/commits/:commitId` | sim | sim | sim |
| INV-R176 | GET | `/api/tasks/:id/issues` | sim | — | sim |
| INV-R177 | POST | `/api/tasks/:id/issues` | sim | sim | sim |
| INV-R178 | DELETE | `/api/tasks/:id/issues/:issueId` | sim | sim | sim |
| INV-R179 | PATCH | `/api/tasks/:id/move` | sim | sim | sim |
| INV-R180 | DELETE | `/api/tasks/:id/pull-request` | sim | sim | sim |
| INV-R181 | PATCH | `/api/tasks/:id/pull-request` | sim | sim | sim |
| INV-R182 | DELETE | `/api/tasks/:id/requirement` | sim | sim | sim |
| INV-R183 | PATCH | `/api/tasks/:id/requirement` | sim | sim | sim |
| INV-R184 | DELETE | `/api/tasks/:id/sprint` | sim | sim | sim |
| INV-R185 | PATCH | `/api/tasks/:id/sprint` | sim | sim | sim |
| INV-R186 | PATCH | `/api/tasks/:id/status` | sim | sim | sim |
| INV-R187 | GET | `/api/tasks/:id/time-entries` | sim | — | sim |
| INV-R188 | POST | `/api/tasks/:id/time-entries` | sim | sim | sim |
| INV-R189 | DELETE | `/api/tasks/:id/time-entries/:entryId` | sim | sim | sim |
| INV-R190 | PATCH | `/api/tasks/:id/time-entries/:entryId` | sim | sim | sim |
| INV-R191 | GET | `/api/tasks/:id/time-entries/history` | sim | — | sim |
| INV-R192 | POST | `/api/tasks/:id/time-entries/start` | sim | sim | sim |
| INV-R193 | POST | `/api/tasks/:id/time-entries/stop` | sim | sim | sim |
| INV-R194 | DELETE | `/api/test-cases/:id` | sim | sim | sim |
| INV-R195 | GET | `/api/test-cases/:id` | sim | — | sim |
| INV-R196 | PUT | `/api/test-cases/:id` | sim | sim | sim |
| INV-R197 | GET | `/api/test-cases/:id/executions` | sim | — | sim |
| INV-R198 | POST | `/api/test-cases/:id/executions` | sim | sim | sim |
| INV-R199 | GET | `/api/test-cases/:id/history` | sim | — | sim |
| INV-R200 | PATCH | `/api/test-cases/:id/status` | sim | sim | sim |
| INV-R201 | GET | `/api/test-cases/:id/tested-references` | sim | — | sim |
| INV-R202 | GET | `/api/test-cases/:id/versions` | sim | — | sim |
| INV-R203 | GET | `/api/test-evidence/:id/content` | sim | — | sim |
| INV-R204 | GET | `/api/test-executions/:id` | sim | — | sim |
| INV-R205 | POST | `/api/webhooks/github-app` | **pública** | não | não |
| INV-R206 | GET | `/health` | **pública** | — | não |
| INV-R207 | GET | `/health/live` | **pública** | — | não |
| INV-R208 | GET | `/health/ready` | **pública** | — | não |
