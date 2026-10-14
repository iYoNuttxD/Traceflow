# ADR-020 — Prazo próprio das transações interativas

- **Estado:** aceita (S202-F33)
- **Data:** 13/10/2026
- **Responsáveis:** João Vitor S. Hernandes
- **Relação:** complementa o [ADR-019](ADR-019-ESPERA-DE-TRAVA.md)

## Contexto

O ADR-019 limitou a espera de trava dentro das transações interativas do Prisma, e o `P2028` deixou
de vir de trava. Ele ainda vem de outra causa: uma instrução lenta em andamento quando o prazo da
transação vence (C2-04 do S2-03; S203-F22 com o banco a cerca de 15 ms ou mais; S202-F30).

**Mecanismo no motor do Prisma 6.12.0** (prisma-engines,
`query-engine/core/src/interactive_transactions/transaction.rs`; igual até a 6.19.0):
- cada instrução da transação corre contra um temporizador;
- quando o prazo vence, o motor abandona a instrução em andamento e manda `ROLLBACK` na mesma
  conexão, sem cancelar a instrução no servidor e sem marcar a conexão como quebrada;
- a conexão volta ao pool fora de sincronia: cada comando passa a ler a resposta do anterior.

**Reproduções de 13/10/2026** (detalhe em `docs/issues/S202_F33_PROMPT_CORRECAO_CONEXAO_DESSINCRONIZADA.md`,
Anexo B):
- **Primeira ocorrência, com gravação antes da instrução lenta.** O `update` seguinte de uma linha
  existente responde `P2025`, e a leitura volta `null`. Não há erro: a resposta é errada.
- **Efeito na API.** Um 404 falso ("Projeto não encontrado") ou, se a consulta for a da sessão, um
  401 que desloga a pessoa (S202-R01).
- **Segunda ocorrência no mesmo processo.** O cliente fica envenenado por alguns segundos:
  - `update` com `P2025` falso e leitura `null`;
  - `TypeError` nas consultas cruas;
  - pânico do motor nas inserções ("Could not figure out an ID in create");
  - transações novas que falham em poucos milissegundos.
- **Sem gravação antes.** A pessoa seguinte recebe um `P1017` limpo.

Atualizar o Prisma não resolve agora:
- nenhuma versão 6.x muda o mecanismo;
- a 7.x troca o motor por um adaptador em JS, mas tem um defeito aberto no mesmo ponto (`prisma/orm#29762`:
  instrução que chega depois do `ROLLBACK` é confirmada sozinha);
- a 7.x também muda a forma do `P2010` de que o ADR-019 depende.

## Decisão

1. **Prazo próprio (D1).**
   - O envoltório do cliente compartilhado (`src/database/transaction-guard.js`) arma um
     temporizador para cada transação interativa.
   - Se o callback ainda estiver rodando quando o prazo pedido vencer, o envoltório manda
     `KILL QUERY` na conexão da transação, pelo cliente de recuperação, que tem pool próprio.
   - A instrução em andamento termina com o erro 1317, e a transação é desfeita antes do prazo do
     Prisma, sem instrução abandonada.
2. **Prazo e folga (D2).**
   - O prazo pedido (5 s por padrão; 15 s onde o código pede) é o prazo do envoltório.
   - O Prisma recebe o prazo pedido mais 1 s de folga.
   - Quem termina hoje dentro do prazo pedido continua terminando.
   - `maxWait` e o limite de espera de trava do ADR-019 continuam calculados pelo prazo pedido.
3. **Conexão (D3).**
   - A transação começa pelo `SET SESSION innodb_lock_wait_timeout` do ADR-019 e por
     `SELECT CONNECTION_ID()`, guardado no estado da transação.
   - `KILL QUERY` e `KILL` na própria conexão não pedem privilégio além do usuário do app.
4. **Depois do disparo (D4).**
   - A transação nunca confirma: o envoltório lança `TransactionDeadlineError` (código interno
     `TRANSACTION_DEADLINE`, com o erro original em `cause`), mesmo que o callback termine sem erro.
     `SLEEP` e funções parecidas voltam sem erro quando interrompidas.
   - Enquanto o callback roda, o `KILL QUERY` se repete a cada 100 ms. O temporizador e a
     repetição param no fim do callback, e o envoltório espera os `KILL QUERY` já enviados antes
     de devolver a conexão, para não atingir quem a pegar em seguida.
5. **Resposta HTTP (D5).**
   - `TransactionDeadlineError` e `P2028` (prazo vencido ou `maxWait` esgotado) respondem 503
     `OPERATION_TIMEOUT`, com "A operação demorou mais que o permitido e foi desfeita. Tente de novo
     em instantes." e `Retry-After: 5`.
   - Logs: `database_transaction_deadline` (`warn`) e `database_transaction_expired` (`error`),
     com rota, `requestId` e `causeCode`.
6. **Segunda camada (D6).**
   - Se ainda assim vier um `P2028` de uma transação já iniciada, o envoltório manda `KILL` da
     conexão inteira pelo cliente de recuperação e registra `database_connection_discarded`.
   - Em vez de resposta errada, a pessoa seguinte recebe erro de conexão, e a contaminação não
     escala.
7. **Pânico do motor (D7).** `PrismaClientRustPanicError` registra `database_engine_panic`
   (`error`), e `/health/live` e `/health/ready` passam a responder 503 até o processo reiniciar.
8. **Sincronização GitHub (D8).** `TransactionDeadlineError` é falha de gravação
   (`GITHUB_SYNC_STORAGE_FAILED`), com `causeCode: TRANSACTION_DEADLINE` no log.

## Alternativas consideradas

- **Atualizar para o Prisma 7.10.0 com `@prisma/adapter-mariadb`.** Rejeitada agora, pelos motivos
  do contexto. Reavaliação no S202-F36.
- **`$disconnect()` depois de todo `P2028`.** Rejeitada: limpa a contaminação, mas derruba as
  consultas de outras pessoas em andamento (medido: um `P1017` por desconexão), como o ADR-019 já
  registrou.
- **`max_execution_time` na sessão.** Rejeitada como regra: vale só para `SELECT`, e o `SLEEP`
  cortado volta sem erro, deixando a transação confirmar.
- **Um único `KILL QUERY` no prazo.** Rejeitada: se o callback capturar o 1317 e seguir mandando
  instruções, uma delas pode estar em andamento no prazo do Prisma.
- **Recusar instruções novas com um `Proxy` sobre o cliente da transação.** Rejeitada: frágil diante
  dos proxies internos do Prisma.
- **Variável de sessão no mesmo `SET` e busca no `performance_schema`.** Rejeitada como regra: não
  custa uma ida e volta, mas depende de privilégio de leitura no `performance_schema`, que um usuário
  de privilégio mínimo na nuvem pode não ter.

## Consequências positivas

- Nenhuma instrução fica em andamento quando o prazo do Prisma vence, e a conexão não volta ao pool
  fora de sincronia por trabalho lento.
- A transação lenta falha sozinha, desfeita, com 503 e `Retry-After`. Outras pessoas não recebem
  resposta errada.
- O `P2028` residual descarta a conexão, e o pânico do motor deixa sinal operacional.

## Consequências negativas

- **Custo:** uma instrução a mais por transação interativa (`SELECT CONNECTION_ID()`, 0,26 ms no
  MySQL local), além do `SET` do ADR-019. Com o banco remoto, é uma ida e volta.
- **Mesmo usuário:** o `KILL QUERY` depende de o app e o cliente de recuperação usarem o mesmo
  usuário do banco. Configure assim também na nuvem (S2-08).
- **Prisma fixado:** a versão fica na 6.12.0 enquanto o S202-F36 não for reavaliado.
- **Folga:** com o Prisma em prazo + 1 s, uma transação travada no próprio motor (sem instrução no
  servidor) leva 1 s a mais para expirar.
- **Trabalho lento continua falhando:** o prazo próprio torna a falha limpa, mas não faz o trabalho
  caber no prazo. S202-F30 e S203-F22 seguem abertos.
- **Corrida residual da segunda camada:** entre o `P2028` e o `KILL`, outra requisição pode pegar a
  conexão. Por isso a segunda camada é defesa extra, não a regra.

## Impactos de segurança e privacidade

- ASVS V16.5.2: a lentidão do banco numa operação não atinge as outras requisições.
- V16.5.3: falha fechada; a transação nunca confirma depois do prazo.
- V16.3.4: os eventos registram rota, `requestId` e código, sem dado pessoal.
