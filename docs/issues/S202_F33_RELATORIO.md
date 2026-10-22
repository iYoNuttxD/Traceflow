# Relatório — S202-F33: conexão dessincronizada depois de `P2028` por trabalho lento

- **Data:** 13/10/2026
- **Enunciado:** [S202_F33_PROMPT_CORRECAO_CONEXAO_DESSINCRONIZADA.md](S202_F33_PROMPT_CORRECAO_CONEXAO_DESSINCRONIZADA.md),
  com os dez pontos ⚑ aprovados pelo João na recomendação.
- **Decisão:** [ADR-020](../architecture/ADR-020-PRAZO-DAS-TRANSACOES.md), complementar ao
  [ADR-019](../architecture/ADR-019-ESPERA-DE-TRAVA.md).
- **Origem:** C2-04 do S2-03 ([S2_03_RELATORIO_TESTES.md](S2_03_RELATORIO_TESTES.md), seção 16) e
  as reproduções do Anexo B do prompt.

## 1. Commits

| Fase | Commit | Conteúdo |
|---|---|---|
| 0 | `dffc2ab` | ADR-020; contrato (`OPERATION_TIMEOUT`, `/health/live`); runbook (prazo e pânico); delta ASVS; S202-F36 no backlog |
| 1 | `d08c0fc` | `src/database/transaction-guard.js` (`guardTransactions`, `TransactionDeadlineError`); `killQuery` e `killConnection` em `recovery-prisma.js`; fábrica `createPrismaClient`; testes F1-01 a F1-07 |
| 2 | `a58a075` | 503 `OPERATION_TIMEOUT`; segunda camada (`KILL` da conexão no `P2028`); `engine-health.js` e saúde em 503 depois de pânico; prazo próprio como falha de gravação na sincronização; C2-04 reescrito; testes F2-01 a F2-05 |
| 3 e 4 | commit de registro | ADR-020 ("Validação"), backlog, delta ASVS e este relatório |

## 2. Antes e depois

| Caso | Antes (sem o prazo próprio) | Depois |
|---|---|---|
| F1-01 consulta pesada depois de gravação, 3 rodadas | `P2028` perto de 7 s; a sonda seguinte recebe `P2025` falso e leitura `null` | `TransactionDeadlineError` (1317 na causa) entre 5,01 e 5,03 s; nada gravado; 4 sondas certas nas 3 rodadas |
| F1-02 gravação pesada, 2 rodadas | `P2028` perto de 7 s | `TransactionDeadlineError` antes de 6 s; nada gravado; sondas certas |
| F1-03 `SLEEP(7)` e gravação depois | `P2028` perto de 7 s | a transação não confirma, mesmo com o `SLEEP` voltando sem erro |
| F1-04 callback que captura o 1317 e continua | `P2028` no `COMMIT` | as duas consultas pesadas interrompidas (1317, 1317); `TransactionDeadlineError` antes de 6 s |
| F2-01 comentário com consulta pesada injetada | A recebe 500 | A recebe 503 `OPERATION_TIMEOUT` com `Retry-After: 5`, sem efeito; B recebe 200 em `/api/notifications/unread-count` e `/api/projects`; repetir depois responde 201 |
| F2-03 `KILL QUERY` indisponível, `P2028` escapa | sonda seguinte com `P2025` falso | a conexão é encerrada no servidor; nenhuma resposta errada (no máximo um erro de conexão); 3 rodadas sem escalada |
| F2-04 (C2-04) página da sincronização com consulta pesada | dependia de `prisma.$disconnect()` no teste para não contaminar o resto | `FAILED` com `GITHUB_SYNC_STORAGE_FAILED` e `causeCode: TRANSACTION_DEADLINE`; leitura e gravação seguintes certas; a próxima sincronização termina `SUCCEEDED` |
| F2-05 pânico do motor numa requisição | `/health/live` seguia 200 | 500 para quem fez a requisição; `/health/live` e `/health/ready` em 503 |

**Custo.**
- No MySQL local, o envoltório completo custa 0,41 ms por transação interativa (mediana de 0,49 ms
  sem ele e de 0,90 ms com ele).
- Pelo proxy de latência, a diferença na página da sincronização ficou dentro da variação entre
  rodadas, a 2,36 e a 10,6 ms.
- Detalhe no ADR-020, seção "Validação".

**Achado da verificação: o `KILL QUERY` nem sempre produz erro.**
- Numa rodada do F1-02, a subconsulta interrompida voltou `NULL`, e o `UPDATE` seguiu adiante,
  falhando só pela coluna `NOT NULL` (erro 1048). Numa coluna anulável, teria gravado `NULL` sem
  erro.
- O `SLEEP` interrompido também volta sem erro.
- A regra de nunca confirmar depois do disparo (⚑4) é o que impede esses resultados de chegar ao
  banco. O MG04 confirma que o F1-03 pega a regra quebrada.

## 3. Testes que nasceram vermelhos

| Fase | Vermelho | Motivo |
|---|---|---|
| 1 | F1-01 a F1-04 | `P2028` (`PrismaClientKnownRequestError`) em vez de `TransactionDeadlineError` |
| 1 | F1-06 | o módulo do envoltório não existia |
| 2 | F2-01, F2-02 | 500 em vez de 503 `OPERATION_TIMEOUT` |
| 2 | F2-03 (integração) | `P2025` falso na sonda seguinte ao `P2028` que escapou |
| 2 | F2-03 (unidade) | a conexão não era encerrada |
| 2 | F2-04 | a sincronização classificava o prazo como `TRANSACTION_DEADLINE`, não como falha de gravação |
| 2 | F2-05 | a saúde seguia 200 depois do pânico |

Testes de guarda, verdes antes e depois: F1-05 (tempo útil de 5 s e 15 s preservado) e o caso de
unidade "P2028 sem transação iniciada não encerra nada".

## 4. Desvios em relação ao prompt

1. **Consulta pesada dos testes.**
   - O Anexo A, item 8, previa a CTE recursiva de 10 milhões de linhas. Ela foi trocada por uma
     junção em memória sobre uma CTE de 12.000 linhas, que leva cerca de 8 s.
   - Motivo: a CTE grande nem sempre atende ao `KILL QUERY` na hora. Em 8 tentativas, o atraso
     ficou entre 5 e 30 ms, mas chegou a 623 ms numa delas. Numa rodada do F1-01, a interrupção não
     chegou antes do prazo do Prisma (`P2028` aos 6,3 s). O mais provável é a cópia da tabela
     temporária para o disco, que não checa o pedido de interrupção.
   - A junção foi interrompida em 1 a 3 ms nas 8 tentativas.
   - O caso da CTE é a evidência de que a segunda camada é necessária: o prazo próprio cobre a
     regra, e o `KILL` da conexão cobre o resto.
2. **Módulo e fábrica.**
   - O envoltório único ficou em `src/database/transaction-guard.js`, e `limitLockWaits` saiu de
     `lock-wait.js`, que mantém `lockWaitSecondsFor` e `isLockWaitTimeout`.
   - `prismaClient.js` ganhou `createPrismaClient`, usada pelo cliente compartilhado e pelos testes
     que precisam de um cliente próprio envolvido.
3. **Contagem do C3-01.** As contagens comparam cenários entre si, e as duas instruções do
   envoltório entram dos dois lados. Não foi preciso filtrá-las.
4. **`P2025` em `CONNECTION_FAILURES`.** Mantido: a segunda camada ainda tem uma janela de corrida
   entre o `P2028` e o `KILL`, na qual uma resposta errada continua possível em tese.
5. **Evento de falha do `KILL`.** A falha de encerrar a conexão usa o mesmo
   `database_transaction_kill_failed` da falha do `KILL QUERY`, com `scope: 'connection'` ou
   `scope: 'query'`.
6. **Jobs.** Um job que dispara o vigia e chama só `prisma.$disconnect()` termina sozinho. O
   cliente de recuperação não segura o processo, e os scripts não mudaram (Anexo A, item 6).
7. **F2-01.** A consulta pesada entra na transação do comentário pela gravação da auditoria
   (`auditRepository.create`), que roda dentro dela.
8. **`causeCode` do prazo próprio.** O log registra `TRANSACTION_DEADLINE`, não o código da
   instrução interrompida (1317), que fica só em `cause`.

## 5. Verificação

| Item | Resultado |
|---|---|
| Suíte completa do backend, duas vezes | 2.286 verdes, idênticas nas duas rodadas; só a falha de ambiente `EPERM` de symlink (`storage.test.js`) |
| Gates do backend | `lint`, `format:check`, `architecture:check` e `security:secrets` verdes |
| Precedentes (F1-07) | testes do S202-F29, RT-N-L-05 (`s202-reteste`) e C2-01 (`s203-correcoes`) verdes |
| Mutantes MG01–MG12 | 12 de 12 mortos (tabela abaixo) |
| Código de produção depois das mutações | intacto (`git status` vazio em `backend/src`, `backend/scripts` e `backend/test` depois de cada rodada) |
| Coautoria | `git log --format='%h [%(trailers)]' 9a2d608..HEAD` sem nenhum trailer nos commits desta correção |

**Mutantes** (`s202-f33` de unidade, integração e API, `s202-f29` de unidade e integração e
`s203-correcoes` de integração e unidade, com `--bail=1`):

| Mutante | Alteração | Morto por |
|---|---|---|
| MG01 | o vigia não é armado | F1-01 |
| MG02 | o vigia arma, mas não manda `KILL QUERY` | F1-01 |
| MG03 | o prazo do Prisma igual ao pedido (sem folga) | F1-01 |
| MG04 | depois do disparo, o resultado do callback é devolvido | F1-03 |
| MG05 | um único `KILL QUERY`, sem repetição | F1-04 |
| MG06 | o vigia não para quando o callback termina | C2-01; só com os testes do S202-F33, F2-01 (o `KILL QUERY` atrasado atinge a requisição seguinte) |
| MG07 | o `SET` do ADR-019 passa a usar o prazo com folga | F1-05 do S202-F29 |
| MG08 | 503 volta a ser 500 | F2-01 |
| MG09 | o 503 sem `Retry-After` | F2-01 |
| MG10 | sem segunda camada | F2-03 |
| MG11 | o pânico não marca a saúde do processo | F2-05 |
| MG12 | a sincronização não reconhece o prazo próprio | C2-04 (F2-04) |

## 6. Critérios de aceite

- [x] Nenhuma instrução fica em andamento quando o prazo do Prisma vence: a transação lenta termina
      com `TransactionDeadlineError` antes dele, desfeita (F1-01 a F1-04).
- [x] Depois de uma transação lenta, quem usa o banco em seguida recebe resposta certa, em rodadas
      repetidas (F1-01, F1-02, F2-03).
- [x] A transação que passou do prazo nunca confirma (F1-03).
- [x] Quem passa do prazo recebe 503 `OPERATION_TIMEOUT` com `Retry-After`; outras pessoas seguem
      com 200 (F2-01).
- [x] O `P2028` que ainda escapar descarta a conexão, e o pânico do motor deixa sinal operacional
      (F2-03, F2-05).
- [x] ADR-020, contrato, runbook, delta ASVS e backlog coerentes com o código.
- [x] Mutantes MG01–MG12 mortos.
- [x] Suíte completa do backend verde duas vezes, exceto a falha de ambiente conhecida; gates verdes.
- [x] Nenhum commit novo com trailer de coautoria ou atribuição.

## 7. O que fica

- **S202-F30 e S203-F22:** o trabalho que não cabe no prazo agora falha limpo, mas continua
  falhando.
- **S202-F36:** reavaliar o Prisma 7 quando o `prisma/orm#29762` for corrigido.
- **Nuvem (S2-08):** o app e o cliente de recuperação precisam usar o mesmo usuário do banco, para
  o `KILL QUERY` funcionar sem privilégio extra.
- **Demonstração no ambiente do João (opcional):** injetar a consulta pesada numa rota local e
  repetir a requisição de outra conta. O roteiro só roda com o aval dele.
