# Política inicial de segredos do TRACEFLOW

## Escopo

Os segredos atuais são a chave privada/client secret/webhook secret da GitHub App, `PRIVACY_PSEUDONYMIZATION_KEY`, as credenciais contidas em `DATABASE_URL`/`TEST_DATABASE_URL` e `SMTP_PASSWORD`. Qualquer futura chave de sessão, JWT, e-mail, cloud ou criptografia entra automaticamente nesta política.

Tokens opacos de sessão, recuperação, verificação, convite e state são segredos efêmeros: valores brutos existem somente no cookie HttpOnly, memória ou entrega/redirect de uso único; o banco guarda SHA-256. Senhas guardam somente Argon2id. User e installation access tokens GitHub existem apenas em memória durante o caso de uso e nunca são persistidos ou logados. PAT sistêmico/por usuário/por projeto não integra o runtime L1 (ADR-009).

## Regras

- segredos existem somente no backend, ambiente de execução ou secret store aprovado;
- `.env`, `.env.local` e `.env.test` permanecem ignorados; exemplos contêm apenas valores artificiais;
- nenhuma variável `VITE_*` pode conter segredo, pois é incorporada ao bundle público;
- segredos não podem aparecer em código, fixture comum, documentação, URL, resposta, log, commit ou artefato de build;
- o acesso deve seguir menor privilégio e ser limitado aos operadores/serviços que precisam do valor;
- produção deve falhar rapidamente quando o conjunto GitHub App/SMTP ou outra configuração crítica estiver ausente;
- o logger registra apenas serviço, status externo, código normalizado e request ID; headers e objetos Octokit completos são proibidos.
- na integração GitHub, somente o credential provider lê private key/client secret; domínio, repositories, frontend e banco não recebem tokens temporários.

## Ciclo de vida

| Segredo | Titular operacional | Escopo mínimo | Rotação inicial | Revogação |
|---|---|---|---|---|
| `GITHUB_APP_PRIVATE_KEY_BASE64` | plataforma | autenticar somente a App TRACEFLOW | política do provedor; rotação ao menos anual | revogar chave no GitHub, cadastrar nova e reiniciar workloads |
| `GITHUB_APP_CLIENT_SECRET` | plataforma | troca controlada do callback de instalação | política do provedor ou a cada 90 dias | gerar novo secret, atualizar secret store e revogar anterior |
| `GITHUB_APP_WEBHOOK_SECRET` | plataforma | validar exclusivamente webhooks da App | a cada 90 dias ou incidente | rotacionar coordenando GitHub e backend |
| `PRIVACY_PSEUDONYMIZATION_KEY` | plataforma/privacidade | HMAC deny-only de identidades GitHub anonimizadas | somente por incidente ou migração planejada | reprocessar fingerprints de forma coordenada antes da troca; perda sem migração rompe comparações anteriores |
| `DATABASE_URL` | administração de dados/plataforma | usuário próprio da aplicação, sem privilégios administrativos | a cada 90 dias ou política corporativa | trocar credencial, revogar usuário antigo e verificar logs/conexões |
| `TEST_DATABASE_URL` | desenvolvimento/CI | banco descartável cujo nome identifica teste | junto do ambiente/runner | destruir ou rotacionar ao comprometer o runner |
| `SMTP_PASSWORD` | plataforma/comunicação | conta limitada ao envio transacional do TRACEFLOW | a cada 90 dias ou política do provedor | revogar credencial e tokens de reset/verificação/convite potencialmente expostos |

Os prazos são baseline técnica e precisam ser alinhados à operação real. A rotação deve suportar período curto de transição, teste de conectividade e revogação do valor anterior.

## Resposta a vazamento

1. revogar/rotacionar o segredo no provedor;
2. interromper integrações comprometidas sem registrar o valor;
3. buscar uso indevido em logs por metadados/request ID;
4. remover o valor do histórico por procedimento aprovado, sem reescrever histórico automaticamente nesta etapa;
5. avaliar alcance, dados afetados e comunicação de incidente;
6. restaurar com credencial de menor privilégio e registrar causa/ação.

## Ferramentas e lacunas

`npm run security:secrets` examina arquivos versionados e não ignorados por padrões de token GitHub, URL MySQL com senha, chave privada, AWS key e JWT secret. O scanner ignora somente exemplos artificiais conhecidos e fixtures controladas; um teste prova a detecção e a E14 tornou sua execução obrigatória na CI. Ele não substitui secret manager, scanner de todo o histórico Git nem resposta operacional a incidentes.

Produção deve migrar os valores para secret manager com auditoria, identidade de workload, rotação e acesso temporário. Essa capacidade permanece como risco operacional registrado no backlog da E15.
