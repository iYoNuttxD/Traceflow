# Runbook — incidentes e segurança

## Princípios

Preserve evidências, minimize acesso, use request IDs e nunca copie segredo, body, cookie, e-mail ou dump para ticket/log não autorizado. Registre horário, ambiente, alcance, responsável e decisões. Este runbook técnico não substitui plano jurídico, comunicação LGPD ou gestão corporativa de incidentes.

## Segredo da GitHub App comprometido

1. Pause instalações, callbacks, webhooks e syncs afetados.
2. Revogue/rotacione private key, client secret ou webhook secret no GitHub conforme o valor afetado.
3. Atualize o secret store e reinicie workloads; nunca mantenha o valor anterior como fallback.
4. Procure abuso por installation/project/delivery/request ID, não pelo segredo ou payload integral.
5. Avalie repositórios alcançáveis e necessidade de comunicação.
6. Valide callback/webhook e um sync controlado após restaurar.

## Segredo ou dado pessoal vazado

1. Revogue/rotacione credenciais e restrinja o artefato.
2. Preserve evidência e identifique commits, logs, CI artifacts, backups e terceiros afetados.
3. Não reescreva histórico ou apague evidência sem procedimento aprovado.
4. Acione controlador/encarregado para avaliar notificação e direitos do titular.
5. Rode secret scan e verifique respostas/logs após a correção.

## Dependência vulnerável

1. Confirme advisory, pacote, cadeia e alcance.
2. Prefira menor versão oficial corrigida e atualize via npm.
3. Não use `npm audit fix --force`, override ou exceção genérica.
4. Rode lint, testes, cobertura, build e política de audit.
5. Exceção temporária exige registro específico, responsável e expiração.

## Falha de autenticação/autorização

1. Preserve logs/request ID e desabilite conta/sessões quando necessário.
2. Verifique 401, CSRF, membership, papel e resolução do projeto.
3. Em suspeita de BOLA/elevação, contenha o endpoint e avalie todos os projetos acessados.
4. Nunca responda revelando a existência de recurso cruzado.

## Migration incorreta

Suspenda deploys, execute o runbook de migrations e use restore/roll-forward. Não use reset, não edite migration aplicada e não descarte dado sem contagem e backup.

## GitHub indisponível

Não substitua por dados mockados. Preserve último sucesso, comunique indisponibilidade, respeite rate limit e reexecute manualmente após recuperação.

## CI ou regressão em produção

- CI: identifique o check estável, reproduza o comando local equivalente e não masque exit code.
- Produção: interrompa rollout, preserve evidências, volte à versão anterior quando compatível com schema ou aplique roll-forward; valide health, autenticação e fluxo afetado.

Após qualquer incidente, registre causa, impacto, correção, evidências, risco residual e ação preventiva no sistema de issues aprovado pela equipe.
