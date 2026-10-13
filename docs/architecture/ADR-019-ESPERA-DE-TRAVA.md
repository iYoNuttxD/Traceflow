# ADR-019 — Espera de trava nas transações interativas

- **Estado:** aceita (S202-F29)
- **Data:** 13/10/2026
- **Responsáveis:** João Vitor S. Hernandes

## Contexto

O backend usa transações interativas do Prisma (`prisma.$transaction(async (tx) => …)`). O
inventário de 13/10/2026 contou 105 delas.
- O prazo padrão é de 5 s. A `traceabilityTransaction`, os defeitos, os casos de teste, a
  reconciliação de alertas e a remoção do grafo de projeto excluído usam 15 s.
- Muitas travam linhas com `SELECT … FOR UPDATE`: o projeto em quase todas as escritas, além de
  sprint, tarefa, defeito, caso de teste, membership e marco.
- Outras esperam sem trava explícita: linha travada por outra transação, checagem de chave
  estrangeira sobre o projeto travado e leituras `Serializable`.

O MySQL espera uma trava por até 50 s (`innodb_lock_wait_timeout` padrão). Quando a espera passa do
prazo da transação, acontece isto:
1. O Prisma encerra a transação com `P2028`, enquanto a instrução ainda está em andamento no banco.
2. A conexão volta ao pool fora de sincronia.
3. Quem a usa em seguida recebe respostas erradas. Foi o que se viu:
   - **S202-R01** (`docs/issues/S2_02_RELATORIO_RETESTE.md`): a requisição seguinte de outra conta
     respondeu 401 (e o frontend a deslogou) ou 500;
   - **C2-04 do S2-03** (`docs/issues/S2_03_RELATORIO_TESTES.md`, seção 16): `update` respondeu
     `P2025` para linha existente, leituras voltaram vazias, e uma inserção derrubou uma thread do
     motor do Prisma, por mais de 750 ms.

Duas correções anteriores limitaram a espera caso a caso, com `FOR UPDATE NOWAIT` e nova tentativa
em transação nova:
- o `PUT` de preferências (S202-R01), até 2 s e depois 409;
- as escritas da sincronização GitHub (S203-A01), até 5 s e depois `GITHUB_SYNC_PROJECT_BUSY`.

As outras 103 transações não têm limite. O erro 1205 do MySQL ("espera de trava esgotada") não era
tratado, e todo erro do Prisma virava 500 sem o código no log. A reprodução mínima do S202-R01
mostrou o caminho: com `SET SESSION innodb_lock_wait_timeout = 3` dentro da transação, o MySQL
devolve o 1205 antes do prazo do Prisma, e nada falha depois.

## Decisão

1. **Limite por sessão em toda transação interativa (D1).**
   - O cliente Prisma compartilhado (`src/database/prismaClient.js`) é envolvido por uma função de
     `src/database/`.
   - Na forma interativa do `$transaction`, ela executa
     `SET SESSION innodb_lock_wait_timeout = N` antes do callback. A forma em lote
     (`$transaction([...])`) não muda.
   - O limite vale para qualquer espera dentro da transação: `FOR UPDATE`, linha travada, checagem
     de chave estrangeira e leitura `Serializable`.
2. **Valor (D2).** `N = mín(prazo − 3 s, 5 s)`, em segundos inteiros, com mínimo de 1 s.
   - Fica em 2 s nas transações de 5 s (o padrão) e em 5 s nas de 15 s.
   - `timeout` e `maxWait` não mudam.
   - Os dois limites por `NOWAIT` que já existiam ficam: são mais curtos e devolvem códigos próprios.
3. **Resposta (D3).** O 1205 desfaz a transação inteira e responde 409 `RESOURCE_BUSY`, com "Outra
   alteração está em andamento. Tente de novo em instantes." e `Retry-After: 2`. O cliente tenta de
   novo. O deadlock (1213, `P2034`) não é `RESOURCE_BUSY`: o `serializableTransaction` continua
   repetindo esse caso.
4. **Alcance (D4).**
   - Todas as transações interativas passam pelo cliente compartilhado.
   - A regra de arquitetura proíbe `new PrismaClient(` em `src/` fora de `src/database/`.
   - O cliente de recuperação do S203-A01 também fica em `src/database/` e só faz `update` simples.
5. **Observabilidade (D5).**
   - Todo erro do Prisma que chega ao handler HTTP é registrado com o código (`causeCode`).
   - O 1205 gera o evento `database_lock_wait_timeout` (`warn`), com rota e `requestId`.
   - O `P2028` que ainda ocorrer, por trabalho lento, continua 500, agora com `causeCode: P2028` no
     log.
6. **Sincronização GitHub (D6).**
   - O 1205 é classificado como `GITHUB_SYNC_PROJECT_BUSY`, como o `NOWAIT` esgotado.
   - A gravação de sugestões de commit, que serve à sincronização e à varredura manual, recebe o
     limite da sessão.
   - A expiração de uma execução vencida, feita durante o `GET .../github/sync/status`, registra a
     falha ao marcar o projeto e não derruba a leitura.

## Alternativas consideradas

- **`FOR UPDATE NOWAIT` em cada trava explícita.** Rejeitada como regra geral: exige mudar dezenas de
  pontos e não cobre as esperas implícitas. Fica onde já existe.
- **Ajuste global do servidor** (`innodb_lock_wait_timeout` no `my.ini` ou na configuração da
  nuvem). Rejeitada como regra principal: fica fora do controle da aplicação e dos testes. Pode
  complementar a regra na nuvem (S2-08).
- **503 em vez de 409.** Rejeitada: o recurso está ocupado, não o serviço indisponível, e o 409
  segue o padrão do `NOTIFICATION_PREFERENCES_BUSY`.
- **Descartar o pool depois de um `P2028`.** Rejeitada: derrubaria as requisições em andamento de
  outras pessoas para se proteger de um caso que esta decisão já tira da espera de trava.

## Consequências positivas

- Nenhuma espera de trava passa do prazo da transação, e a conexão não fica dessincronizada por
  espera.
- Quem encontra o recurso ocupado falha sozinha, com 409 e `Retry-After`. Outras pessoas não são
  atingidas.
- O código de todo erro do Prisma passa a aparecer no log.

## Consequências negativas

- Uma instrução a mais por transação interativa (o `SET SESSION`).
- O valor do limite fica na conexão do pool depois da transação. Instruções fora de transação
  herdam o último valor, de no máximo 5 s. Isso só encurta a espera e devolve erro limpo.
- Sob contenção real, aparecem 409 que antes eram esperas longas. O cliente precisa tentar de novo.
- O `P2028` por trabalho lento (instrução demorada, latência alta) continua possível e ainda
  dessincroniza a conexão (S202-F33). As transações de 5 s com trabalho pesado estão no S202-F30.

## Impactos de segurança e privacidade

- ASVS V15.4.2 e V15.4.3: estado verificado e alterado sob trava, sem espera indefinida.
- V16.5.3: a falha fica na operação que falhou e não atinge outras requisições.
- V16.3.4: o código do erro é registrado. Nenhum dado pessoal entra no log.
