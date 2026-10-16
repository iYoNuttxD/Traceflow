# ADR-023 — Fonte durável dos eventos de issues e pull requests

- **Estado:** proposta em 15/10/2026. Aguarda o portão G1 da PR #26: o João decide se ela segue
  direto ou passa antes pelo revisor.
- **Data:** 15/10/2026
- **Responsáveis:** João Vitor S. Hernandes
- **Relação:** complementa o [ADR-018](ADR-018-GITHUB-EVENT-NOTIFICATIONS.md) (D1, D2, D14) e respeita
  o [ADR-021](ADR-021-GRAVACAO-POR-DIFERENCA.md) (gravação por diferença)

## Contexto

O RF60 (Quadro 3-57) e o RF61 (Quadro 3-58) medem a cobertura sobre o **total de eventos
ocorridos**. Hoje a transição nasce da comparação do estado de cada sincronização com o estado
gravado (ADR-018 D1). Isso perde transições intermediárias:
- fechar e reabrir uma issue entre duas sincronizações não deixa rastro;
- reabrir e fechar aparece como um fechamento só;
- a data da reabertura é aproximada pela última atualização.

Por isso o total de eventos é desconhecido, e a cobertura total sai "indisponível". A revisão
independente da PR #26 (TF-REV-002) pediu uma arquitetura de aquisição durável, submetida antes da
implementação.

O que a documentação do GitHub diz, lida em 15/10/2026:

| Fonte | O que oferece | Limite |
| --- | --- | --- |
| `GET /repos/{owner}/{repo}/issues/events` | eventos `closed`, `reopened` e `merged` de issues e PRs; `page` e `per_page` até 100 | não documenta ordem, cursor nem `since`, nem limite de tempo |
| `GET /repos/{owner}/{repo}/issues/{number}/events` | os mesmos eventos de um único artefato | — |
| API de atividade (`/repos/{owner}/{repo}/events`) | eventos do repositório | 30 dias, 300 eventos e latência de 30 s a 6 h |
| Webhooks `issues` (`opened`, `closed`, `reopened`) e `pull_request` (`closed`, `reopened`) | eventos em tempo real | sem reentrega automática; reentrega manual ou por API só para os 3 últimos dias |

A permissão exata da App para os endpoints de eventos não aparece nas páginas lidas. A esperada é
Issues e Pull requests com leitura, que a App já tem para importar. Isso precisa ser confirmado antes
do código.

## Decisão proposta

1. **Histórico por artefato vinculado que mudou (D1).**
   - Na sincronização, depois de gravar a página, o sistema faz uma lista dos artefatos que mudaram.
     Entram as issues e PRs que:
     - estão vinculadas a alguma tarefa;
     - têm `updatedAtGithub` diferente do gravado.
   - Para cada um, lê `GET /repos/{owner}/{repo}/issues/{number}/events`, paginado de 100 em 100.
   - Registra cada `closed`, `reopened` e `merged` posterior ao último evento lido, com a data do
     GitHub.
2. **Cursor por artefato (D2).** O id do último evento lido fica no artefato. A primeira leitura de
   um artefato registra só os eventos ocorridos enquanto ele estava vinculado (D4). Migration nova.
3. **Mesma fila (D3).**
   - Os eventos lidos entram em `GitHubArtifactEvent`, com a mesma chave de ocorrência
     (`tipo:artefato:data`).
   - A comparação de estado continua como rede de segurança.
   - A chave deduplica as duas fontes, e o despacho, os destinatários e a métrica do ADR-018 não
     mudam.
4. **Vínculo no instante do evento (D4).**
   - Vale o evento ocorrido enquanto o artefato estava vinculado à tarefa.
   - O vínculo de issue tem data (`TaskIssue`). O de PR (`Task.pullRequestId`) não tem. Para a PR,
     vale o instante em que o vínculo foi observado na sincronização. Essa limitação é declarada.
5. **Falha vira lacuna (D5).**
   - Resposta 403, 404, 410 ou 429, ou fim do prazo da requisição, encerra a leitura do artefato
     naquela sincronização. A lacuna é registrada com o projeto, o artefato, o período e o motivo.
   - Na sincronização seguinte, a leitura continua do cursor.
   - Enquanto houver lacuna aberta no período, a cobertura total do RF60/RF61 sai "indisponível"
     ([NOTIFICATION_METRICS.md](../data/NOTIFICATION_METRICS.md)).
6. **Custo (D6).**
   - Uma requisição por artefato vinculado que mudou, fora da transação da página.
   - O limite de requisições por sincronização é o mesmo do cliente GitHub.
   - O que passar do limite fica para a sincronização seguinte, sem perda, porque o cursor não
     avança.

## Alternativas consideradas

- **Webhooks `issues` e `pull_request` no endpoint que já existe.** O endpoint tem HMAC e
  deduplicação por entrega.
  - Exige assinar os eventos na configuração da App, que pertence ao dono da App.
  - Exige um job de reentrega, porque o GitHub não reentrega sozinho e só guarda 3 dias.
  - Exige reconciliação com a sincronização.
  - Fica como evolução, se a latência importar.
- **Eventos do repositório inteiro (`/issues/events`).** Rejeitada: sem ordem documentada nem
  cursor, a leitura incremental dependeria de comportamento não garantido.
- **API de atividade.** Rejeitada: 30 dias, 300 eventos e latência de até 6 h.
- **Só a comparação de estado.** É o estado atual. A cobertura total fica "indisponível" para
  sempre.

## Consequências positivas

- O total de eventos ocorridos passa a ser conhecido enquanto não houver lacuna, e a cobertura total
  pode ser calculada.
- A reabertura ganha a data real.
- Falha temporária não perde evento: a leitura continua do cursor.

## Consequências negativas

- Mais requisições ao GitHub em sincronizações com muitos artefatos vinculados que mudaram.
- A PR não tem data de vínculo. O instante observado aproxima o vínculo e pode deixar de fora um
  evento ocorrido entre o vínculo e a sincronização.
- Mais uma migration (cursor e registro de lacuna).

## Impactos de segurança e privacidade

- A requisição usa o mesmo cliente e a mesma credencial da instalação, com prazo efetivo.
- Do evento, só ficam o tipo, a data e o id. O `actor` do GitHub não é gravado.
- A lacuna guarda ids e motivo, sem título nem login.
