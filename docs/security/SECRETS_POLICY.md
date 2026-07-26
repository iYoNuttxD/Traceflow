# Política inicial de segredos do TRACEFLOW

## Escopo

Os segredos atuais são `GITHUB_TOKEN`, as credenciais contidas em `DATABASE_URL`/`TEST_DATABASE_URL` e `SMTP_PASSWORD`. Qualquer futura chave de sessão, JWT, e-mail, cloud ou criptografia entra automaticamente nesta política.

Na E6, tokens opacos de sessão, recuperação e convite são segredos efêmeros: valores brutos existem somente no cookie HttpOnly, memória do cliente ou entrega de uso único; o banco guarda SHA-256. Senhas guardam somente Argon2id. Nenhum desses valores pode ser logado. O PAT GitHub permanece credencial técnica do sistema, não identidade do usuário (ADR-004 e ADR-007).

## Regras

- segredos existem somente no backend, ambiente de execução ou secret store aprovado;
- `.env`, `.env.local` e `.env.test` permanecem ignorados; exemplos contêm apenas valores artificiais;
- nenhuma variável `VITE_*` pode conter segredo, pois é incorporada ao bundle público;
- segredos não podem aparecer em código, fixture comum, documentação, URL, resposta, log, commit ou artefato de build;
- o acesso deve seguir menor privilégio e ser limitado aos operadores/serviços que precisam do valor;
- produção deve falhar rapidamente quando o token GitHub obrigatório ou a configuração crítica estiver ausente;
- o logger registra apenas serviço, status externo, código normalizado e request ID; headers e objetos Octokit completos são proibidos.
- na integração GitHub, somente o provider de credencial lê a configuração e a entrega ao factory do client; domínio, repositories, frontend e banco não recebem o PAT.

## Ciclo de vida

| Segredo | Titular operacional | Escopo mínimo | Rotação inicial | Revogação |
|---|---|---|---|---|
| `GITHUB_TOKEN` | responsável pela integração/plataforma | somente repositórios e leituras necessárias | a cada 90 dias ou política mais restritiva do provedor | imediata após vazamento, desligamento do titular ou mudança de escopo |
| `DATABASE_URL` | administração de dados/plataforma | usuário próprio da aplicação, sem privilégios administrativos | a cada 90 dias ou política corporativa | trocar credencial, revogar usuário antigo e verificar logs/conexões |
| `TEST_DATABASE_URL` | desenvolvimento/CI | banco descartável cujo nome identifica teste | junto do ambiente/runner | destruir ou rotacionar ao comprometer o runner |
| `SMTP_PASSWORD` | plataforma/comunicação | conta limitada ao envio transacional do TRACEFLOW | a cada 90 dias ou política do provedor | revogar credencial e tokens de reset/convite potencialmente expostos |

Os prazos são baseline técnica e precisam ser alinhados à operação real. A rotação deve suportar período curto de transição, teste de conectividade e revogação do valor anterior.

## Resposta a vazamento

1. revogar/rotacionar o segredo no provedor;
2. interromper integrações comprometidas sem registrar o valor;
3. buscar uso indevido em logs por metadados/request ID;
4. remover o valor do histórico por procedimento aprovado, sem reescrever histórico automaticamente nesta etapa;
5. avaliar alcance, dados afetados e comunicação de incidente;
6. restaurar com credencial de menor privilégio e registrar causa/ação.

## Ferramentas e lacunas

`npm run security:secrets` examina arquivos versionados e não ignorados por padrões de token GitHub, URL MySQL com senha, chave privada, AWS key e JWT secret. O scanner ignora exemplos artificiais conhecidos e fixtures de teste; um teste controlado prova a detecção. Ele é uma barreira local, não substitui secret manager, scanner histórico ou integração CI. A obrigatoriedade no CI pertence à E14.

Produção deve migrar os valores para secret manager com auditoria, identidade de workload, rotação e acesso temporário. Essa migração não foi implementada na E5.
