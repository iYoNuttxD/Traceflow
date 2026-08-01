# Mapa de fluxo de dados

| Fluxo | Origem → destino | Dados/armazenamento | Acesso/terceiro | Proteção, retenção e risco residual |
|---|---|---|---|---|
| cadastro/login/sessão | navegador → Express → MySQL | nome, username, e-mail, hash, sessão hashada/rememberMe | titular/backend | TLS no proxy, Argon2id, HttpOnly, CSRF; brute force/store distribuído são lacunas operacionais |
| recuperação/verificação | navegador → backend → SMTP | e-mail e token bruto na mensagem; hash no banco | titular/provedor SMTP | resposta uniforme quando aplicável, TTL e uso único; caixa postal é boundary externa |
| convite/membership | OWNER → backend → SMTP/MySQL | e-mail, papel, token hashado | OWNER, convidado, SMTP | token aleatório/TTL/revogação; código legado permanece deprecado |
| tarefa/Kanban | integrante → backend → MySQL | responsável, ator, status e histórico | membros autorizados | RBAC, CSRF e auditoria crítica de membership; texto legado pode identificar |
| instalação GitHub App | navegador ↔ GitHub → callback Express → MySQL | state bruto no redirect; user token só em memória; metadados de instalação persistidos | titular/GitHub/backend | state hashado/sessão/TTL, prova de installation ID; correlação de conta é risco residual |
| GitHub | backend ↔ API GitHub → MySQL | token de instalação só em memória; autoria, conteúdo e URLs de artifacts | GitHub e membros do projeto | host fixo, timeout/retry, DTO mínimo; autoria pode ser ambígua |
| logging/auditoria | middleware/domínio → stdout/MySQL | request ID, ação, IDs e códigos | operadores; titular/OWNER por endpoints | redaction e allowlist; agregador/backups dependem do deploy |
| exportação | titular → backend → resposta JSON | perfil, memberships, atribuições, movimentos, solicitações | somente titular | sessão+CSRF na criação, ID ownership, TTL 15 min, sem URL pública/arquivo persistido |
| exclusão/anonimização | titular/job → MySQL | solicitação, conta e referências | titular/operador do job | senha, carência, último OWNER, transação; backup e GitHub externo são riscos residuais |
| backup | MySQL → infraestrutura externa | conjunto persistido | operador/fornecedor não definido | criptografia, acesso, expurgo e teste de restore precisam de decisão de deploy |

Trust boundaries: navegador/reverse proxy, Express, MySQL, GitHub, SMTP, logs e CI/CD. Não existe transferência automática para um sistema jurídico de atendimento.
