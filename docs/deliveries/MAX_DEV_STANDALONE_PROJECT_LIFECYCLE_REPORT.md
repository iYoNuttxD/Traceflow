# Projetos sem GitHub: qualidade, lifecycle e indicadores

## Escopo e base

- Data: 13/10/2026.
- Branch de trabalho: `max-dev`, em checkout isolado de cloud.
- Base revisada: `main` em `11eeea3137b0bccc8fcc69597e31ad26ea700a5c`.
- A `max-dev` remota inicial (`76271b45e5f04d2d1aec489b8960439c265513ea`) é ancestral da base; não é necessário force-push nem reescrever seu histórico.
- Destino autorizado: pull request **draft** de `max-dev` para `main`. Não houve autorização de merge ou implantação.
- Nenhum banco de desenvolvimento/produção foi usado, nenhuma migration foi executada nesses bancos e nenhum checkout existente com trabalho anterior foi alterado.

## Diagnóstico

A criação de projeto sem integração já funcionava. O fluxo posterior ainda exigia referência
GitHub para executar testes; sem execução FAIL não era possível registrar o defeito e seu reteste.
A projeção de requisito exigia Commit/PR mesmo com tarefas concluídas. Indicadores e Health também
precisavam distinguir indisponibilidade de integração, ausência de evidência e conclusão local.

Task CRUD/Kanban, cadastro de requisito e definição de caso de teste não exigiam GitHub e foram
preservados. Listas de artefatos vazias e sincronização indisponível sem integração continuam sendo
comportamentos intencionais, não erros disfarçados como métricas zero.

## Decisão funcional aprovada

A conclusão local legítima deve permanecer válida quando GitHub for conectado depois, com sua
origem explícita. Evidência local não conta como commit/PR. A decisão e seus limites estão no
[ADR-018](../architecture/ADR-018-STANDALONE-QUALITY-LIFECYCLE.md).

`Requirement.lifecycleBasis` é definida na criação canônica sob lock de Project:

- LOCAL: tarefas concluídas sustentam implementação; conclusão exige casos ativos relevantes,
  execução PASS da versão atual e ausência de defeitos pendentes
- GITHUB: preserva o critério anterior de evidência técnica real, além dos demais critérios
- A base é imutável no contrato HTTP; vincular GitHub não reabre automaticamente um requisito LOCAL
- Novos requisitos criados depois da vinculação recebem GITHUB
- Reabertura de tarefa, nova versão de teste, falha e defeito continuam invalidando conclusão quando
  aplicável; a preservação da origem não congela indefinidamente o status

## Mudanças realizadas

### Execução, evidências e defeitos

Projetos sem integração aceitam referência explícita `{type: "MANUAL", version: "versão testada"}`,
com trim e 1–200 caracteres. Não existe ID GitHub artificial. O snapshot imutável guarda type/version;
ambas as FKs técnicas ficam nulas. A elegibilidade é revalidada sob lock de Project, inclusive contra
corrida de vinculação. Projetos integrados continuam exigindo PR/Commit importado do próprio projeto.

Casos, histórico, detalhes e ponte de defeito/reteste apresentam a referência manual. Autoridade do
executor, CSRF, papel, projeto, versão atual, passos, resultado derivado e validação dos uploads
permanecem no backend. Conectar GitHub não altera snapshots manuais anteriores, mas novas execuções
nesse projeto seguem o contrato integrado.

### Projeções, métricas e Health

As projeções distinguem implementação pela base de lifecycle de implementação técnica. Matrizes,
grafos e detalhes exibem origem LOCAL/GITHUB e não fabricam arestas de artefatos técnicos. I65
consegue mostrar conclusão local e seu `sourceScope`; métricas técnicas preservam fatos e seus
critérios. Sem integração, indicadores exclusivamente GitHub permanecem UNAVAILABLE/null. Health
não penaliza ausência de GitHub como falha técnica; em projetos mistos, comparações técnicas usam a
coorte GITHUB explicitamente identificada. Valores residuais de commits não vazam para atividade
GitHub indisponível. Catálogos e contratos documentam limites e denominadores.

### Migrations e upgrade

Foram adicionadas, sem alterar migrations antigas:

1. `20261013170000_manual_test_execution_reference`: enum MANUAL e extensão do CHECK de exclusividade
   das FKs, mantendo as variantes PR/Commit
2. `20261013171000_requirement_lifecycle_basis`: base persistida, default GITHUB para escritores
   legados e classificação LOCAL apenas para requisitos em projetos sem integração

O segundo upgrade classifica a base e reconcilia macrostatus/estado/histórico em uma única transação
de dados. Usa casos ativos, execução mais recente da versão atual, relações diretas/por tarefa e a
prioridade canônica de falhas/defeitos. Requisitos GITHUB e histórico anterior não são reescritos.
Situação alterada recebe `LIFECYCLE_BASIS_MIGRATION`; primeira observação mantém
`BASELINE_INITIALIZED`; ambas registram versão 4, base LOCAL e motivo da migration nos metadados.
Ajuste apenas do macrostatus não inventa transição detalhada.

Para implantação futura, é necessário suspender escritores da aplicação/worker durante migration e
troca para o código novo. MySQL confirma DDL implicitamente: falha posterior exige inspeção e
recuperação operacional controlada; não repetir cegamente o DDL. Nenhum rollout foi feito aqui.

## Verificação executada

### Backend e estrutura

- Node.js **22.23.3**, linha exigida pela CI
- Suite unitária combinada: **99 arquivos / 1.043 testes aprovados**
- Lint backend, formatação, architecture check e secret scan aprovados
- Prisma Client gerado e schema validado; validação de schema não aplica migration
- Testes estruturais de CI, inventário de UI e política npm-audit: **90 aprovados**
- Testes focados de referência manual, schema/proveniência e contrato persistido incluídos
- Revisão independente do schema/serviço/SQL confirmou correspondência estática com a política;
  isso não substitui execução em MySQL

### Frontend

- Node.js **22.23.3**: lint, formatação e build aprovados
- Build mantém aviso de chunk maior que 500 kB, sem falha
- Testes focados cobrem versões manuais PASS/FAIL/BLOCKED, versão vazia, ponte FAIL → defeito,
  reteste PASS, origem de lifecycle, indicadores/Health e preservação do caminho PR/Commit
- Suite completa com cobertura: **120 arquivos / 1.508 testes aprovados**
- Cobertura: statements **86,19%**, branches **81,15%**, functions **82,01%**, lines **88,67%**
- Não houve homologação visual em navegador; o inventário registra essa limitação

## Verificação pendente de runtime/CI

O ambiente cloud permitiu obter Node 22 e o pacote oficial MySQL 8.4.8, mas o sistema operacional
impediu a criação dos sockets necessários ao servidor. Portanto:

- **Não foram executados** testes de API/integração com banco, aplicação das migrations, auditoria
  física de CHECK/FK nem cobertura completa do backend
- Os **37 casos** da suite API sem GitHub foram coletados com sucesso, com lint/sintaxe/formatação;
  coleta não conta como aprovação de comportamento
- O novo validador de upgrade descartável foi escrito e revisado estruturalmente, mas sua execução
  real depende da CI MySQL 8.4.8
- A CI possui etapa dedicada que aplica a cadeia anterior, popula cenários legados, aplica os SQLs
  novos completos e compara os resultados com a política pura. Inclui controle negativo de
  divergência e preservação de snapshots PR/Commit, coorte integrada e histórico
- Os cenários API exercitam criação local, teste FAIL, defeito, correção, reteste PASS, conclusão,
  conexão posterior real, preservação da base/histórico e criação integrada nova, além de controles
  de autorização, CSRF, referência estrangeira e versão obsoleta

Esta entrega não declara equivalência com CI nem prontidão para merge/produção. A PR deve permanecer
em draft até os gates de banco, upgrade e cobertura passarem e os achados de revisão serem resolvidos.

## Retorno da CI 142 e correção de collation

A [CI 142](https://github.com/iYoNuttxD/Traceflow/actions/runs/38436440843), no commit
`767cd88b478940dc1164ad66519c157ab6c6127c`, executou em MySQL e falhou na migration nova de
lifecycle com `P3018` / MySQL `1267`: comparação `<>` entre colunas com collations implícitas
`utf8mb4_unicode_ci` e `utf8mb4_general_ci`. Os outros quatro jobs foram aprovados, incluindo
Frontend Tests. Isso não constitui aprovação do backend nem do upgrade.

A tabela temporária de projeção usava CTAS e inferia a collation das expressões de texto a partir
da conexão. A correção declara explicitamente `situation` e `lifecycleStatus` como VARCHAR(32)
utf8mb4/unicode_ci antes do INSERT com CTE. Assim, tanto comparação de histórico/estado quanto
macrostatus usam a mesma collation das tabelas persistidas. As regras de situação, transação,
coorte LOCAL e histórico não foram alteradas; nenhuma migration histórica foi modificada.

Foi acrescentada regressão estrutural para as duas colunas. O validador de upgrade passa a criar
banco descartável com general_ci e verificar o cenário de collations incompatíveis antes de aplicar
os SQLs versionados corrigidos. A correção ainda exige nova execução de CI; não há alegação de
sucesso em MySQL local, e merge/deploy continuam fora do escopo.

Após a correção, a suite unitária backend completa foi repetida em Node 22.23.3: **99 arquivos /
1.044 testes aprovados**. Lint/formatação dos arquivos alterados também foram aprovados. Esses
resultados não substituem o reteste de migration e upgrade na CI.
