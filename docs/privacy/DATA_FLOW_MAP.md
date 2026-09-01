# Mapa de fluxo de dados

| Fluxo | Origem → destino | Dados/armazenamento | Acesso/terceiro | Proteção, retenção e risco residual |
|---|---|---|---|---|
| cadastro/login/sessão | navegador → Express → MySQL | nome, username, e-mail, hash, sessão hashada/rememberMe | titular/backend | TLS no proxy, Argon2id, HttpOnly, CSRF; brute force/store distribuído são lacunas operacionais |
| recuperação/verificação | navegador → backend → SMTP | e-mail e token bruto na mensagem; hash no banco | titular/provedor SMTP | resposta uniforme quando aplicável, TTL e uso único; caixa postal é boundary externa |
| convite/membership | OWNER → backend → SMTP/MySQL | e-mail, papel, token hashado | OWNER, convidado, SMTP | token aleatório/TTL/revogação; código legado permanece deprecado |
| tarefa/Kanban | integrante → backend → MySQL | responsável, ator, status e histórico | membros autorizados | RBAC, CSRF e auditoria crítica de membership; texto legado pode identificar |
| login/reautenticação GitHub | navegador ↔ GitHub → callback Express → MySQL | state bruto no redirect; user token só em memória; identidade e timestamps persistidos | titular/GitHub/backend | state hashado/sessão/TTL, GitHub ID correspondente; anonimização mantém só fingerprint HMAC deny-only |
| instalação GitHub App | navegador ↔ GitHub → callback Express → MySQL | state bruto no redirect; user token do install flow só em memória; metadados da Installation e vínculo TraceFlow persistidos | titular/GitHub/backend | state hashado/sessão/TTL; instalação acessível ao ator e confirmada com JWT da App; repositórios via Installation Token |
| GitHub | backend ↔ API GitHub → MySQL | token de instalação só em memória; autoria, conteúdo e URLs de artifacts | GitHub e membros do projeto | host fixo, timeout/retry, DTO mínimo; autoria pode ser ambígua |
| logging/auditoria | middleware/domínio → stdout/MySQL | request ID, ação, IDs e códigos | operadores; titular/OWNER por endpoints | redaction e allowlist; agregador/backups dependem do deploy |
| exportação | titular → backend → ZIP/JSON | dados próprios; projeto/requisito/tarefa/integração somente com membership ativa | somente titular | sessão+CSRF, autorização atual, TTL 15 min, sem URL pública/arquivo persistido ou credencial |
| exclusão/anonimização | titular/job → MySQL | solicitação, conta, credenciais e referências históricas | titular/operador do job | senha ou GitHub recente, carência e transação; último OWNER retorna `ACTIVE` auditado; backup/GitHub externo são riscos residuais |
| backup | MySQL → infraestrutura externa | conjunto persistido | operador/fornecedor não definido | criptografia, acesso, expurgo e teste de restore precisam de decisão de deploy |

Trust boundaries: navegador/reverse proxy, Express, MySQL, GitHub, SMTP, logs e CI/CD. Não existe transferência automática para um sistema jurídico de atendimento.
