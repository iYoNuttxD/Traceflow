# Correção do relógio de esforço realizado — 20/10/2026

## Relato e diagnóstico

O cronômetro começava em `00:00:11`. O painel e o cartão do Kanban calculavam
`Date.now() - startedAt`: o primeiro valor vinha da máquina do usuário e o segundo
do servidor. Um navegador 11 segundos adiantado reproduz exatamente o relato;
um relógio atrasado deixava o cronômetro parado em zero até compensar o desvio.
Não foi feita inspeção do relógio real do ambiente de produção do usuário.

## Solução

- A API publica `serverNow` no snapshot de sessões abertas, no resumo de esforço
  e no DTO da tarefa/Kanban. Datas e durações persistidas não são alteradas.
- O cliente calcula a idade da sessão no relógio do servidor e ancora esse valor
  em `performance.now()` quando recebe HTTP/eventos. O intervalo só redesenha.
- Snapshots recebidos antes da renderização ou reaplicados após uma leitura em voo
  preservam sua âncora. A sessão completa conserva os metadados existentes.
- Painel e cartão usam o mesmo cálculo. Reabrir/reconectar recebe a idade real
  da sessão, sem zerar trabalho em andamento. Retomar mantém o esforço encerrado.
- O tempo ao parar continua sendo o persistido e calculado pelo servidor.

Não há subtração fixa de onze segundos, zeragem artificial de sessões antigas,
migration, alteração de permissões, dependências, thresholds ou exclusão de testes.

## Verificação

- Regressões de desvio do navegador +11 s, -11 s e +1 h; avanço de um segundo;
  mudança do relógio local; sessão reaberta; snapshot em buffer; esforço acumulado;
  evento antes da resposta HTTP; recebimento nos endpoints de tarefa/Kanban;
  duplicação do mesmo snapshot e reconciliação ao parar.
- Backend: suíte unitária completa, 1.636 testes aprovados em 133 arquivos.
- Frontend: suíte integral final, 1.803 testes aprovados em 144 arquivos.
  Regressões finais do relógio/transporte/hook, 26 testes aprovados.
  O primeiro conjunto focado ampliado passou com 65 testes.
- Lints e formatação backend/frontend, build frontend, arquitetura, varredura de
  segredos, política de CI e inventário de UI aprovados (62 testes dos dois últimos).
- Revisão independente sem bloqueadores; observações de preservação de metadados
  e de latência foram tratadas/documentadas.
- A suíte integral final passou localmente. A publicação e a CI estão pendentes
  neste checkpoint; o resultado do commit publicado será registrado na PR #25. A rodada integral anterior coincidiu com uma edição
  de teste e foi substituída; não foi apresentada como aprovação final.

## Limites

A duração visual não adiciona o trânsito entre observação do servidor e recepção:
pode ficar atrás pelo tempo de transporte/processamento, sendo reconciliada na
próxima leitura ou ao parar. Isto não é sincronização subsegundo. Snapshots de
servidores antigos sem `serverNow` conservam fallback compatível, ainda dependente
do relógio local; a correção completa exige backend e frontend desta versão.
Não houve validação manual em navegador autenticado nem execução MySQL local;
a suíte de banco é verificada no CI. Não houve merge ou deploy.

## Checkpoint de publicação e dependências

As alterações do cronômetro e do catálogo vazio foram publicadas na PR #25,
head `32cfd6e1e753fd377cae7ce29dd5a9b5afd84cd0`, com árvores idênticas às
validadas localmente. A [CI 158](https://github.com/iYoNuttxD/Traceflow/actions/runs/39506390571)
aprovou Quality, Dependency Review e Frontend Tests, mas bloqueou Supply Chain
por advisories de dependências que já existiam nos lockfiles, não pela correção
do cronômetro. Backend Tests ainda estava em andamento neste checkpoint.

Após autorização específica, os lockfiles atualizam Vite para 8.1.6 nos dois
pacotes e follow-redirects para 1.16.1 no frontend. A resolução do Vite frontend
atualiza também sua cadeia Rolldown/bindings e dependências associadas.
Manifests, regras de auditoria e exceções permanecem inalterados. Instalações
limpas com `npm ci` passaram e a política de auditoria dos dois pacotes ficou
aprovada sem nenhuma exceção, high ou critical. A validação remota deste novo
checkpoint deve ser consultada na PR; este registro não afirma CI aprovada.

Com os novos locks: frontend completo 1.807/145 arquivos, backend unitário
1.636/133 arquivos, build, lints, formatação e 28 testes da política de auditoria
aprovados. A primeira execução unitária após instalação limpa não tinha Prisma
Client gerado; `prisma generate` corrigiu o setup e a repetição integral passou.
Revisão independente dos locks não encontrou alterações fora da cadeia necessária.
O runtime WASM opcional do Rolldown requer Node 22.13+ na série 22; a CI usa Node
22 atualizado. Não houve mudança de major das dependências principais, supressão
de advisories, merge ou deploy.
