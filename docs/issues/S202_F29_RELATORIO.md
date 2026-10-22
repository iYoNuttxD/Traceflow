# Relatório — S202-F29: espera de trava maior que o prazo da transação

- **Data:** 13/10/2026
- **Enunciado:** [S202_F29_PROMPT_CORRECAO_ESPERA_DE_TRAVA.md](S202_F29_PROMPT_CORRECAO_ESPERA_DE_TRAVA.md), com
  os oito pontos ⚑ aprovados pelo João na recomendação.
- **Decisão:** [ADR-019](../architecture/ADR-019-ESPERA-DE-TRAVA.md).
- **Origem:** S202-R01 ([S2_02_RELATORIO_RETESTE.md](S2_02_RELATORIO_RETESTE.md)) e C2-04 do S2-03
  ([S2_03_RELATORIO_TESTES.md](S2_03_RELATORIO_TESTES.md), seção 16).

## 1. Commits

| Fase | Commit | Conteúdo |
|---|---|---|
| 0 | `f5e7c27` | ADR-019; contrato (`RESOURCE_BUSY`); runbook ("Espera de trava no banco"); delta ASVS; S202-F30 a S202-F35 no backlog |
| 1 | `9dd8b6c` | `src/database/lock-wait.js` (`lockWaitSecondsFor`, `limitLockWaits`); cliente compartilhado envolvido; regra `prisma-client-only-in-database`; testes F1-01 a F1-06 e F1-08 |
| 2 | `375a0fd` | `isLockWaitTimeout`; 409 `RESOURCE_BUSY` com `Retry-After: 2`; evento `database_lock_wait_timeout`; `causeCode` no log; 1205 como `GITHUB_SYNC_PROJECT_BUSY`; expiração no `GET` do estado sem derrubar a leitura; testes F2-01 a F2-06 |
| 3 e 4 | commit de registro | ADR-019 ("Validação"), backlog, delta ASVS e este relatório |

## 2. Antes e depois

Outra transação segura a trava. A pessoa A faz a operação, e a pessoa B, de outra conta, consulta o
contador de notificações logo depois. "Sem limite" é o código atual com o `SET SESSION` retirado do
envoltório.

| Teste | Trava segura | Sem limite: A | Sem limite: B | Com limite: A | Com limite: B |
|---|---|---|---|---|---|
| F1-01 comentário (prazo de 5 s) | `Project`, 7 s | 7.018 ms, 500 | 500 | 2.034 ms, 409 | 200 |
| F1-02 status da tarefa (prazo de 15 s) | `Project`, 17 s | 17.011 ms, 500 | 500 | 5.069 ms, 409 | 200 |
| F1-03 marcar notificação como lida | `Notification`, 7 s | 7.013 ms, 500 | 500 | 2.023 ms, 409 | 200 |
| F1-04 entrar pelo código de acesso (`Serializable`) | `Project`, 7 s | 7.016 ms, 500 | 200 | 2.025 ms, 409 | 200 |

- Sem limite, A espera a trava inteira e recebe 500. Em três dos quatro casos, B, que não tem
  relação com a operação, também recebe 500: é o efeito do S202-R01.
- Com limite, A recebe 409 `RESOURCE_BUSY` com `Retry-After: 2`, sem efeito parcial, e a mesma
  requisição repetida depois da liberação responde 201 (F2-01). B segue com 200.
- As formas do erro 1205 e o custo da instrução a mais estão no ADR-019, seção "Validação". O
  custo é de 0,24 ms por transação interativa no MySQL local; pelo proxy de latência, a diferença
  na página da sincronização ficou dentro da variação entre rodadas.

## 3. Testes que nasceram vermelhos

| Fase | Vermelho | Motivo |
|---|---|---|
| 1 | F1-01 a F1-04 | A esperava a trava inteira (7 s ou 17 s), e B recebia 500 |
| 1 | F1-05, F1-06, F1-08 | sem o envoltório, o limite da sessão era 50 s e nenhuma transação começava pelo `SET` |
| 2 | F1-01 a F1-04 completados | 500 `INTERNAL_ERROR` em vez de 409 `RESOURCE_BUSY` |
| 2 | F2-02, F2-03 | `isLockWaitTimeout` não existia; o handler devolvia 500 e não registrava `causeCode` |
| 2 | F2-04, F2-05 | `isLockWaitTimeout` não existia (a classificação era o que se testava) |
| 2 | F2-06 | a marcação do projeto na expiração esgotava o `NOWAIT` de 5 s e derrubava a leitura do estado |

## 4. Desvios em relação ao prompt

1. **Envoltório com `this`, não com `bind`.**
   - A primeira versão de `limitLockWaits` fixava o cliente com `bind`.
   - Clientes criados por `$extends` herdam o `$transaction` da instância. Com `bind`, a transação
     deles passava a rodar no cliente base, sem a extensão.
   - Dois testes de desfazer acusaram, porque injetam falha por `$extends`: "rolls canonical
     mutation…" (`s109-traceability`) e "rolls back duration…" (`task-time-entries-s1-06`).
   - O envoltório passou a chamar o método original com o `this` da chamada, e o F1-05 ganhou o
     caso do cliente estendido.
2. **F2-04 é teste de guarda.** O `serializableTransaction` já repetia só o `P2034`, e o 1205 chega
   com outro código. O `serializable-transaction.js` não mudou. O teste nasceu vermelho só pela
   função de classificação ausente, e o mutante MF09 confirma que ele pega a repetição do 1205.
3. **F2-02 no teste de unidade.**
   - O handler é testado com resposta simulada: o 1205 nas duas formas, o `P2028` e o deadlock
     desconhecido com `causeCode`, e um `P2002` com título e e-mail na mensagem que não chegam
     ao log.
   - O `P2028` real continua coberto pelo C2-04 do S2-03.
4. **F2-05 em duas metades.**
   - O teste confere que a gravação de sugestões de commit falha com 1205 em menos de 3,5 s e que
     `githubSyncFailure` a classifica como `GITHUB_SYNC_PROJECT_BUSY`.
   - O caminho da classificação até a execução `FAILED` e a aceitação da sincronização seguinte é
     o do C2-01, verde.
5. **F2-06 pelo serviço.**
   - O teste chama `getProjectGithubSyncStatus`, que é tudo o que a rota `GET .../github/sync/status`
     faz, em vez da rota HTTP.
   - A falha de antes não era o 1205: a marcação do projeto usa o `NOWAIT` de 5 s da
     sincronização. O `catch` cobre qualquer erro dessa marcação. O log
     `github_sync_project_failure_unrecorded` leva o código classificado (`errorCode`).
6. **F1-05 sem a remoção do grafo.** O teste cobre padrão, 15 s, `Serializable` direta,
   `serializableTransaction`, `traceabilityTransaction`, 3 s, 60 s, a transação seguinte a uma de
   15 s e o cliente estendido. A `deleteProjectGraph` (15 s, `maxWait` 5 s) é da classe de 15 s e
   não foi chamada diretamente.
7. **Um log só para o 1205.** O handler registra o evento `database_lock_wait_timeout` (`warn`, com
   `causeCode`) e não repete o `HTTP request failed.` (`error`) para o mesmo erro.
8. **Testes do S2-03 com cliente próprio.**
   - `s203-bateria` e `s203-correcoes` (integração) trocam o `prismaClient.js` por um cliente que
     conta instruções, sem o envoltório.
   - Os casos de trava deles (`NOWAIT` do C2-01 e `SLEEP(6)` do C2-04) não dependem do limite, e
     as contagens do C3-01 continuam sem o `SET`.
   - Em produção, cada tentativa da página soma uma instrução às 309 medidas.

**Conferência da armadilha 2 (Anexo A).** Nenhum `catch` dentro de callback de transação engole o
1205. O callback de instalação da GitHub App (`github.repository.js`) embrulha o erro de cada etapa
e o relança, e a transação é desfeita. Ali o 1205 chega como falha do callback, não como
`RESOURCE_BUSY`, porque é um fluxo de redirecionamento, não uma resposta JSON.

## 5. Verificação

| Item | Resultado |
|---|---|
| Suíte completa do backend, duas vezes | 2.259 verdes, idênticas nas duas rodadas; só a falha de ambiente `EPERM` de symlink (`storage.test.js`) |
| Gates do backend | `lint`, `format:check`, `architecture:check` e `security:secrets` verdes |
| Precedentes (F1-07) | RT-N-L-05 (`s202-reteste`), C2-01 e C2-04 (`s203-correcoes`) verdes, com `NOTIFICATION_PREFERENCES_BUSY` e `GITHUB_SYNC_PROJECT_BUSY` |
| Mutantes MF01–MF10 | 10 de 10 mortos (tabela abaixo) |
| Código de produção depois das mutações | intacto (`git status` vazio em `backend/src` depois de cada rodada) |
| Coautoria | `git log --format='%h [%(trailers)]' 9b3521c..HEAD` sem nenhum trailer nos commits desta correção |

**Mutantes** (`test/unit`, `test/integration` e `test/api` do S202-F29, mais `s202-reteste` e
`s203-correcoes`, com `--bail=1`):

| Mutante | Alteração | Morto por |
|---|---|---|
| MF01 | o `SET SESSION` sai do envoltório | F1-01 |
| MF02 | o limite só vale quando a transação passa `timeout` | F1-01 |
| MF03 | o limite igual ao prazo da transação | F1-01 |
| MF04 | a forma em lote também recebe o `SET` | RT-N-C-10 (desempenho da central); só com os testes do S202-F29, F1-06 |
| MF05 | o 1205 volta a ser 500 | F1-01 |
| MF06 | o 409 sem `Retry-After` | F1-01 |
| MF07 | o handler sem `causeCode` | F2-02 (`P2028`) |
| MF08 | `githubSyncFailure` ignora o 1205 | F2-03 |
| MF09 | `serializableTransaction` repete o 1205 | F1-04 (6.176 ms, três esperas de 2 s) |
| MF10 | a expiração no `GET` volta a derrubar a leitura | F2-06 |

## 6. Critérios de aceite

- [x] Nenhuma espera de trava, explícita ou implícita, passa do prazo da transação interativa que a
      contém (F1-01 a F1-06).
- [x] Quem encontra o recurso ocupado falha sozinha, com 409 `RESOURCE_BUSY` e `Retry-After`;
      outras pessoas seguem com 200 (F1-01 a F1-04, F2-01).
- [x] Todo erro do Prisma que chega ao handler deixa o código no log (F2-02).
- [x] A sincronização classifica a espera esgotada como `GITHUB_SYNC_PROJECT_BUSY`, e a leitura do
      estado não falha por trava (F2-03, F2-05, F2-06).
- [x] ADR-019, contrato, runbook, delta ASVS e backlog coerentes com o código.
- [x] Mutantes MF01–MF10 mortos.
- [x] Suíte completa do backend verde duas vezes, exceto a falha de ambiente conhecida; gates verdes.
- [x] Nenhum commit novo com trailer de coautoria ou atribuição.

## 7. O que fica

- **S202-F33:** o `P2028` por trabalho lento ainda dessincroniza a conexão (C2-04).
- **S202-F30:** transações de 5 s com trabalho pesado.
- **S202-F31, S202-F32, S202-F34, S202-F35:** achados do inventário, fora do escopo.
- **Demonstração no ambiente do João (opcional):** segurar o projeto por 7 s com um script no
  banco de desenvolvimento e mover uma tarefa na tela. O script só roda com o aval dele.
