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

## Espera de trava no banco

Regra no [ADR-019](../architecture/ADR-019-ESPERA-DE-TRAVA.md). Toda transação interativa espera
uma trava por no máximo 2 s (prazo de 5 s) ou 5 s (prazo de 15 s). Passado o limite, o MySQL
devolve o erro 1205, e a API responde `409 RESOURCE_BUSY`.

1. Evento `database_lock_wait_timeout` (`warn`), com rota e `requestId`.
   - Isolado: contenção normal, e o cliente repete a requisição.
   - Repetido na mesma rota ou no mesmo projeto: alguma transação está segurando a trava por
     tempo demais.
2. Para achar a transação que segura, consulte `performance_schema.data_lock_waits` e
   `information_schema.innodb_trx`. Use o `trx_started` e o `trx_query` da transação mais
   antiga e cruze com o log pelo horário. Não encerre a sessão (`KILL`) sem entender o que ela
   grava.
3. Erro com `causeCode: P2028`: uma transação passou do próprio prazo por trabalho lento
   (instrução demorada ou banco distante). A conexão usada pode ficar dessincronizada por alguns
   segundos (S202-F33). Verifique a latência até o banco e as operações pesadas listadas no
   S202-F30.
4. Não aumente o `innodb_lock_wait_timeout` global para "resolver" 409: o limite por transação o
   substitui, e um valor global maior não muda a regra.

## Transação que passou do prazo

Regra no [ADR-020](../architecture/ADR-020-PRAZO-DAS-TRANSACOES.md). Toda transação interativa tem
um prazo próprio (5 s no padrão, 15 s onde o código pede). Ao vencê-lo, o backend interrompe a
instrução em andamento (`KILL QUERY`), desfaz a transação e responde `503 OPERATION_TIMEOUT`.

1. Evento `database_transaction_deadline` (`warn`), com rota e `requestId`.
   - Isolado: uma operação lenta; o cliente repete a requisição.
   - Repetido na mesma rota: o trabalho não cabe no prazo. Veja o S202-F30 (transações pesadas de
     5 s) e o S203-F22 (página da sincronização com o banco distante), e meça a latência até o
     banco.
2. Evento `database_transaction_expired` (`error`, `causeCode: P2028`): o prazo do Prisma venceu
   assim mesmo, ou faltou conexão livre para iniciar a transação (`maxWait`). Confira o tamanho do
   pool e se o cliente de recuperação conseguiu se conectar.
3. Evento `database_connection_discarded` (`warn`): a conexão da transação expirada foi encerrada
   no servidor. Quem a usar em seguida recebe erro de conexão uma vez, não resposta errada.
4. Evento `database_transaction_kill_failed` (`warn`): o `KILL QUERY` não chegou ao banco. Confira
   se o app e o cliente de recuperação usam o mesmo usuário do banco; sem isso, o `KILL` exige o
   privilégio `CONNECTION_ADMIN`.

## Pânico do motor do banco

Evento `database_engine_panic` (`error`): o motor do Prisma entrou em pânico (por exemplo, "Could
not figure out an ID in create") e pode responder errado até o processo reiniciar.

1. `/health/live` e `/health/ready` passam a responder 503. O orquestrador deve reiniciar o
   processo; sem orquestrador, reinicie o servidor à mão.
2. Procure, logo antes, `database_transaction_expired` ou `database_connection_discarded`: a causa
   mais provável é uma conexão que voltou ao pool fora de sincronia (ADR-020).
3. Não tente recuperar o processo sem reiniciar.

## GitHub indisponível

Não substitua por dados mockados. Preserve último sucesso, comunique indisponibilidade, respeite rate limit e reexecute manualmente após recuperação.

## CI ou regressão em produção

- CI: identifique o check estável, reproduza o comando local equivalente e não masque exit code.
- Produção: interrompa rollout, preserve evidências, volte à versão anterior quando compatível com schema ou aplique roll-forward; valide health, autenticação e fluxo afetado.

Após qualquer incidente, registre causa, impacto, correção, evidências, risco residual e ação preventiva no sistema de issues aprovado pela equipe.
