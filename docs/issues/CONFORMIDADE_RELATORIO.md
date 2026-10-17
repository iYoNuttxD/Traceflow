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
| Última fase concluída | 5, com o percurso manual de UI pendente (seção 8.6) |
| Commits da campanha | `7569479` (Fase 0), `28d99d1` (Fase 1), `301998e` (Fase 2), `5805e79` (Fase 3), `b3a9b1b` (Fase 4) e o deste relatório (Fase 5), locais e sem push |
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
| ATENDIDO | 37 | 98 |
| PARCIAL | 5 | 36 |
| NÃO ATENDIDO | 9 | 25 |
| NÃO VERIFICÁVEL LOCALMENTE | 4 | 18 |
| NÃO APLICÁVEL | 15 | 76 |
| **Total** | **70** | **253** |

Números revisados na Fase 4:
- a H09 derrubou V1.1.1, V8.2.1, V8.2.2, V8.3.1 e V8.4.1, que estavam atendidos;
- a H01 levou V16.5.2 de parcial a não atendido.

Na Fase 1, os números eram 40 e 103 atendidos, 5 e 37 parciais e 6 e 19 não atendidos (L1 e L1+L2).

- **Aplicáveis:** 177.
- **Aplicáveis e verificáveis localmente:** 159, dos quais 98 atendidos (61,6%).
- **L1 não atendidos (9):** V3.3.1, V3.5.3, V6.2.4, V7.2.4, V8.2.1, V8.2.2, V8.3.1, V14.2.1 e V14.3.1.
- **A meta L2 da §13.1 do anexo não é atingida hoje.** São 25 requisitos não atendidos e 36 parciais; os
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
| CONFORME | 11 |
| NÃO CONFORME | 22 |
| NÃO VERIFICÁVEL LOCALMENTE | 3 (ARQ-04, ARQ-31 e ARQ-32, por causa do ⚑9) |
| **Total** | **36** |

Conformidade sobre as regras verificáveis: 11 de 33 (33,3%). Número revisado na Fase 4: a H09 derrubou a
ARQ-22 (autorização negada por padrão), que a Fase 2 dava como conforme com 12 de 33.

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

## 6. Parte C — `TRACEFLOW_ROADMAP_INCREMENTAL.md`

Matriz completa em `docs/issues/CONFORMIDADE_MATRIZ_ROADMAP.md`. As evidências de cada critério
vieram de cinco levantamentos somente leitura, um por grupo de cartões. Os vereditos negativos e as
linhas citadas nos achados foram conferidos no código.

### 6.1 Números

| Bloco | EVIDENCIADO | PARCIAL | AUSENTE | SÓ DOCUMENTADO | NÃO INICIADO | Total |
|---|---:|---:|---:|---:|---:|---:|
| Critérios de aceite, S1-01 a S2-05 | 54 | 25 | 1 | 0 | 0 | 80 |
| Critérios de aceite, S2-06 a S3-05 | 0 | 0 | 0 | 0 | 61 | 61 |
| DoD comum (14 cartões × 10 itens) | 39 | 76 | 3 | 22 | 0 | 140 |

- Critérios dos cartões iniciados com prova completa: 54 de 80 (67,5%).
- O único `AUSENTE` é o e-mail real do S1-02 (CF-44).
- A H09, autorização furada por ID codificado (Parte D), pesa em vários vereditos:
  - cinco critérios caem para `PARCIAL` só por causa dela (RM-S101-5, RM-S103-3, RM-S103-4,
    RM-S105-6 e RM-S201-6);
  - ela também pesa no RM-S205-6;
  - no DoD, derruba o item 2 de nove cartões.
- Das 54 caixas `[x]`: 37 com evidência, 14 parciais, 1 sem evidência e 2 contraditas.
- Nem a Sprint 1 nem a Sprint 2 podem ser declaradas concluídas. Faltam E2E, homologação externa,
  os RFs parciais, a correção da H09 e a coerência documental.

### 6.2 Achados conhecidos verificados na Fase 3

| ID | Situação | Evidência |
|---|---|---|
| K4 | confirmado | `fe05208` (04/08/2026, "docs: substituir implantação Azure por OCI") trocou a nuvem do roadmap sem ADR; o ADR-017:96-97 só diz que "a implantação pretendida é OCI"; o S2-08 mantém "[ ] criar ADR e diagrama da implantação planejada" (cópia, L628) |
| K5 | confirmado | a cópia trocou "adicionar testes unitários, API e E2E" por "unitários, API e frontend automatizados" e marcou `[x]` (L104), mas os entregáveis do S1-01 ainda pedem "testes E2E" (L88); o backlog dá MÉDIA ao E15-F10 (L13) e ALTA ao S104-F02 (L23), sem decisão de dispensa (já é a CF-37) |
| K6 | confirmado | S2-02 (L440-464) e S2-03 (L465-489) com as 10 caixas `[ ]` e nenhuma nota de estado, embora a matriz dê RF30, RF59, RF60 e RF61 como implementados localmente |
| K7 | confirmado | `TECHNICAL_BACKLOG.md:16` (E15-F13) lista RF29–RF34, RF42–RF46 e RF54–RF57 como "fora do produto"; a matriz dá RF29, RF31–RF34, RF42, RF55 e RF56 como implementados, e o parêntese tira o RF59 "com o S2-02", mas deixa o RF30 dentro de RF29–RF34 |
| K18 | confirmado | o cabeçalho LR.7 (L7-13) diz que "os checklists funcionais abaixo não foram promovidos" e cita "39 migrations"; hoje há 46 `[x]` nos cartões da Sprint 1 e 74 pastas de migration |
| K22 | confirmado | "Retenção específica de SyncRun: DECISION REQUIRED (D-A)" no ADR-017:89 e nos relatórios da PR #24; nenhum item do backlog trata dela |
| K23 | confirmado | `TECHNICAL_BACKLOG.md:35` (S104-F15, de 01/09) diz que a criação sem marco responde `400 SPRINT_MILESTONE_REQUIRED`; o código foi aposentado em 04/09 (`6c95bec`, FIX-03; `API_CONTRACTS.md:1046-1047`) e não existe mais em `backend/src` |

### 6.3 Achados da Parte C

Cada achado tem um item `CONF-Fnn` de mesmo número no backlog (Fase 5).

### [ALTA] CF-41 — Horas exibidas como pontos nas telas de sprint

- Onde: `frontend/src/features/schedule/components/schedule-display.js:164-179`; `frontend/src/features/schedule/components/SprintList.jsx:122,128,152-153`; `frontend/src/features/schedule/components/SprintsSummary.jsx:19`; também `SprintTasksPanel`, `SprintProgressPanel`, `ScheduleCalendar`, `MilestoneSprintsPanel`, `SprintBurndownChart` e `KanbanSummary`
- Norma: roadmap S1-06, critério "unidade de esforço é única e exibida em criação, edição e consulta"; caixa `[x]` "definir unidade e fórmula em decisão documentada"
- Esperado: horas em toda tela que mostra esforço
- Observado:
  - o contrato fixa "Unidade única: **horas**" (`docs/api/API_CONTRACTS.md:387`);
  - o backend copia `estimatedEffort` para `SprintTask.pointsAtPlanning` (`backend/src/modules/sprints/repositories/sprint.repository.js:68`);
  - `summarizeSprintTasks` soma `estimatedEffort`, e as telas de sprint, marco, cronograma e Kanban rotulam a soma como "pts" e "pontos";
  - o painel de indicadores mostra o burndown da mesma sprint em horas (`frontend/test/features/DashboardPanel.test.jsx:1665`, "18 h");
  - os testes das telas de sprint travam "pontos".
- Reprodução: leitura de `summarizeSprintTasks` e dos rótulos citados
- Consequência: a mesma grandeza aparece com duas unidades; quem planeja a sprint lê horas como pontos de história
- Origem: S1-04 (`f3fc475`, design das sprints com "pts") e S1-06 (decisão por horas, sem rever as telas de sprint)
- Proposta: rotular em horas nas telas de sprint, marco, cronograma e Kanban, ajustando os testes; registrar a unidade num ADR

### [MÉDIA] CF-42 — Notas "CONCLUÍDO" do S1-07 e do S1-08 sem a homologação que afirmam

- Onde: `TRACEFLOW_ROADMAP_INCREMENTAL.md:287-293` e `:319-323`
- Norma: §4 do roadmap (DoD); D-RM-07 (cada marcação é alegação a verificar)
- Esperado: nota de estado igual à evidência que cita
- Observado:
  - as notas dizem que tudo foi "implementado e homologado";
  - os relatórios que elas citam dizem o contrário:
    - "homologação visual completa ainda pendente. Não é um PASS global da entrega" (`docs/deliveries/S1_08_FRONTEND_INTEGRATION_REPORT.md:9-10`);
    - "CI remoto **NOT RUN**" (`docs/deliveries/S1_07_FRONTEND_INTEGRATION_REPORT.md:3-5`);
    - o relatório FIX-03 registra que o QA integrado final do S1-08 não começou (`docs/deliveries/S1_08_UX_STANDARDIZATION_FIX_03_REPORT.md:260-261`);
  - a matriz RF deixa o RF42 com homologação visual pendente e o RF45 e o RF46 como `PARCIAL`.
- Reprodução: leitura cruzada das notas, dos relatórios e da matriz RF
- Consequência: o roadmap declara homologado o que a própria evidência dá como pendente
- Origem: entrega do S1-09 na `main` ("feat: complete integration and testing for S1-09")
- Proposta: trocar por "implementado localmente; homologação visual e CI pendentes", como na nota do S2-01

### [MÉDIA] CF-43 — Caixas `[x]` sem evidência ou contraditas

- Onde: checklists do S1-01 ao S1-09, do S2-01 e do marco P9 em `TRACEFLOW_ROADMAP_INCREMENTAL.md`
- Norma: D-RM-07; a Parte C exige que toda caixa marcada se ligue a evidência
- Esperado: toda caixa `[x]` com evidência
- Observado: das 54 caixas `[x]`:
  - 2 são contraditas pelo código: a autorização do S1-03, pela H09, e a unidade do S1-06, pela CF-41;
  - 1 não tem evidência: os eventos de autenticação do S1-01, que só existem no código, sem teste;
  - 14 têm evidência parcial (lista na seção 4 da matriz do roadmap).
- Reprodução: `docs/issues/CONFORMIDADE_MATRIZ_ROADMAP.md`, seção 4
- Consequência: a cópia do roadmap afirma mais do que o repositório prova
- Origem: as marcações problemáticas são de entregas da `main` (S1-01, S1-02, S1-03, S1-06, S1-07, S1-08, S1-09 e o marco P9); as do S1-04, do S1-05 e do S2-01 se sustentam
- Proposta: desmarcar as 3 caixas contraditas ou sem evidência até a correção; anotar a pendência nas parciais

### [MÉDIA] CF-44 — Capturador de e-mail fora dos testes e SMTP real sem homologação

- Onde: `backend/src/config/env.js:179`; `backend/src/shared/email/email.provider.js:7-14`; `backend/.env.example:57`; `docs/architecture/ADR-002-AUTHENTICATION-SESSION.md:22`
- Norma: roadmap S1-02, critério "e-mail real é enviado em homologação; capturadores permanecem restritos a testes"
- Esperado: SMTP real em homologação; capturador só em teste
- Observado:
  - fora de produção, o padrão é o capturador, inclusive em desenvolvimento, e ele guarda as últimas 100 mensagens em memória;
  - o ADR-002 aceita o capturador em "desenvolvimento/teste" sem registrar a divergência com o anexo;
  - não há homologação com SMTP real (L1-F01 aberto) nem runbook de SMTP;
  - a recusa do capturador em produção (`env.js:183-186`) não tem teste.
- Reprodução: leitura de `parseEmailConfiguration`
- Consequência: o fluxo de recuperação de senha nunca foi provado com entrega real
- Origem: E6 e L1 (`main`)
- Proposta: registrar a escolha para desenvolvimento como divergência; testar a recusa em produção; homologar o SMTP no S2-08

### [MÉDIA] CF-45 — Implantação trocada de Azure para OCI sem ADR

- Onde: `TRACEFLOW_ROADMAP_INCREMENTAL.md` (26 menções à OCI, nenhuma à Azure); `docs/architecture/ADR-017-GITHUB-ASYNC-SYNC.md:96-97`
- Norma: §20 do anexo de arquitetura (decisão relevante exige ADR); D-RM-01 (DR)
- Esperado: ADR da nuvem e da topologia de implantação
- Observado: K4 (seção 6.2)
- Reprodução: `git show fe05208`; busca por ADR de implantação em `docs/architecture`
- Consequência: S2-08 a S2-10 partem de uma decisão sem contexto, alternativas nem consequências registradas
- Origem: `main` (`fe05208`)
- Proposta: ADR da implantação antes de iniciar o S2-08

### [MÉDIA] CF-46 — Retenção do SyncRun sem decisão nem item no backlog

- Onde: `docs/architecture/ADR-017-GITHUB-ASYNC-SYNC.md:89`; `docs/privacy/DATA_RETENTION_POLICY.md:42`
- Norma: §14 do anexo de arquitetura (retenção definida); LGPD
- Esperado: prazo de descarte aprovado, ou item no backlog com dono
- Observado: "D-A / M4 — DECISION REQUIRED: não existe prazo numérico aprovado para descarte de SyncRuns"; a execução guarda `requestedByUserId`; nenhum item do backlog acompanha a decisão (K22)
- Reprodução: leitura dos dois documentos e busca no backlog
- Consequência: dado ligado a pessoa sem prazo de descarte
- Origem: PR #24 (`main`)
- Proposta: decidir o prazo e abrir o item no backlog, com o job de limpeza

### [MÉDIA] CF-47 — Roadmap e backlog desatualizados

- Onde: `TRACEFLOW_ROADMAP_INCREMENTAL.md:7-13` e `:440-489`; `docs/issues/TECHNICAL_BACKLOG.md:16` e `:35`
- Norma: §3 do anexo de arquitetura (documentação viva)
- Esperado: estado dos cartões e itens do backlog iguais ao código
- Observado: K6, K7, K18 e K23 (seção 6.2)
- Reprodução: seção 6.2
- Consequência: o backlog põe fora do produto RFs entregues, e o roadmap esconde o estado do S2-02 e do S2-03
- Origem: K6, K7 e K23 da `joao-dev-v2` (cartões S2-02 e S2-03 sem marcação; últimas edições do E15-F13 e do S104-F15); K18 da `main`
- Proposta: atualizar as quatro passagens num commit de documentação

### [MÉDIA] CF-48 — Saúde do projeto sem fórmula, fonte e horário na interface

- Onde: `frontend/src/features/indicators/components/ProjectHealth.jsx:40-52`; `frontend/test/features/DashboardPanel.test.jsx:568`
- Norma: roadmap S2-05, critério "cada número permite identificar fórmula, fonte e horário de atualização"; RF55
- Esperado: a nota de saúde tão auditável quanto as fichas dos indicadores
- Observado:
  - a ajuda da saúde mostra a nota, a cobertura e um aviso, sem fórmula, fontes nem horário do cálculo;
  - o teste trava a ausência de pesos na ajuda;
  - a fórmula está só em `docs/indicators/PROJECT_HEALTH_MODEL_V1.md`, embora a API já devolva `calculatedAt`.
- Reprodução: leitura do componente e do teste
- Consequência: a nota de 0 a 100 do painel não é auditável por quem a lê
- Origem: indicadores P8 (`main`)
- Proposta: mostrar na ajuda a fórmula resumida, as fontes e o `calculatedAt`

### [MÉDIA] CF-49 — Aprovação em revisões sem fonte de dados nem item no backlog

- Onde: `backend/src/modules/github/github.client.js:55-133`; `backend/src/modules/indicators/indicators.catalog.js:81-95`; `docs/indicators/S2_INDICATOR_CATALOG.md:73`
- Norma: roadmap S2-05, critério "qualidade apresenta taxa de retrabalho e taxa de aprovação em revisões" e dependência "dados de revisão de PR"
- Esperado: taxa de aprovação a partir das revisões do GitHub, ou divergência registrada
- Observado:
  - o cliente GitHub não lê revisões;
  - o I06 mostra mescladas sobre fechadas;
  - o catálogo registra que as revisões "ainda não [são] coletadas" (I19);
  - nenhum item do backlog acompanha a coleta.
- Reprodução: busca por `listReviews` e por `PullRequestReview` em `backend/src`, sem resultado
- Consequência: um critério do S2-05 fica sem caminho de entrega
- Origem: indicadores (`main`)
- Proposta: item no backlog para a coleta das revisões, ou registro da divergência com o anexo

### [BAIXA] CF-50 — Documentos de cartão em desacordo com o código

- Onde e observado:
  - S1-01: `frontend/src/api/http-client.js:7-8` trata `SESSION_INVALID` e `SESSION_EXPIRED`, que o backend nunca emite; a expiração da sessão no backend não tem teste.
  - S1-04: `docs/api/API_CONTRACTS.md:1035` e `:1037` dão `SPRINT_TASK_LIMIT_REACHED` e `SPRINT_DATE_RANGE_INVALID` a casos que a API responde com `VALIDATION_ERROR`; `docs/security/ASVS_BASELINE.md:43` diz `startDate <= endDate`, mas o código exige início antes do fim.
  - S1-05: o comentário da migration `20260829120000_s1_05_add_task_comments` diz que a listagem mostra só comentários ativos, mas ela mostra os excluídos como marcador.
  - S1-07: `docs/traceability/RF_TECHNICAL_MATRIX.md:79-81` dá como pendente a criação de caso de teste a partir de tarefa ou requisito, que existe desde `e93c47c` (`ContextualTestCaseCreate`).
  - S1-08: `docs/data/DEFECT_HISTORY.md:5-8` dá a interface de defeitos como pendente; `docs/design/UI_SURFACE_INVENTORY.md:646` dá os estados da tela de defeitos como validados por teste automatizado, que não existe.
  - Configuração: `backend/README.md:26` diz que produção exige `GITHUB_TOKEN`, e `docs/api/API_CONTRACTS.md:69` diz que essa configuração não existe mais.
- Norma: §3 do anexo de arquitetura (documentação viva)
- Esperado: documentos iguais ao código
- Reprodução: leitura dos trechos citados
- Consequência: quem consulta o documento espera um código, um erro ou uma pendência que o produto não tem
- Origem: S1-04 da `joao-dev-v2`; os demais, de entregas da `main`
- Proposta: corrigir os oito pontos num commit de documentação

## 7. Parte D — erros e inconsistências

Cada hipótese fechou com uma sonda que tentou derrubá-la. A sonda é um teste existente quando ele já
exercita o cenário. As sondas vermelhas rodaram em arquivos temporários de `backend/test/conformance/` e
`frontend/test/conformance/`, apagados antes do commit; as verdes e relevantes entraram na suíte de
conformidade (seção 7.4).

### 7.1 Números

| Veredito | Hipóteses |
|---|---:|
| CONFIRMADA | 25 |
| REFUTADA | 16 |
| INCONCLUSIVA | 0 |
| **Total** | **41** |

**Mutantes:** dos 12 aplicados, 10 foram mortos por testes existentes. M08 e M12 sobreviveram (CF-65).

**Limites desta fase:**
- **Processos separados (⚑9):** a H05 e a H22 rodaram num processo só, e o `KILL QUERY` dentro do
  worker não foi verificado.
- **Dados nos dois extremos:** as sondas rodaram com dados mínimos. Em escala, só a H05 (300 eventos),
  a H21 (10 rodadas), a H09 (143 rotas por papel) e as varreduras do banco da H32 e da H34.
- **Medição de tempo:** a H14 usou a mediana de 20 rodadas.
- **Ficam para o percurso manual da Fase 5:** a H40 (alvo de 44 px e foco depois das ações) e a
  parte visual da H38.

### 7.2 Hipóteses

| ID | Hipótese (resumo) | Veredito | Sonda e evidência | Achado |
|---|---|---|---|---|
| H01 | GitHub mudo prende a execução além do timeout | CONFIRMADA | timeout de 1 s ignorado (pendente aos 6 s); execução `RUNNING` aos 25 s com o heartbeat avançando; novo pedido: "Já existe uma sincronização GitHub em andamento." | CF-52 |
| H02 | falha gravada pelo cliente de recuperação não reagenda | CONFIRMADA | caminho normal: 1 falha e `nextSyncAt` adiado; recuperação: 0 falhas, `nextSyncAt` nulo e projeto vencido para o agendador | CF-54 |
| H03 | execução vencida nunca expira sob escrita contínua | REFUTADA | expirou em 3,8 s com o projeto travado 97,5% do tempo e em 185 ms no ritmo realista | — |
| H04 | lease perdido pula os ganchos | CONFIRMADA | evento `PENDING` sem notificação depois da execução; o job despachou depois (nada perdido); atraso não declarado | CF-66 |
| H05 | despacho dentro da execução atrasa os slots | REFUTADA | o gancho despacha no máximo 100 eventos (0,8 s para 100); os 200 restantes esperam o job ou a próxima sincronização | — |
| H06 | códigos de ocupação divergentes e 503 sem `code` | CONFIRMADA | 503 depois de 52,7 s, só com `message`; auditoria de pedido presa 50,3 s e perdida; demais escritas: 409 `RESOURCE_BUSY` com `Retry-After` | CF-53 |
| H07 | repositório vazio derruba a sincronização | CONFIRMADA | sem branches: `FAILED` (`VALIDATION_ERROR`); branch padrão sem SHA: `FAILED` (`EXTERNAL_SERVICE_ERROR`); 0 PRs e 0 issues | CF-55 |
| H08 | PR reaberta conta no RF18 e não notifica, sem documentação dos dois lados | CONFIRMADA | `api/indicators-p3.test.js:126` e `integration/s203-github-event-dispatch.test.js:921`; nenhum documento cruza os dois lados | CF-67 |
| H09 | alguma rota escapa do escopo de projeto | CONFIRMADA | ID plano: negativa em toda rota (teste novo); ID codificado: não membro lê 53 rotas e escreve em 17; VIEWER faz 18 escritas | CF-51 |
| H10 | vínculo aceita ID de outro projeto no corpo | REFUTADA | 21 tentativas recusadas (teste novo) | — |
| H11 | recurso pessoal vaza entre contas | REFUTADA | notificação, sessão, preferência do painel e convite (teste novo) | — |
| H12 | sem expiração por inatividade | CONFIRMADA | reprodução da Fase 1 (sessão ociosa por 7 dias aceita) | CF-04 |
| H13 | novo login não encerra a sessão apresentada | CONFIRMADA | reprodução da Fase 1 | CF-02 |
| H14 | conta revelada pelo tempo | CONFIRMADA | login 35,9 ms (conta existente) × 4,4 ms (inexistente); recuperação 7,9 × 4,4 ms | CF-61 |
| H15 | senhas comuns aceitas | CONFIRMADA | reprodução da Fase 1 (quatro senhas comuns aceitas) | CF-03 |
| H16 | as duas trocas de senha divergem | CONFIRMADA | as duas recusam 8 caracteres; `auth/change-password` derruba a sessão atual, `settings/security/password` a preserva | CF-62 |
| H17 | token em URL e confirmação por GET | CONFIRMADA | link de troca de e-mail com `?token=`; o GET de confirmação troca o e-mail; links com `localhost` como padrão | CF-06, CF-63 |
| H18 | logout deixa dados no navegador | CONFIRMADA | jsdom: `traceflow.projects.pinned:42` e `recent:42` ficam no `localStorage`; sem `Clear-Site-Data` | CF-07 |
| H19 | cookie sem prefixo | CONFIRMADA | reprodução da Fase 1 | CF-01 |
| H20 | escrita sob trava longa responde 500 ou errado | REFUTADA | 17 rotas: 409 `RESOURCE_BUSY` com `Retry-After: 2` em 2 a 5 s; outro projeto responde 200 | — |
| H21 | envio duplo duplica o efeito | CONFIRMADA | vínculo de commit e de issue: 201 + 500 em 10 de 10 rodadas, sem vínculo duplicado; convite, dispensa, leitura e preferência idempotentes; comentário duplica (sem chave de idempotência) | CF-56 |
| H22 | gancho e job juntos duplicam notificação | REFUTADA | `integration/s203-bateria.test.js:1406` (EV-K-02: 50 eventos, 50 notificações), no mesmo processo | — |
| H23 | worker grava em projeto excluído | REFUTADA | exclusão no meio da página: `FAILED` com `PROJECT_DELETED`, página seguinte não gravada (teste novo) | — |
| H24 | os três relógios divergem | CONFIRMADA | conclusão às 22h30 de 14/10 em São Paulo: dia 14 no indicador e no vencimento, dia 15 no burndown | CF-57 |
| H25 | horário de verão quebra bordas | REFUTADA | `integration/s202-bateria.test.js:377` (7 fusos, 10 trocas) e `unit/indicators.test.js:25` | — |
| H26 | vazio ou indisponível aparece como zero | REFUTADA | `api/indicators-p2.test.js:368` (sem `main`: indisponível), `api/indicators-p7.test.js:90`, `features/DashboardPanel.test.jsx:1063` | — |
| H27 | painel diferente do endpoint | REFUTADA | 52 valores comparados, nenhuma diferença (teste novo) | — |
| H28 | período não vale igual para todas as fichas | CONFIRMADA | todo indicador disponível recebeu o período; mas o aviso `PERIOD_FILTER_NOT_APPLIED_TO_VIEW` some quando o painel pede a saúde do projeto | CF-58 |
| H29 | produtividade por pessoa chega a quem não devia | REFUTADA | o VIEWER vê nome e ID na produtividade, como a matriz de autorização permite; a minimização para o VIEWER é decisão de privacidade | — |
| H30 | preferência do painel aceita corpo inválido | REFUTADA | 13 itens, duplicado, não aprovado, vazio, versão errada e campo extra: 400; `__proto__` descartado em silêncio (S202-F06, já no backlog) | — |
| H31 | exportação do titular incompleta | CONFIRMADA | 22 de 43 relações do `User` fora; na exportação real faltaram movimentação, histórico e revisão feitos pelo titular | CF-59 |
| H32 | anonimização não alcança tabelas novas | REFUTADA | nome, e-mail e username somem das 165 colunas de texto (teste novo) | — |
| H33 | lacunas de retenção | CONFIRMADA | depois das limpezas: token de reativação, pedido de troca de e-mail, execução e conta desativada de 2024 continuam | CF-60 |
| H34 | exclusão definitiva falha ou deixa órfão | REFUTADA | 28 tabelas com dado (26 pelo `projectId` e 2 pelo `taskId`), nenhuma linha depois (teste novo) | — |
| H35 | contrato, rotas e frontend divergem | CONFIRMADA | 4 rotas sem contrato; 2 rotas que sempre respondem 409, com função morta no frontend; limitador em rota inexistente | CF-68 |
| H36 | código emitido fora do catálogo, do contrato ou do frontend | CONFIRMADA | 12 fora do catálogo (9 também fora do contrato); 41 do catálogo sem contrato; `SESSION_*` tratados e nunca emitidos | CF-64 |
| H37 | documentos se contradizem | CONFIRMADA | K7, K14 e K16 (Fases 2 e 3) | CF-40, CF-47 |
| H38 | telas da Sprint 2 falham em algum estado | REFUTADA | 3 telas × carregando, vazio, 500, 403, 404, 409, 429 e 503 sem quebra, com alerta e nova tentativa; "Limpar filtros" único com filtro ativo (teste novo) | — |
| H39 | classes CSS sem definição | CONFIRMADA | 31 classes usadas no JSX sem regra em nenhuma folha de estilo | CF-69 |
| H40 | nomes acessíveis repetidos e alvos pequenos | REFUTADA | listas de alertas e notificações com 3 itens, sem nome repetido; alvo e foco ficam para o percurso manual | — |
| H41 | regra crítica sem teste | CONFIRMADA | M08 e M12 sobreviveram (seção 7.3) | CF-65 |

### 7.3 Mutantes

Cada mutante foi aplicado sozinho, com a suíte do módulo e, para os sobreviventes, com todos os
arquivos de teste que tocam o ponto mutado. O `backend/src` foi conferido limpo depois de cada um.

| Mutante | Onde | Alteração | Resultado | Teste que derrubou |
|---|---|---|---|---|
| M01 | `authorization.service.js` | retirar `/tasks/:id` do escopo de projeto | morto (6 falhas) | "aplica VIEWER+ às perspectivas e MEMBER+ ao vínculo atômico da E10" |
| M02 | `csrf.middleware.js` | aceitar `PATCH` sem token | morto na 2ª rodada (3 falhas em 27 arquivos) | "EV-Z-04 PATCH e read-all sem CSRF respondem 403 e não mudam o aviso do GitHub" |
| M03 | `auth.service.js` | não conferir `sessionVersion` | morto (1 falha) | "does not mint a valid post-reset session from a login verified before reset" |
| M04 | `redaction.js` | retirar a chave `email` | morto (1 falha) | "produz JSON estruturado e sanitiza erro externo" |
| M05 | chave de deduplicação da mudança de status | valor aleatório | morto (6 falhas) | "NT-S-04 A→B→C→A gera três notificações com origem, destino e chave exatos" |
| M06 | corte do vencimento | um dia antes | morto (6 falhas) | "M2 RF59: cobertura de 100% sobre os elegíveis, com uma exclusão de cada motivo" |
| M07 | período dos indicadores | fim sem o último dia | morto (6 falhas) | "entrega GENERAL padrão sem período, com estado e filtros honestos" |
| M08 | corte da execução vencida | `>=` trocado por `>` | **sobreviveu** (69 testes em 4 arquivos) | — |
| M09 | `lockActiveProject` | ignorar `deletedAt` | morto (5 falhas) | "não regenera access code depois do delete, mesmo com leitura ativa anterior" |
| M10 | exportação do titular | omitir as notificações | morto na 2ª rodada (9 falhas em 10 arquivos) | "EV-D-01 exportação: campos do GitHub só nos tipos novos e ocultas com visible false" |
| M11 | `isProjectWriteBusy` | não reconhecer `P2010`/3572 | morto (8 falhas) | "heartbeat returns promptly while another authenticated project remains operational" |
| M12 | webhook | aceitar entrega sem o cabeçalho de assinatura | **sobreviveu** (37 testes em 3 arquivos) | — |

### 7.4 Verificações automatizadas novas (⚑1)

| Arquivo | O que trava |
|---|---|
| `backend/test/conformance/autorizacao-varredura.test.js` | H09 com ID plano, gerada do roteador: anônimo 401 em toda rota autenticada, não membro 404 opaco em toda rota de projeto, VIEWER 403 nas escritas (salvo as três da matriz), MEMBER e MANAGER 403 nas rotas de papel maior, autoria de comentário e de sessão de tempo, restaurar e excluir em definitivo só pelo OWNER |
| `backend/test/conformance/vinculos-e-recursos-pessoais.test.js` | H10 e H11 |
| `backend/test/conformance/privacidade-ciclo-de-vida.test.js` | H32 (varredura do banco depois da anonimização) e H34 (exclusão definitiva sem órfão) |
| `backend/test/conformance/sincronizacao-exclusao.test.js` | H23 |
| `backend/test/conformance/indicadores-painel.test.js` | H27 |
| `frontend/test/conformance/estados-sprint2.test.jsx` | H38 |

A variante codificada da H09 e as demais confirmações ficam como reprodução: entram na suíte quando o
defeito for corrigido.

### 7.5 Achados da Parte D

Cada achado tem um item `CONF-Fnn` de mesmo número no backlog (Fase 5).

### [ALTA] CF-51 — Autorização entre projetos furada por ID codificado no caminho

- Onde: `backend/src/middlewares/auth/project-authorization.middleware.js:8,16-18`; `backend/src/modules/authorization/authorization.service.js:14-65`
- Norma: ASVS V8.2.1, V8.2.2 e V8.3.1 (L1), V8.4.1 e V1.1.1 (L2); §13.5 do anexo de arquitetura (ARQ-22); critérios de bloqueio no backend do S1-01 e do S1-03
- Esperado: rota de projeto negada a quem não é membro, e escrita restrita ao papel exigido, qualquer que seja a forma do caminho
- Observado:
  - o middleware testa `req.path`, ainda codificado, contra `^/projects/\d+`;
  - com `%39%38…` no lugar de `98…`, a rota não é reconhecida como de projeto e passa sem checar membership nem papel, enquanto o Express decodifica o parâmetro para o controller;
  - na varredura das 143 rotas de projeto com o ID codificado, um não membro obteve 200 em 53 leituras (projeto, código de acesso, convites com e-mail, tarefas, comentários, requisitos, sprints, marcos, commits, PRs, issues, indicadores, rastreabilidade, Kanban e alertas);
  - o mesmo não membro obteve 2xx em 17 escritas: renomear o projeto, regenerar o código de acesso, remover e reativar membro, revogar convite, editar requisito e tarefa, excluir tarefa, sprint e marco, desfazer vínculos e confirmar sugestão;
  - um VIEWER fez as mesmas 18 escritas, inclusive as exclusivas de OWNER;
  - o desvio ainda leva a dois 500: o canal SSE do projeto e a exclusão de requisito;
  - resistiram os módulos que reconferem a autorização no serviço: casos de teste, execuções, evidências, defeitos, a lista de membros e a auditoria do projeto.
- Reprodução: com a sessão de um não membro, `GET /api/projects/<id codificado>` responde 200 com o projeto; `PUT /api/projects/<id codificado>` com `{name}` responde 200 e o nome muda no banco
- Consequência: qualquer conta autenticada lê e altera projetos alheios conhecendo o ID; com o código de acesso lido, entra no projeto como MEMBER
- Origem: `bf53d1c` (`main`, 20/08/2026), mantido nas entregas seguintes
- Proposta: decidir o escopo sobre o parâmetro já decodificado (autorização por rota, depois do roteamento) ou normalizar o caminho antes da regex; recusar ID não canônico; reconferir membership nos serviços que confiam só no middleware; incluir a variante codificada em `autorizacao-varredura.test.js`

### [ALTA] CF-52 — Sincronização presa para sempre com o GitHub mudo

- Onde: `backend/src/modules/github/github.client.js:34-38`; `backend/src/modules/github/services/github-sync-run.service.js:146-169`
- Norma: ASVS V16.5.2; ARQ-07; ADR-017 (lease e heartbeat)
- Esperado: a chamada ao GitHub falha no `GITHUB_REQUEST_TIMEOUT_MS`, e a execução termina ou expira
- Observado:
  - com o timeout em 1 s, a requisição a um servidor que aceita a conexão e não responde seguia pendente aos 6 s;
  - numa sincronização real, a execução continuava `RUNNING` aos 25 s, e o heartbeat avançou 20 s sozinho;
  - um novo pedido respondeu 202 "Já existe uma sincronização GitHub em andamento.".
- Reprodução: cliente real com o Octokit apontado para um servidor local mudo; lease de 60 s
- Consequência: a sincronização do projeto fica presa até reiniciar o processo; no worker, o slot fica ocupado
- Origem: K11 (`@octokit/request` 9.2.4, sem timeout efetivo; CF-08) somado ao heartbeat independente do progresso (PR #24, `main`)
- Proposta: `AbortSignal.timeout` por requisição (o `@octokit/request` 9 repassa `signal`); prazo total por execução; heartbeat condicionado a progresso

### [MÉDIA] CF-53 — Pedido de sincronização preso cerca de 50 s, sem código, e auditoria perdida com o projeto ocupado

- Onde: `backend/src/modules/github/github.controller.js:12-19,36-45`; `backend/src/modules/github/github-sync-run.repository.js:38-45`; `backend/src/database/transaction-guard.js:102`; `docs/architecture/ADR-019-ESPERA-DE-TRAVA.md:99-100`
- Norma: ADR-019 (espera de trava limitada); §12.3 do anexo de arquitetura; ASVS V16.3.3
- Esperado: resposta rápida com `code` e `Retry-After`, como nas demais escritas, e auditoria registrada
- Observado:
  - com o `Project` travado por outra transação, `POST /github/sync` respondeu 503 depois de 52,7 s, com corpo só `{message}`, sem `code`, `requestId` nem `Retry-After`;
  - a auditoria `GITHUB_SYNC_REQUESTED`, gravada antes do serviço e fora da transação guardada, esperou 50,3 s (o padrão do MySQL) e falhou;
  - a auditoria `GITHUB_SYNC_FAILED` esperou 2,0 s e também falhou;
  - as demais escritas do projeto travado responderam 409 `RESOURCE_BUSY` com `Retry-After: 2` em 2 a 5 s;
  - o ADR-019 diz que instruções fora de transação herdam "no máximo 5 s", mas uma conexão do pool que nunca passou por transação guardada espera 50 s.
- Reprodução: trava no `Project` por outra transação e `POST /api/projects/:projectId/github/sync`
- Consequência: o pedido trava quase um minuto, o cliente recebe erro sem código e os dois registros de auditoria somem
- Origem: auditoria no controller (`main`); limite por sessão do ADR-019 (`joao-dev-v2`)
- Proposta: gravar a auditoria depois do serviço, ou em transação com limite; fixar `innodb_lock_wait_timeout` na abertura de toda conexão do pool; expor `code` e `Retry-After` no 503; corrigir a consequência descrita no ADR-019

### [MÉDIA] CF-54 — Falha gravada pelo cliente de recuperação não reagenda

- Onde: `backend/src/modules/github/github-sync-run.repository.js:276-278`, contra o reagendamento em `:87-117`
- Norma: ADR-017 (agenda com espera crescente depois de falha)
- Esperado: toda falha conta em `consecutiveSyncFailures` e adia o `nextSyncAt`
- Observado: pelo caminho normal, a falha deixa `consecutiveSyncFailures` em 1 e o `nextSyncAt` cerca de uma hora depois; pelo cliente de recuperação, a contagem fica em 0, o `nextSyncAt` fica nulo e o projeto sai como vencido para o agendador
- Reprodução: falha do `fail` principal forçada com `P1001`, numa sincronização que falha no GitHub
- Consequência: com o banco oscilando, o agendador repete o projeto a cada ciclo, sem espera
- Origem: correção S203-A01 (`b41727a`, `joao-dev-v2`)
- Proposta: `failOnRecoveryConnection` também reagenda, com a mesma regra do caminho normal

### [MÉDIA] CF-55 — Repositório vazio ou branch padrão sem SHA derruba a sincronização inteira

- Onde: `backend/src/modules/github/services/sync-project-branches.service.js:25-30`; `backend/src/modules/github/services/sync-project-commits.service.js:135-136`; ordem das etapas em `backend/src/modules/github/services/sync-project-github.service.js:124-177`
- Norma: RF03 a RF05; UC04
- Esperado: PRs e issues sincronizadas mesmo sem commits
- Observado: repositório sem branches termina `FAILED` com `VALIDATION_ERROR` ("O GitHub não retornou branches acessíveis para o repositório."); branch padrão sem SHA termina `FAILED` com o genérico `EXTERNAL_SERVICE_ERROR`; nos dois casos, nenhuma PR e nenhuma issue foi gravada
- Reprodução: dublê do GitHub com lista de branches vazia, e com a branch `main` sem SHA
- Consequência: um repositório recém-criado, com issues abertas antes do primeiro push, não sincroniza nada
- Origem: `902fe42` (`main`)
- Proposta: tratar a ausência de branches como etapa de commits vazia e seguir com PRs e issues; mensagem própria para a branch sem SHA

### [MÉDIA] CF-56 — Vínculo enviado duas vezes ao mesmo tempo responde 500

- Onde: `POST /api/tasks/:id/commits` e `POST /api/tasks/:id/issues` (`backend/src/modules/tasks/task.controller.js`)
- Norma: roadmap S1-01 (submissão duplicada); §13.10 do anexo de arquitetura (erro controlado)
- Esperado: a segunda requisição recebe 409 ou o mesmo 201, nunca 500
- Observado: em 10 de 10 rodadas, para commit e para issue, uma resposta foi 201 e a outra 500 ("Erro interno ao vincular commit à tarefa."); o banco não duplicou o vínculo, porque a chave única segurou
- Reprodução: duas requisições idênticas e simultâneas
- Consequência: o clique duplo mostra erro interno, embora o vínculo tenha sido criado
- Origem: `23d34a8` (`main`)
- Proposta: tratar a violação da chave única (`P2002`) como vínculo já existente

### [MÉDIA] CF-57 — Burndown da sprint em dias UTC, contra o dia civil dos indicadores e do vencimento

- Onde: `backend/src/modules/sprints/sprint.burndown.calculator.js:7-12,22-31`
- Norma: roadmap S1-04 ("fusos testados"); decisão D14 do catálogo de indicadores; `docs/data/TASK_NOTIFICATIONS.md` (corte no fuso do produto)
- Esperado: o mesmo dia civil nas três contas de tempo do produto
- Observado: uma conclusão às 22h30 de 14/10 em São Paulo (01h30 UTC de 15/10) conta no dia 14 para o período do indicador e para o vencimento, e no dia 15 para o burndown; a sprint que termina à meia-noite local ganha um dia "19/10" no fim do gráfico
- Reprodução: as três funções puras com a mesma conclusão
- Consequência: burndown e indicadores do mesmo dia discordam para quem conclui à noite
- Origem: S1-04 (`f3fc475`, `joao-dev-v2`)
- Proposta: agrupar os dias do burndown no fuso do produto (`APP_TIMEZONE`)

### [MÉDIA] CF-58 — Aviso de período não aplicado some no painel

- Onde: `backend/src/modules/indicators/dashboard.service.js:310-315`; `frontend/src/features/indicators/DashboardPanel.jsx:69`
- Norma: roadmap S2-05, critério do filtro de período; RF56
- Esperado: o painel avisa quando a visão ignora o período escolhido
- Observado: sem `includeProjectHealth`, as visões PLANNING, TASK e TRACEABILITY devolvem `PERIOD_FILTER_NOT_APPLIED_TO_VIEW`; com `includeProjectHealth=true`, que o painel sempre envia, o aviso some nas três
- Reprodução: a mesma consulta com e sem `includeProjectHealth`
- Consequência: quem escolhe um período nessas visões lê números atuais achando que estão filtrados
- Origem: indicadores P7 e P8 (`main`)
- Proposta: calcular o aviso só sobre os indicadores da visão, sem a saúde do projeto

### [MÉDIA] CF-59 — Exportação do titular sem as ações em que ele é ator

- Onde: `backend/src/modules/settings/settings.repository.js:429` (seleção da exportação); `docs/privacy/PERSONAL_DATA_INVENTORY.md`
- Norma: LGPD, art. 18 (acesso aos dados); §14 do anexo de arquitetura
- Esperado: a exportação cobre todo dado pessoal do titular, ou o inventário declara cada exclusão e o motivo
- Observado:
  - 22 das 43 relações do `User` ficam fora da exportação;
  - parte é deliberada: tokens e segredos, e a dispensa de alerta, declarada no inventário;
  - as ações do titular como ator ficam fora sem declaração;
  - numa exportação real faltaram a movimentação de tarefa feita por ele, a entrada de histórico em que ele é ator e a sugestão de commit que ele revisou.
- Reprodução: o titular move tarefa, revisa sugestão e lança tempo; a exportação é procurada pelos IDs desses registros
- Consequência: o titular não recebe o rastro das próprias ações
- Origem: L2 e entregas seguintes (`main`)
- Proposta: incluir movimentações, históricos, versões e revisões feitas pelo titular, ou declarar no inventário cada exclusão

### [MÉDIA] CF-60 — Retenção não alcança tokens de reativação, pedidos de troca de e-mail, execuções e contas desativadas

- Onde: `backend/src/shared/maintenance/auth-cleanup.js`; `backend/src/shared/maintenance/privacy-retention.js`; `backend/src/config/env.js:549-553`
- Norma: §14 do anexo de arquitetura; `docs/privacy/DATA_RETENTION_POLICY.md`
- Esperado: todo dado pessoal com prazo é descartado pelos jobs
- Observado: depois das duas limpezas em modo de aplicação, continuaram o token de reativação vencido em 2024, o pedido de troca de e-mail vencido em 2024 (com os dois e-mails), a execução de sincronização de 2024 e a conta desativada desde 2024; `DEACTIVATED_ACCOUNT_RETENTION_DAYS` não tem efeito
- Reprodução: registros de 2024 e as funções `cleanupAuthRecords` e `runPrivacyRetention` com `apply: true`
- Consequência: dado pessoal guardado além do prazo, e conta desativada que nunca é tratada
- Origem: E6 e E7 (`main`); execuções da PR #24
- Proposta: incluir os dois tipos de token na limpeza de autenticação; ligar a retenção de conta desativada; decidir o prazo do SyncRun (CF-46)

### [MÉDIA] CF-61 — Conta revelada pelo tempo do login e da recuperação

- Onde: `backend/src/modules/auth/auth.service.js:134` (login sem Argon2 para conta inexistente) e `:182-191` (recuperação)
- Norma: §13.3 do anexo de arquitetura (sem enumeração); roadmap S1-02
- Esperado: o mesmo tempo para conta existente e inexistente
- Observado: mediana de 20 rodadas: login com conta existente e senha errada em 35,9 ms, com conta inexistente em 4,4 ms; recuperação em 7,9 ms contra 4,4 ms
- Reprodução: 20 tentativas de cada caso, com os limitadores altos
- Consequência: dá para descobrir se um e-mail ou username tem conta medindo a resposta
- Origem: E6 e L1 (`main`)
- Proposta: verificar uma senha fictícia de mesmo custo quando a conta não existe; tirar o envio da recuperação do caminho da resposta

### [MÉDIA] CF-62 — As duas trocas de senha divergem, contra o ADR-002

- Onde: `backend/src/modules/auth/auth.repository.js:20-38` e `backend/src/modules/auth/auth.controller.js:112`, contra `backend/src/modules/settings/settings.repository.js:179-202`; `docs/architecture/ADR-002-AUTHENTICATION-SESSION.md:22`; `docs/api/API_CONTRACTS.md:132`
- Norma: ADR-002 ("Troca de senha preserva a sessão atual e revoga as demais")
- Esperado: as duas rotas seguem a política do ADR
- Observado: `POST /api/auth/change-password` derruba também a sessão atual (401 logo depois da troca); `POST /api/settings/security/password` preserva a atual; o contrato descreve a primeira, e o ADR, a segunda; a tela usa só a segunda, e `authApi.changePassword` não tem chamador
- Reprodução: a mesma troca pelas duas rotas, com uma segunda sessão aberta
- Consequência: duas políticas para a mesma operação, com documentos que se contradizem
- Origem: E6 (`auth`) e L2 (`settings`), `main`
- Proposta: aposentar `POST /api/auth/change-password` ou alinhar as duas à política do ADR

### [MÉDIA] CF-63 — Links dos e-mails com `localhost` como padrão, inclusive em produção

- Onde: `backend/src/config/env.js:210-230` (cinco URLs) e `:19-28` (`parseUrl` sem exigir `https`)
- Norma: §13.8 do anexo de arquitetura (configuração validada na inicialização)
- Esperado: links derivados do endereço do frontend e, em produção, só `https`
- Observado: redefinição de senha, convite, verificação de e-mail, troca de e-mail e reativação têm `http://localhost:5173/...` como padrão também com `NODE_ENV=production`; no ambiente de teste, o link de troca de e-mail saiu com `localhost:5173`, enquanto o de redefinição usou o endereço configurado
- Reprodução: troca de e-mail e recuperação com o `.env.test`, que define só duas das cinco URLs
- Consequência: uma variável esquecida em produção manda e-mail com link para `localhost`, e o fluxo quebra
- Origem: E6, L1 e L2 (`main`)
- Proposta: derivar os links do `FRONTEND_URL` e, em produção, exigir `https` e recusar `localhost`

### [MÉDIA] CF-64 — Catálogo de códigos de erro incompleto

- Onde: `backend/src/shared/errors/error-codes.js`; `docs/api/API_CONTRACTS.md`; `frontend/src/api/http-client.js:7-8`
- Norma: §12.3 do anexo de arquitetura; ARQ-16
- Esperado: todo código emitido no catálogo, no contrato e, quando o usuário o vê, no frontend
- Observado: 12 códigos emitidos fora de `ERROR_CODES`, 9 deles também fora do contrato; 41 códigos do catálogo sem menção no contrato; o frontend trata `SESSION_EXPIRED` e `SESSION_INVALID`, que o backend nunca emite; os 503 de ocupação nem chegam com código ao cliente (CF-53)
- Reprodução: varredura dos padrões `code: 'X'` e `Error(…, status, 'X')` no backend, cruzada com o catálogo, o contrato e o frontend; outras formas de emissão ficam fora da varredura
- Consequência: o cliente não tem como reagir de forma específica a parte dos erros
- Origem: várias entregas
- Proposta: catálogo único, com teste que cruze backend, contrato e frontend

### [MÉDIA] CF-65 — Regras críticas sem teste: corte da execução vencida e webhook sem assinatura

- Onde: `backend/src/modules/github/github-sync-run.repository.js:290`; `backend/src/modules/github/github-app.service.js:534`
- Norma: §15.4 do anexo de arquitetura
- Esperado: todo mutante de regra crítica derruba algum teste
- Observado: M08 (`>=` trocado por `>` no corte da execução vencida) passou nos 69 testes dos 4 arquivos que tocam o corte; M12 (webhook aceito sem o cabeçalho de assinatura) passou nos 37 testes dos 3 arquivos que tocam o webhook
- Reprodução: aplicar cada mutante e rodar os arquivos citados (seção 7.3)
- Consequência: uma regressão na verificação de assinatura do webhook passaria pela CI
- Origem: PR #24 e L1 (`main`)
- Proposta: teste do webhook sem cabeçalho de assinatura (esperando 401) e teste da fronteira exata do corte

### [BAIXA] CF-66 — Perda do lease pula os ganchos, e o atraso não está declarado

- Onde: `backend/src/modules/github/services/github-sync-run.service.js:196` e `:225`
- Norma: ADR-018 e critério C5 do S2-03 (sem perda)
- Esperado: atraso declarado, ou ganchos rodados também na execução perdida
- Observado: com o lease perdido no meio da página, o evento `PULL_REQUEST_MERGED` ficou `PENDING` e nenhuma notificação saiu; o job, rodado depois, despachou (nada se perdeu); a documentação não diz que a perda do lease adia alertas e notificações até o job, que não tem agendador, ou até a próxima sincronização
- Reprodução: lease expirado durante a página de PRs, com o evento já gravado
- Consequência: avisos e alertas atrasam sem prazo enquanto o job não tiver agendador
- Origem: PR #24 (`main`) e S2-03 (`joao-dev-v2`)
- Proposta: declarar o atraso em `docs/data/GITHUB_EVENT_NOTIFICATIONS.md` e em `docs/data/TRACEABILITY_ALERTS.md`, ou rodar os ganchos também quando o lease se perde

### [BAIXA] CF-67 — Reabertura de PR conta como retrabalho e não notifica, sem documentação cruzada

- Onde: `docs/indicators/S2_INDICATOR_CATALOG.md` (D10); `docs/architecture/ADR-018-GITHUB-EVENT-NOTIFICATIONS.md` (D18)
- Norma: RF18 e RF61
- Esperado: os dois documentos registram a diferença
- Observado: os dois comportamentos têm teste, mas nenhum dos dois documentos cita o outro
- Reprodução: busca de RF18 nos documentos do S2-03 e de RF61 no catálogo de indicadores
- Consequência: quem vê o retrabalho subir não sabe por que não recebeu aviso
- Origem: indicadores (`main`) e S2-03 (`joao-dev-v2`)
- Proposta: uma frase em cada documento

### [BAIXA] CF-68 — Rotas sem contrato e rotas que sempre respondem 409

- Onde: `docs/api/API_CONTRACTS.md`; `frontend/src/features/requirements/api/requirements.api.js:20-41`
- Norma: §12 do anexo de arquitetura
- Esperado: toda rota no contrato, e nenhuma função do frontend para rota que sempre recusa
- Observado: `GET` e `DELETE /api/settings/integrations/github-identity`, `POST /api/settings/integrations/github-identity/link/start` e `POST /api/settings/security/password/initialize` não aparecem no contrato; `PATCH /api/requirements/:id/status` e `/confirm-completion` respondem sempre 409 `REQUIREMENT_STATUS_DERIVED` e ainda têm funções no frontend, sem uso; o limitador em rota inexistente segue na CF-35
- Reprodução: rotas do roteador cruzadas com o contrato e com as chamadas do frontend
- Consequência: superfície da API sem documentação e código morto
- Origem: L1, L2 e S1-09 (`main`)
- Proposta: documentar as quatro rotas; aposentar as duas rotas de status do requisito e as funções do frontend

### [BAIXA] CF-69 — Classes CSS usadas sem definição

- Onde: 31 classes em `frontend/src`, por exemplo `tc-step-result--fail` (`frontend/src/features/defects/components/DefectDetails.jsx`), `indicator-card__value--scope` (`IndicatorCard.jsx`), `schedule-layout--matched-heights` (`ScheduleCalendar.jsx`) e `notification-card__title` (`NotificationCard.jsx`)
- Norma: §3 do anexo de arquitetura (código sem sobra)
- Esperado: toda classe usada com regra, ou removida
- Observado: 33 classes literais do JSX sem regra em nenhuma folha de estilo; duas (`nodrag` e `nopan`) são classes de comportamento do React Flow, e as outras 31 não têm efeito, entre elas `page`, `spinner` e `kanban-task__effort--running`
- Reprodução: classes literais de `className`, inclusive as de template string, cruzadas com os seletores de todas as folhas de estilo de `frontend/src`; classes montadas por interpolação ficam fora da varredura
- Consequência: estilos esperados que não se aplicam, como o destaque do passo com falha
- Origem: várias entregas
- Proposta: definir ou remover cada classe

### 7.6 Observações sem achado

- **H29:** o VIEWER vê a produtividade por pessoa (nome e ID), como a matriz de autorização permite. Se
  ele deve ver isso é decisão de minimização de dados.
- **H05:** sem agendador para o job, uma rajada acima de 100 eventos por sincronização escoa em lotes de
  100.
- **H34:** a exclusão definitiva também apaga os eventos de auditoria do projeto. Se isso é intencional,
  o ADR-014 deve dizer.

## 8. Consolidação

### 8.1 Números por referência

| Referência | Universo | Positivo | Parcial | Negativo | Não verificável | Não aplicável ou não iniciado | Conformidade sobre os aplicáveis verificáveis |
|---|---:|---:|---:|---:|---:|---:|---:|
| ASVS 5.0.0, L1 | 70 | 37 | 5 | 9 | 4 | 15 | 37 de 51 (72,5%) |
| ASVS 5.0.0, L1+L2 | 253 | 98 | 36 | 25 | 18 | 76 | 98 de 159 (61,6%) |
| Anexo de arquitetura (ARQ-01 a ARQ-36) | 36 | 11 | — | 22 | 3 | — | 11 de 33 (33,3%) |
| Roadmap, critérios de aceite | 141 | 54 | 25 | 1 | — | 61 | 54 de 80 (67,5%) |
| Roadmap, DoD (14 cartões × 10 itens) | 140 | 39 | 76 | 25 | — | — | 39 de 140 (27,9%) |
| Parte D, hipóteses de defeito | 41 | 16 refutadas | — | 25 confirmadas | — | — | — |
| Parte D, mutantes | 12 | 10 mortos | — | 2 vivos | — | — | 10 de 12 (83,3%) |

- **Roadmap:** "positivo" é `EVIDENCIADO`; "negativo" soma `AUSENTE` e, no DoD, os 22 itens `SÓ DOCUMENTADO`.
  Os 61 critérios não iniciados são do S2-06 ao S3-05.
- **Parte D:** a coluna "positivo" conta o que se sustentou. Hipótese refutada é defeito que não existe;
  mutante morto é regra coberta por teste.

**Achados por parte e severidade:**

| Parte | ALTA | MÉDIA | BAIXA | Total |
|---|---:|---:|---:|---:|
| A — ASVS (CF-01 a CF-24) | 5 | 15 | 4 | 24 |
| B — arquitetura (CF-25 a CF-40) | 0 | 15 | 1 | 16 |
| C — roadmap (CF-41 a CF-50) | 1 | 8 | 1 | 10 |
| D — erros e inconsistências (CF-51 a CF-69) | 2 | 13 | 4 | 19 |
| gates da Fase 5 (CF-70) | 0 | 0 | 1 | 1 |
| **Total** | **8** | **51** | **11** | **70** |

Cada achado tem um item de mesmo número em `docs/issues/TECHNICAL_BACKLOG.md` (`CONF-F01` a `CONF-F70`).

### 8.2 Veredito

No commit verificado, o TraceFlow:
- **não atende ao ASVS 5.0.0 L1:** 9 requisitos não atendidos e 5 parciais;
- **não atinge a meta L2 da §13.1 do anexo:** 25 requisitos não atendidos e 36 parciais;
- **viola 22 das 33 regras verificáveis do anexo de arquitetura;**
- **não tem Sprint 1 nem Sprint 2 concluída pelo roadmap:** faltam E2E, homologação externa, os RFs
  parciais e coerência documental.

**Prioridade imediata:**
- **CF-51:** qualquer conta autenticada lê e altera projetos alheios com o ID codificado no caminho. Bloqueia
  qualquer implantação.
- **CF-52:** com o GitHub mudo, a sincronização fica presa até reiniciar o processo.

Os outros seis achados ALTA são requisitos L1 do ASVS (CF-01, CF-02, CF-03, CF-06 e CF-07) e um critério de
cartão marcado como concluído e não atendido (CF-41).

**O que se sustentou sob ataque:**
- com ID plano, a autorização se sustenta em toda rota de projeto gerada do roteador: anônimo, não membro e cada papel só alcançam o que a matriz permite;
- vínculos não aceitam ID de outro projeto no corpo;
- notificações, sessões, preferências e convites não vazam entre contas;
- a anonimização limpa todas as 165 colunas de texto, e a exclusão definitiva não deixa órfão em 28 tabelas;
- a sincronização para quando o projeto é excluído no meio;
- o painel concorda com os endpoints em 52 valores;
- escrita sob trava longa responde 409 com `Retry-After`;
- as telas da Sprint 2 tratam todos os estados de erro;
- o horário de verão não quebra as bordas de período.

### 8.3 Gates da Fase 5

Rodados em 14/10/2026, em sequência, no commit `b3a9b1b`, com o `backend/.env.test`.

| Gate | 1ª rodada | 2ª rodada |
|---|---|---|
| backend `lint`, `format:check` e `architecture:check` | verdes | verdes |
| backend `security:secrets` | verde (684 arquivos) | verde (684 arquivos) |
| backend `npm test` | 2853 passaram, 2 falharam e 5 foram pulados, em 213 arquivos (635 s) | igual (640 s) |
| backend, conformidade dentro do `npm test` | 9 arquivos e 50 testes verdes | igual |
| backend com cobertura (uma vez) | instruções 93,37%, ramos 88,27%, funções 95,96%, linhas 95,49%, acima dos limites de 85, 70, 85 e 87; as mesmas 2 falhas | — |
| frontend `lint`, `format:check` e `build` | verdes | — |
| frontend, conformidade isolada | 22 de 22 | 22 de 22 |
| frontend, suíte completa com cobertura (uma vez) | 1644 passaram e 23 falharam em 6 arquivos; instruções 86,24%, ramos 81,09%, funções 81,79%, linhas 88,64%, acima dos limites de 50, 45, 40 e 53 | — |
| raiz: `validate-ci`, `check-ui-inventory` e `check-npm-audit` (testes) | 90 de 90 | — |
| raiz: `check-ui-inventory.mjs` | inventário conferido | — |

Todas as falhas são de ambiente (seção 8.4). Fora delas, os gates estão verdes. O `npm test` sai com
código 1 por causa delas.

**Avisos do `vite build`:**
- os dois pacotes acima de 500 kB são o ELK (`elk.bundled`, 1434 kB, e `elk-worker`, 1427 kB), carregados
  sob demanda pelo grafo de rastreabilidade;
- `INEFFECTIVE_DYNAMIC_IMPORT` na página de preferências de notificação, que virou a CF-70;
- `MISSING_NAME_OPTION_FOR_IIFE_EXPORT`, do pacote do worker, sem efeito.

### [BAIXA] CF-70 — Rota de preferências de notificação declarada sob demanda, mas no pacote principal

- Onde: `frontend/src/app/routes/AppRoutes.jsx:80-83` (import dinâmico) e `frontend/src/features/notifications/index.js:6` (exportação estática)
- Norma: §3 do anexo de arquitetura (código sem sobra)
- Esperado: a página carregada com `lazyNamed` fica fora do pacote principal, como as outras rotas
- Observado:
  - o `vite build` avisa `INEFFECTIVE_DYNAMIC_IMPORT`;
  - o índice da feature exporta a página;
  - o `AppShell` e o `AuthenticatedLayout`, que entram no pacote principal, importam esse índice;
  - por isso a página vai para o pacote principal (434 kB), e o import dinâmico não divide nada.
- Reprodução: `cd frontend && npm run build`
- Consequência: o carregamento sob demanda declarado não acontece; o pacote inicial leva uma tela que só abre nas configurações
- Origem: S2-02 (`cf4bf7d`, `joao-dev-v2`)
- Proposta: tirar a página do índice da feature, ou importá-la estaticamente nas rotas

### 8.4 Falhas de ambiente (registro à parte)

Seguem o Anexo A do enunciado. Nenhuma aponta defeito no código verificado.

| Falha | Onde | Causa | Confirmação |
|---|---|---|---|
| `EPERM` ao criar symlink | `backend/test/unit/test-cases/storage.test.js` ("rejects symlink roots, symlink content, traversal and mismatched persisted size") | o Windows exige privilégio para criar symlink | igual nas três rodadas do backend |
| "expected 438 to be 448" | `backend/test/unit/e11-mapping-writer.test.js` | o NTFS não guarda as permissões `0o700` e `0o600` | igual nas três rodadas do backend |
| "Missing fixture … `barrel\index.js`" | `frontend/test/styles/final-targeted-corrections.test.js` ("mantém as dependências do grafo atrás de imports dinâmicos") | o caminho chega com `\` | falha também com o arquivo sozinho |
| 22 falhas, em sua maioria "Test timed out in 5000ms", e as que um teste estourado deixa no seguinte (elemento repetido, `console.error`) | `TraceabilityWorkspace`, `PersonalizedDashboard`, `KanbanPage`, `RequirementsPage` e `TestCases`, só na suíte completa com cobertura | carga da suíte completa no Windows (S201-F06) | cada arquivo passa sozinho: 33 de 33, 35 de 35, 49 de 49, 17 de 17 e 37 de 37 |

### 8.5 O que não pôde ser validado

| Ponto | Motivo | Onde fecha |
|---|---|---|
| TLS de entrada, secret manager, firewall e backups | nuvem não provisionada | S2-08 a S2-10 |
| GitHub App, webhooks e repositório reais | dublês nos testes | homologação com repositório de teste |
| SMTP real | provider `capture` fora de produção | homologação (CF-44) |
| agendador real dos jobs e worker supervisionado | sem nuvem; worker e job em processo separado recusados no ⚑9, por isso a H05 e a H22 rodaram num processo só | S2-09 |
| CI remota | sem push nesta campanha | push pedido pelo João |
| drift do schema, proteção da branch e conteúdo das PRs (ARQ-04, ARQ-31 e ARQ-32) | comandos recusados no ⚑9 | CI da PR e leitura pelo João |
| E2E de navegador | sem infraestrutura (E15-F10, S104-F02) | decisão do João (CF-37) |
| várias instâncias (limitador e SSE em memória) | uma instância local | S2-10 |
| proteção e envio de logs (V16.4.2 e V16.4.3) | dependem do ambiente | S2-10 |
| validação com participantes | fora do escopo de código | S3-01 |
| percurso manual das telas da Sprint 2, alvo de 44 px e foco (H38 e H40) | depende do `migrate deploy` no banco de desenvolvimento do João | seção 8.6 |

### 8.6 Percurso manual com o João (pendente)

O roteiro cobre as telas de alertas, de tarefas sem vínculo técnico e de notificações, com dados mínimos e
em escala. Em cada tela, confere:
- os estados de carregando, vazio, erro, acesso negado, 409, 429 e 503;
- um único "Limpar filtros" com filtro ativo;
- alvo de pelo menos 44 px nos controles;
- o foco depois de dispensar, marcar como lida e limpar filtros.

O percurso depende do `npx prisma migrate deploy` no banco de desenvolvimento do João (o banco ainda não
tem as migrations da `main`). O resultado entra num commit posterior.

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
