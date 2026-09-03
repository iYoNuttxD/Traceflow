# ADR-013 — Server-Sent Events por projeto para comentários colaborativos

- **Estado:** proposto na PR #17
- **Data:** 02/09/2026

## Contexto

Comentários precisam refletir criação, edição e exclusão feitas por outros integrantes sem exigir
recarregamento manual. Polling periódico fazia GET mesmo sem alteração, criava concorrência com
paginação e mutations e, quando aplicado também ao Kanban, ampliava uma mudança de colaboração para
uma surface que será reformulada em trabalho posterior. O histórico de comentários também estava
limitado por paginação offset com lote inicial pequeno.

MySQL e a API REST continuam sendo a fonte canônica. A entrega de eventos serve apenas para propagar
mudanças já confirmadas; não é event sourcing, armazenamento ou substituto da paginação histórica.

## Decisão

O backend expõe `GET /api/projects/:projectId/events` como stream SSE autenticado e autorizado por
membership ativa. O frontend mantém uma conexão por projeto ativo e aba visível, compartilhada por
consumers da rota. Nesta decisão, os únicos eventos publicados e consumidos são:

- `task.comment.created`;
- `task.comment.updated`;
- `task.comment.deleted`.

O envelope inclui `type`, `projectId`, `taskId`, `occurredAt` e `data.comment`. O DTO do comentário é
apresentado por subscriber, mantém apenas dados seguros e resolve `canEdit`/`canDelete` pelo papel da
membership capturado na abertura do stream. Echo da própria mutation é permitido; o cliente faz
merge idempotente por `comment.id` e não deixa uma versão temporalmente mais antiga substituir uma
mais nova.

A carga inicial, o histórico, as mutations e a recuperação continuam REST. Comentários usam cursor
opaco com ordenação `createdAt DESC, id DESC`, lote padrão 30, máximo 100 e `limit + 1` para
`hasMore`, sem COUNT por página. Ao reconectar depois de queda ou retorno da aba, o consumer executa
uma única reconciliação REST da janela recente. Um evento SSE não dispara GET.

O Kanban não publica nem consome eventos nesta PR. Seu polling temporário é removido e não é
substituído por SSE; carga inicial, mutations, rollback e refresh motivado por ação permanecem como
antes. Tipos `task.created`, `task.updated`, `task.deleted` ou `kanban.changed` não fazem parte deste
contrato.

## Publisher e transporte

`ProjectEventPublisher` é uma fronteira pequena entre services e transporte. O service de comentários
publica somente depois da transaction de banco concluir. Falha ao publicar gera warning sanitizado,
mas não transforma uma mutation persistida em falha. Services não conhecem `Response`, sockets ou
`EventSource`.

A implementação atual, `InMemoryProjectEventPublisher`, suporta corretamente uma instância Node. Ela
separa subscribers por projeto, não mantém event log nem fila ilimitada e remove o subscriber se a
escrita sinalizar backpressure ou falhar. Um scheduler compartilhado envia heartbeat a cada 25
segundos, sem consulta ao banco. Streams têm vida máxima de 15 minutos; o encerramento força uma
nova conexão e, portanto, nova autenticação/autorização.

O endpoint usa `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform` e
`X-Accel-Buffering: no`. A conexão usa a sessão HttpOnly existente, sem token, JWT, session ID ou API
key na URL. CORS continua por allowlist com credentials; não é aberto para `*`. Mutations permanecem
nos endpoints REST protegidos por CSRF.

Logout, revogação de sessão, desativação/saída de membership e mudanças de papel encerram os streams
afetados. O heartbeat não consulta o banco. Alterações de autorização que não atravessem esses
services são limitadas pela vida máxima do stream e revalidadas na reconexão.

## Alternativas rejeitadas

- **Polling:** produz leituras ociosas e races sem oferecer propagação orientada à mudança.
- **WebSocket ou Socket.IO:** comunicação bidirecional, protocolo e dependência adicionais não são
  necessários para notificações unidirecionais de comentários.
- **Redis, NATS, Kafka ou event log persistente:** excedem a topologia atual de uma instância e o
  escopo da PR.
- **SSE de Kanban:** acoplaria a infraestrutura ao board atual antes do trabalho futuro já previsto.

## Escala e operação

O publisher em memória não atravessa processos. Antes de escalar horizontalmente, sua implementação
deve ser trocada por um adapter de broker, como Redis Pub/Sub, preservando o contrato dos services e
do frontend. Não há replay completo; gaps são corrigidos pela reconciliação REST.

Em produção, recomenda-se HTTPS com reverse proxy HTTP/2, streaming sem buffering e timeouts maiores
que a vida máxima do stream. Abas ocultas fecham a conexão e voltam a conectar somente quando
visíveis, reduzindo conexões ociosas. Nenhuma configuração de provider/cloud ou compression global é
alterada por esta decisão.

## Consequências

Comments passam a ter propagação remota sem GET temporal e histórico completo acessível por cursor.
O custo ocioso é uma conexão por projeto/aba visível e heartbeat compartilhado. O deployment atual
continua single-node para eventos; expansão multi-node exige o broker descrito acima. A
infraestrutura central aceita novos tipos no futuro, mas cada novo domínio exige decisão, payload,
autorização e testes próprios.
