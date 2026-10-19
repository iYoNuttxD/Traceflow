# ADR-022 — Consulta contextual de alertas e avisos de inconsistência

- **Estado:** aceita em 15/10/2026 (revisão independente da PR #26: TF-REV-008, UX-D01, UX-D02 e
  UX-D03). Revista em 17/10/2026 com a avaliação visual do João na segunda revisão (UX-R2-01 a
  UX-R2-04) e as confirmações da seção final, e em 18/10/2026 com os ajustes visuais pedidos pelo
  Daniel na terceira revisão (UX-R3-01 a UX-R3-03).
- **Data:** 15/10/2026
- **Responsáveis:** João Vitor S. Hernandes
- **Relação:** revê a interface do [ADR-015](ADR-015-TRACEABILITY-ALERTS.md) (D1 e D7), do
  [ADR-016](ADR-016-TASK-NOTIFICATIONS.md) (D10) e do
  [ADR-018](ADR-018-GITHUB-EVENT-NOTIFICATIONS.md) (D13)

## Contexto

A avaliação humana da PR #26 rejeitou a interface entregue no S2-01, S2-02 e S2-03:
- a central de notificações é uma página própria, com parágrafo de abertura, cartões grandes,
  vários botões por cartão e filtros fora do design system;
- os alertas e as tarefas sem vínculo técnico têm páginas próprias dentro de Rastreabilidade, o que
  tira a pessoa do contexto de trabalho.

O responsável pelo projeto confirmou em 15/10/2026 três decisões de produto:
- **UX-D01:** painel lateral compacto no lugar da página de notificações. As páginas de alertas e de
  tarefas sem vínculo saem, e no lugar delas entram indicações nas tarefas e nos artefatos e filtros
  nas listas que já existem. Detalhes, histórico e resolução continuam acessíveis. O RF58 exige
  identificar **e listar**: um ícone sozinho não basta.
- **UX-D02:** "Sem requisito vinculado" é informação contextual, sem alerta novo.
- **UX-D03:** os alertas de PR mesclada e de issue fechada sem tarefa chegam a todos os membros
  ativos e autorizados do projeto, incluindo gestores e proprietário. A leitura é individual, e ler
  não resolve a inconsistência.

Restrições do terreno:
- Não há componente de gaveta nem de painel lateral. O `SprintDialog` vira folha inferior no
  celular.
- A gaveta móvel do menu deixa o `main` `inert`.
- A lista de tarefas e o quadro já trazem `pullRequest`, `commits` e `issues` de cada tarefa
  (`formatTask`).
- A lista de PRs e issues do Repositório pagina no servidor.
- A listagem de alertas não filtra por tarefa ou artefato.
- `Notification.taskTitle` é obrigatório, e o alerta não tem destinatário.

## Decisão

1. **Painel de notificações (D1).**
   - **Forma.** O sino do menu abre um painel lateral:
     - à esquerda, colado à navegação lateral, com no máximo 400 px, a partir de 721 px (UX-R2-04);
     - em tela cheia até 720 px.
   - **Preferências.** O atalho abre a vista "Preferências" dentro do próprio painel, com "Voltar às
     notificações". A volta preserva a aba, a origem e as páginas já carregadas. A página
     `/settings/notifications` continua para o acesso direto.
   - **Camadas.** O painel fica em portal, fora do `main`, na pilha do `useDialogLayer`:
     - contenção de foco e `Escape` na ordem certa;
     - foco inicial no título e retorno ao sino;
     - movimento que respeita `prefers-reduced-motion`.
   - **Fundo (18/10/2026, UX-R3-01).** O escurecimento cobre só a área principal, a partir do
     deslocamento do menu expandido ou recolhido. O menu fica com as cores normais e o sino
     destacado (`aria-expanded`). O diálogo continua modal: o shell fica `inert`, e o clique sobre o
     menu fecha o painel, como o clique fora, sem navegar.
   - **Cabeçalho:**
     - título;
     - "Marcar todas como lidas";
     - atalho para as preferências;
     - botão de fechar.
     - Sem parágrafo de abertura.
   - **Filtros:**
     - abas "Não lidas" e "Todas", com `tablist` completo;
     - seletor "Origem": Todas, Tarefas, GitHub, Inconsistências.
   - **Item compacto.** Uma frase e uma linha de metadado: projeto e horário, com `<time>`.
     - O item inteiro abre o contexto e marca como lido.
     - Um botão de ícone alterna lida e não lida, com o contexto no nome acessível.
     - "Abrir no GitHub" fica no destino, não no item.
   - **Não lida.** Ponto com texto alternativo, frase em negrito e barra de destaque.
   - **Ícone por tipo**, com token semântico:
     - inconsistência em warning;
     - vencimento em danger;
     - status e GitHub em info.

     Cor não é o único sinal.
   - **Rota antiga.** `/notifications` redireciona e abre o painel.
2. **Indicações nas tarefas (D2).**
   - **Marcador do RF13.** O cartão do Kanban e o item da lista de tarefas mostram "Concluída sem
     commit" quando há alerta RF13 aberto, no padrão do marcador de correção do S1-08. O marcador
     abre os detalhes da tarefa.
   - **Linha de rastreabilidade.** Ela separa:
     - vínculo técnico (commit, PR e issue): "Sem vínculo técnico";
     - requisito: "Sem requisito", como informação discreta (UX-D02).
   - **Filtro "Rastreabilidade".** Fica só em "Buscar e filtrar", no Kanban e na lista de tarefas,
     e entra na contagem de filtros ativos e na limpeza. As opções:
     - Todas;
     - Sem vínculo técnico;
     - Concluídas sem commit.
   - **Contador do RF58.** "Sem vínculo técnico" fica no resumo de cada tela, sem faixa nem botão
     isolado (UX-R2-03). Os rótulos visíveis não trazem o código do RF.
   - **Detalhes da tarefa.** Ganham a seção "Inconsistência", com:
     - tipo, ocorrência e detecção;
     - o vínculo de commit;
     - a dispensa (MANAGER+, com justificativa);
     - o histórico dos alertas resolvidos e dispensados da tarefa, que continua acessível quando
       não há alerta aberto (TF-REV-010).
3. **Indicações nos artefatos (D3).**
   - **Tela do Repositório.** A coluna de estado mostra "Mesclada · sem tarefa" e "Fechada · sem
     tarefa".
   - **Filtro "Inconsistência".** Fica no servidor, com as opções:
     - Todas;
     - Sem tarefa vinculada (aberta);
     - Dispensadas;
     - Resolvidas.
   - **Ação "Ver inconsistência".** Abre o detalhe do alerta, com vincular a uma tarefa, dispensar,
     GitHub e histórico.
     - O detalhe abre na largura padrão, em três blocos: motivo, dados e ações (UX-R2-01).
     - A identificação do item e a data da ocorrência aparecem uma vez só.
   - **Link direto:** `?alerta=<id>`.
4. **Resumo em Rastreabilidade (D4).** A sub-navegação sai. As contagens abertas de cada tipo
   ficam no bloco "Resumo" da tela, num grupo "Inconsistências abertas", separado dos indicadores de
   requisito, e cada uma leva à lista filtrada (UX-R2-02).
   - **Padrão do resumo (18/10/2026, UX-R3-02).** As três contagens são células do resumo, com as
     classes e a tipografia das métricas de requisito, e o título alinhado ao recuo delas. São 3
     colunas no desktop e no tablet e 1 abaixo de 34rem, sem célula órfã. Os números continuam
     links, com nome acessível.
   - **Atualização interna (18/10/2026, UX-R3-03).** O botão "Reprocessar" saiu: o sistema atualiza
     as inconsistências sozinho (ADR-015 D5, ADR-024 D7). O bloco diz o estado:
     - ainda não calculadas: as contagens mostram "—" e o texto explica;
     - desatualizadas: a data da falha ou do último sucesso, sem prometer horário de nova tentativa;
     - erro ao carregar o resumo: o estado de erro, nunca zero.
   - As rotas antigas de alertas e de tarefas sem vínculo redirecionam para a lista filtrada
     correspondente.
5. **Avisos de inconsistência (D5).** Alerta de PR mesclada ou de issue fechada sem tarefa (RF39,
   RF40) gera um aviso por pessoa, do tipo `TRACEABILITY_INCONSISTENCY`. O alerta RF13 fica nas
   indicações da tarefa.
6. **Destinatários (D6).** Toda membership ativa do projeto, em qualquer papel, com quatro
   condições:
   - conta `ACTIVE`;
   - `joinedAt` até o `detectedAt` do alerta;
   - preferência do tipo ligada antes da detecção (`enabledAt`);
   - avaliação no despacho, que roda logo depois da reconciliação.

   Quem entra depois não recebe aviso de alerta antigo, mas vê as inconsistências abertas nas
   listas. Quem sai tem os avisos ocultos pela visibilidade do ADR-016 D9.
7. **Fila e despacho (D7).**
   - **Fila no alerta.** O alerta guarda o estado do aviso (`noticeState`: `PENDING`, `DISPATCHED`
     ou `NOT_APPLICABLE`) e `noticedAt`.
     - Alerta novo de PR ou issue nasce `PENDING`.
     - Alerta de tarefa nasce `NOT_APPLICABLE`.
     - Alertas anteriores a esta decisão ficam `NOT_APPLICABLE`, sem aviso retroativo.
   - **Quando o despacho roda.** Sempre fora da transação da reconciliação:
     - depois da reconciliação da sincronização;
     - depois da varredura do worker;
     - depois do reprocessamento manual, pela API;
     - depois do script;
     - depois das mutações que passam por `traceabilityTransaction`;
     - num job periódico, para recuperação (ADR-024).
   - **Idempotência.**
     - Insere com `skipDuplicates`, pela chave única por destinatário.
     - Depois marca `DISPATCHED`.
     - Repetir o despacho não duplica nada.
8. **Lote e resumo (D8).** Alertas pendentes do mesmo projeto e da mesma detecção formam um lote.
   - Com até 10 alertas, sai um aviso por alerta.
   - Acima disso, sai um aviso-resumo por pessoa, como "12 inconsistências novas: 9 PRs mescladas e 3
     issues fechadas sem tarefa", com link para a lista filtrada.
   - Chaves:
     - `TRACEABILITY_INCONSISTENCY:alert:<alertId>`;
     - `TRACEABILITY_INCONSISTENCY:batch:<projectId>:<detectedAt>`.
9. **Leitura e estado (D9).**
   - Ler o aviso não resolve nem dispensa o alerta, nem muda a leitura de outra pessoa.
   - Dispensar ou resolver o alerta não apaga o aviso nem o marca como lido.
   - O item mostra o estado atual do alerta: aberto, dispensado em uma data ou resolvido em uma data.
10. **Modelo (D10).** Uma migration nova:
    - **Notificação.**
      - `taskTitle` passa a aceitar nulo.
      - Ganha `traceabilityAlertId` (FK `SET NULL`) e `batchSummary` (`Json`, só para exibição).
      - Os campos de artefato que já existem guardam número, título, URL e data da ocorrência.
    - **Tipo e preferência.**
      - O valor `TRACEABILITY_INCONSISTENCY` entra nos enums de notificação e de preferência.
      - O `PUT` de preferências passa a exigir cinco chaves, com a mesma mensagem para cliente antigo
        (precedente do S202-F17).
      - A origem ganha o grupo `INCONSISTENCIES`.
11. **Dados para as indicações (D11).**
    - **RF58.** Sai do que a lista e o quadro já trazem.
    - **Alerta da tarefa.** Sai de um índice compacto dos alertas abertos do projeto, no módulo de
      rastreabilidade.
    - **Histórico de uma tarefa ou artefato.** Sai da listagem de alertas filtrada pelo sujeito.
    - **Artefatos.** O filtro e o resumo de inconsistência entram na consulta de artefatos, no
      servidor.

## Alternativas consideradas

- **Manter a página `/notifications` e as páginas de alertas.** Rejeitada pela avaliação humana:
  navegação fragmentada e leitura lenta.
- **Painel só no desktop, com a página no celular.** Rejeitada: duas interfaces para a mesma
  função.
- **Ícone isolado na tarefa, sem filtro.** Rejeitado: o RF58 pede listar, e o ícone sozinho não
  lista.
- **Avisar só os gestores.** Descartado pelo responsável (UX-D03).
- **Fundir o aviso no alerta, com leitura por pessoa no próprio alerta.** Rejeitada: misturaria o
  estado do projeto com o de cada pessoa, e a leitura passaria a resolver o alerta.
- **Um aviso por alerta mesmo no histórico importado.** Rejeitada: conectar um repositório antigo
  geraria centenas de avisos por pessoa.
- **Sem aviso para o histórico, decidido pelo gatilho.** Rejeitada: a retomada depois de uma pausa
  longa também gera lote grande, e o limite por quantidade cobre os dois casos.
- **Destinatários avaliados no despacho sem conferir a entrada no projeto.** Rejeitada: quem entrou
  depois receberia aviso de inconsistência anterior à entrada.

## Consequências positivas

- A pessoa trata a inconsistência onde trabalha: no cartão, na lista ou no detalhe.
- O RF58 é listado na lista que já existe, com o denominador do critério.
- Todos os membros sabem das PRs e issues sem tarefa, sem precisar abrir Rastreabilidade.
- O despacho é idempotente e recuperável, sem transação interativa.

## Consequências negativas

- **Código do Daniel.** As indicações mudam telas e serviços de outra entrega: Kanban, lista e
  detalhes de tarefa, Repositório, serviço de artefatos, menu e rotas.
- **Contrato de preferências.** Quebra o cliente antigo de propósito, porque a quinta chave é
  obrigatória.
- **Aviso-resumo.** Não diz quais PRs e issues são. A lista filtrada diz.
- **Retorno ao projeto.** Quem sai e volta mantém o `joinedAt` original. Pode receber aviso de
  alerta detectado enquanto estava fora, se o despacho atrasar.
- **Contador do Kanban.** O "Sem rastreabilidade" do Kanban continua contando requisito. O RF58 usa
  a contagem própria.

## Impactos de segurança e privacidade

- Os destinatários são calculados no servidor, a partir de membership e conta. O cliente não
  informa destinatário.
- O título do artefato vem de terceiros: é exibido como texto, limitado a 256 caracteres, e a URL só
  é aceita com o prefixo `https://github.com/`.
- O aviso é dado do titular:
  - entra na exportação;
  - é apagado na anonimização;
  - é retido por 180 dias.
- As leituras de alertas e o índice exigem membership ativa, conferida no serviço (emenda do
  ADR-003).

## Revisão de 17/10/2026 — segunda revisão independente da PR #26

**Avaliação visual do João (UX-R2-01 a UX-R2-04).** O João aprovou as recomendações em 17/10/2026
(`PR26_PROMPT_CORRECOES_REVISAO_2.md`, não versionado):

| Direção | Decisão |
| --- | --- |
| UX-R2-01 | o detalhe da inconsistência abre na largura padrão, em três blocos (motivo, dados e ações), sem repetir a identificação nem a data da ocorrência (D3) |
| UX-R2-02 | as contagens abertas entram no bloco "Resumo" da Rastreabilidade (D4) |
| UX-R2-03 | o contador do RF58 fica no resumo e o filtro só em "Buscar e filtrar" (D2) |
| UX-R2-04 | o painel e as preferências abrem pela esquerda (D1) |
| TF-REV-010 | o histórico de inconsistências da tarefa aparece mesmo sem alerta aberto (D2) |

**Confirmações pedidas pela decisão 7 do parecer.** Confirmadas uma a uma pelo João em 17/10/2026:

| Escolha | Regra confirmada |
| --- | --- |
| Agrupamento | mais de 10 avisos do mesmo tipo para a mesma pessoa, numa reconciliação, viram um aviso de resumo (D8) |
| Elegibilidade | recebe o aviso quem entrou no projeto e ligou a preferência antes da detecção: `joinedAt` e `enabledAt` até `detectedAt` (D6) |
| Legado | alertas abertos antes da implantação dos avisos ficam `NOT_APPLICABLE`, sem aviso retroativo (D7) |
