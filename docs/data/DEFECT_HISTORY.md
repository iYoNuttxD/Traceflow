# Defeitos, correções e retestes — S1-08 backend

## Autoridade e fronteira

`Route → Controller → Service → Repository → Prisma → MySQL`. Defect pertence a
um Project e é distinto de Task e GitHub Issue. S1-08 entrega a fundação backend;
a interface de Defeitos, diferenciação visual de Task e atalhos de criação de
TestCase continuam pendentes. S1-09 não é entregue aqui.

## Detecção e rastreabilidade

Defect tem ID inteiro com `displayId: DEF-<id>`, título, descrição, severidade
`BAIXA | MEDIA | ALTA | CRITICA`, responsável com membership ativa, datas do
servidor, revisão otimista, ciclo corrente e projeção persistida de status.

`detectedExecutionStepId` é obrigatório e imutável. Somente passo persistido
`FAIL` do mesmo projeto é aceito. PASS/BLOCKED não originam Defect. Vários
defeitos podem apontar ao mesmo passo. O candidato apresenta execução, referência
testada, passo e evidências históricas. Requirement e Tasks sugeridos vêm apenas
de `TestExecution.version.snapshotJson`, mesmo que a definição atual tenha mudado.
Sugestões não são gravadas automaticamente: o cliente confirma os vínculos próprios.
Vínculos históricos que já não existam não são recriados para satisfazer o cadastro.

A própria rastreabilidade do Defect exige `requirementId != null` OU ao menos uma
ORIGIN Task. Requirement é singular opcional; todas as Tasks são do mesmo Project.
Editar os vínculos não altera TestCase, versão executada ou outros defeitos.
Task continua tendo **0..1 Requirement**; múltiplos requisitos por Task não foram
implementados e não são necessários. Não há sincronização automática de vínculos.

## Relações e ciclos

`DefectTask` usa ORIGIN/CORRECTION. ORIGIN guarda `correctionCycle = 0` como
sentinela de armazenamento, sem pertencer a um ciclo de correção. CORRECTION usa
ciclo positivo. CHECKs e unicidade composta protegem forma e duplicação da relação.
Uma Task nunca pode ser ORIGIN e CORRECTION do mesmo Defect, inclusive entre ciclos.
Pode corrigir vários defeitos. A mesma correção pode ser explicitamente vinculada
novamente em ciclo posterior; a relação anterior permanece.

Criar Task + vincular CORRECTION ocorre na mesma transação. A preparação e a
persistência reutilizam a implementação de Task, incluindo validação de responsável,
requisito, recálculo de Requirement e auditoria. Quando omitido, requirementId da
Task recebe o requisito do Defect; `null` explícito permanece sem requisito.
A Task é normal, inicia A_FAZER, aparece no Kanban e mantém identidade após excluir
o Defect. O DTO compartilhado de Task inclui `correctionDefectCount` e
`correctionDefects: [{id,displayId,title,status,deletedAt}]`, distintos por Defect,
sem uma consulta adicional por Task. Inclui ciclos anteriores e defeitos excluídos.

## Projeção persistida

Somente CORRECTION Tasks do ciclo corrente determinam o estado operacional:

| Condição                                                       | Status                          |
| -------------------------------------------------------------- | ------------------------------- |
| Nenhuma Task ou todas A_FAZER                                  | ABERTO                          |
| Qualquer composição que não seja todas A_FAZER/todas CONCLUIDO | EM_CORRECAO                     |
| Pelo menos uma Task, todas CONCLUIDO                           | AGUARDANDO_RETESTE              |
| Reteste contextual PASS no ciclo corrente                      | VALIDADO                        |
| Reteste contextual FAIL                                        | ABERTO, ciclo + 1               |
| Reteste contextual BLOCKED                                     | AGUARDANDO_RETESTE, mesmo ciclo |

ORIGIN e ciclos anteriores não participam. A decisão desta fase é manter VALIDADO
após PASS explícito, mesmo se uma Task compartilhada voltar de coluna. Novas
correções em Defect validado são rejeitadas. Não há endpoint manual de status.
`statusReason` informa total, TODO, em andamento, DONE e execução validadora.
Listas e filtros usam a projeção persistida; o backend reconcilia movimentação,
status e histórico na mesma transação. O cliente não calcula o status.

## Reteste e concorrência

Reteste usa o mesmo endpoint multipart, TestExecution, TestExecutionStep e storage
de evidências de S1-07. O payload opcional `retest` contém `defectId`,
`correctionCycle`, `expectedRevision`. Deve usar o mesmo TestCase da detecção,
ativo, na versão atual, e o defeito precisa estar AGUARDANDO_RETESTE. Uma execução
comum, inclusive PASS, não afeta Defect.

DefectRetest relaciona uma execução única ao defeito/ciclo; o resultado permanece
na execução, sem duplicação. FAIL não reabre Tasks antigas: abre um ciclo vazio.
BLOCKED também incrementa revisão, invalidando uma segunda tentativa concorrente.
Referências de reteste priorizam PRs/commits persistidos das correções do ciclo
corrente e depois os demais do projeto, sem chamar GitHub.

Todas as mutações de Defect e retestes bloqueiam Project antes de Defect e TestCase.
Criação/edição/exclusão de TestCase e execuções comuns também bloqueiam Project
primeiro, evitando inversão com os locks implícitos das FKs de execução/histórico.
Task movement já bloqueia Project → Sprint → Task; a projeção de Defect é um
repository folha, sem importar services. O Project comum serializa os caminhos,
evita ciclo entre locks de Task/Defect e protege status/reteste/ciclo. Revisão e
ciclo são conferidos dentro da transação. Primeiro commit vence retestes com o
mesmo contexto; perdedor retorna `409 DEFECT_CONFLICT`. Testes incluem callbacks
concorrentes sob barreira real de Project, sem sleeps.

## Histórico, exclusão e autorização

DefectHistoryEntry registra criação, campos alterados com antes/depois,
responsável, severidade, rastreabilidade, correção criada/vinculada, transição com
from/to/reason, reteste, validação, abertura de ciclo e exclusão. Não há DefectVersion.
Histórico e retestes possuem endpoints paginados. A auditoria técnica usa o
minimizador compartilhado; histórico funcional pertence ao projeto.

DELETE é soft delete e oculta o Defect operacionalmente. Não apaga Task, versão,
execução, evidência, reteste, relação ou histórico. Relações críticas usam RESTRICT;
actor histórico usa SET NULL. Excluir Task que participa de Defect, mesmo excluído,
retorna `409 TASK_REFERENCED_BY_DEFECT` e preserva todo seu conteúdo.

VIEWER pode ler; MEMBER, MANAGER e OWNER podem ler/escrever. Não há restrição ao
criador ou responsável para membros com escrita. Sem membership ativa ou em outro
projeto, recursos retornam 404. CSRF segue o middleware existente antes do upload.
Downloads continuam no endpoint autenticado de evidência; nenhum storageKey é exposto.

## Migração e limites

Migration incremental `20260908190000_s108_defect_foundation` adiciona quatro
tabelas, FKs, índices e CHECKs para ciclos/revisão. Não reescreve migrations anteriores,
não modifica dados legados e não atribui rastreabilidade artificial. Auditoria local
de TestCase não excluído: 1 registro, 0 órfãos na execução de 2026-09-08.
As validações mutáveis usam exclusivamente um schema descartável distinto do banco
de desenvolvimento. MySQL local 9.7.1 não comprova compatibilidade executada em
MySQL 8.4.8; CI remoto permanece uma etapa separada.
