# PR #25 — correções PR25-01, V01 e V02 (24/10/2026)

Correção pontual sobre `8f5aaa3d762227cd67173b617280bab6ab3fc30c`, com destino
preservado **max-dev → daniel-dev**, base `6de5ece5e7af3a7edcd1c24f15f78f16d0b6ec0c`.
Implementação em worktree isolado; checkout original e suas demais worktrees preservados.
Sem acesso à OCI, alteração de privilégios produtivos, deploy ou merge da PR.

## Retificação visual após revisão do usuário

A primeira correção visual (`3402c239`) foi rejeitada: aplicou a compactação também
em Indicadores, fora do escopo pretendido, e colocou filtros expandidos na barra de
abas de Meu painel. A regra grid existente dessa toolbar fez os filtros disputarem
a linha com as abas. A inspeção anterior não cobriu adequadamente esse caso e não
serve como aprovação dessa distribuição.

A correção restaura o CSS compartilhado original de filtros e a toolbar original de
Indicadores. Os filtros voltam a ocupar largura total acima de abas e ações, tanto
em Geral quanto em Meu painel. Só a Visão Geral tem a barra ampla com personalização
e atualização à direita; os inputs expandidos continuam abaixo, em largura total.
No mobile, as ações ficam na linha seguinte. Remoção continua exclusivamente no editor.
Backend, migrations, cálculo de indicadores, API e preferências não foram alterados
nesta retificação.

[Registro da nova inspeção](evidence/pr25-review-20261024/ui-scope-correction.json).
Chrome com API real e MySQL sintético: 1440×900 e 390×844, claro/escuro, filtros abertos
e recolhidos, Indicadores/Meu painel e Visão Geral. Em desktop, a barra de filtros de
Indicadores tem 1104px e termina 24px antes da toolbar de abas; em mobile, tem 358px
e conserva a mesma separação. A Visão Geral reserva 228px para ações no desktop,
com toggle de aproximadamente 858px. Não houve overflow horizontal da página.
Remover, rascunho, cancelar, foco no opener, nova fixação, período/limpeza e abas por
teclado foram exercitados. A exportação das capturas continua indisponível (EPERM);
as imagens foram inspecionadas na sessão e as medidas estão versionadas.

Validação desta retificação: 121 testes direcionados; frontend completo com
**1.885 PASS / 152 arquivos**, cobertura **87,13% / 81,60% / 83,27% / 89,39%**
(statements/branches/functions/lines), lint, formatação e build aprovados. Nenhum
threshold, skip ou waiver adicionado. A CI do novo SHA é registrada na descrição da
PR; o resultado da CI #207 pertence ao head anterior e não aprova esta retificação.

## PR25-01 — causa e solução

`CREATE TEMPORARY TABLE` requer um privilégio ausente no migrador OCI. O teste antigo
usava administração e não reproduzia esse contrato. A migration corrigida usa CTEs
para inserir somente transições reais e reconciliar o estado; o status é derivado do
estado na mesma transação DML. Mantém a collation `utf8mb4_unicode_ci`, o backfill LOCAL
somente para projetos sem integração e os requisitos integrados em GITHUB, inclusive
integrações desconectadas. Não fabrica evidência técnica nem altera execuções anteriores.

O ALTER inicial é DDL com commit implícito. Seu efeito não é desfeito pelo rollback da
reconciliação. O [runbook de laboratório](../runbooks/PR25_MIGRATION_RECOVERY_LAB.md)
registra o diagnóstico, roll-forward verificado e os checksums antigo/corrigido.
As 84 migrations produtivas permanecem byte a byte iguais ao manifesto da base exata.

## Upgrade, preservação e recuperação

[Resultado estruturado local](evidence/pr25-review-20261024/migrations-local.json).

| Cenário | Base → final | Conta do upgrade | Resultado |
| --- | --- | --- | --- |
| Base exata populada | 84 → 86 | Sete privilégios | PASS, status atualizado, drift zero |
| Base sem dados de domínio | 84 → 86 | Sete privilégios | PASS, zero transições artificiais |
| Migration parcial reproduzida | 85 concluídas + 86 incompleta → 86 | Sete privilégios | PASS, recuperação validada |

A conta sintética possui exatamente SELECT, INSERT, UPDATE, CREATE, ALTER, INDEX e
REFERENCES nos schemas próprios, além de USAGE global sem permissões extras. O teste
confere SHOW GRANTS e CURRENT_USER; todos os deploys incrementais usam essa conta.
Administração é usada somente na preparação da base histórica/conta e na limpeza
exclusiva dos recursos criados. Fixtures, snapshots, comparação canônica e todas as
verificações de preservação usam também a conta restrita. A cadeia histórica contém DROP/DELETE anteriores ao
contrato OCI; o teste não afirma que o bootstrap dessas 84 migrations pode rodar com
os sete privilégios. No controle vazio, apenas o schema da base existe, sem dados.

Os 26 cenários cobrem tarefas sem conclusão, concluídas, sem tarefas, casos inativos
ou excluídos, versões antigas, execução mais recente por data/id, PASS/FAIL/BLOCKED,
defeitos abertos/em correção/aguardando reteste/validados, retestes PASS/FAIL/BLOCKED,
vínculos diretos/ORIGIN/CORRECTION e deduplicação de vínculos. Os resultados são
comparados com `projectRequirement`, a projeção canônica do backend.

Por cenário populado, 26 execuções e 25 entradas históricas antigas foram preservadas
integralmente; 22 transições/baselines reais foram acrescentados. Snapshots de 70 tabelas
confirmam preservação de tarefas, execuções/passos, defeitos, retestes/histórico e
artefatos; campos imutáveis de requisitos e estado integrado também são comparados.
O redeploy não duplica histórico.

O cenário parcial usa a SQL antiga real e exige P3018/1044, coluna presente e registro
Prisma sem finished_at. Um segundo erro deliberado após inserir histórico comprova o
rollback conjunto de basis, estado e histórico. Só depois do roll-forward, comparação
canônica e drift zero é executado `migrate resolve --applied` no laboratório, pela conta
restrita. A tentativa falha permanece auditável. Não há reset ou edição manual do
histórico Prisma e nada desse procedimento foi executado em produção.

`db:test:validate-restricted` integra obrigatoriamente Backend Tests, e a política de CI
falha se o gate for retirado. Novas migrations fora do manifesto também são executadas
pela conta limitada. A versão local informa MySQL 26.10.0; a CI usa o MySQL 8.4.8 fixado.
O resultado remoto deve ser conferido no novo SHA, sem reutilizar checks anteriores.

## V01 e V02

- Removida a ação externa e seu handler duplicado. O DashboardEditor existente é o único
  caminho de remoção; preserva PATCH exclusivo da flag, permissões e preferências.
- Personalizar painel está disponível na Overview fixada. Após remover, widgets saem e
  o rascunho fica no editor; o mesmo opener permanece nesta visita para devolver foco e
  permitir nova fixação. Cancelar não salva o rascunho. Nova visita sem pin oculta o painel.
- Falha de catálogo mantém a remoção no mesmo editor, com edição indisponível para não
  sobrescrever widgets desconhecidos. Loading, erro, retry e sucesso mantêm seus fluxos.
- Somente na Visão Geral, a barra ampla de filtros reserva espaço à direita para
  personalização e atualização. Em Indicadores, os filtros mantêm o layout anterior
  acima da toolbar de abas. Campos expandidos usam toda a largura. Mobile quebra
  linha sem reduzir alvos/fontes. Nenhuma regra de cálculo foi modificada.

## Inspeção anterior da interface (histórico; retificada acima)

[Registro de medições e interações](evidence/pr25-review-20261024/ui-inspection.json).
Chrome autenticado, API real e schema sintético separado dos testes automáticos.

| Viewport | Temas | Medições e fluxo |
| --- | --- | --- |
| 1440×900 | Claro/escuro | scrollWidth 1440; controles alinhados com 44px; datas 344px e Sprint 334px |
| 390×844 | Claro/escuro | scrollWidth 390; controles em duas linhas, 44px; datas 156px e Sprint 324px; modal sem overflow horizontal |

Verificados painel fixado/não fixado, editor, remoção, rascunho, cancelar e retorno ao
mesmo opener, nova fixação, abrir/recolher filtros, aplicar/limpar período e Sprint,
alternância de abas por setas/Home/End. Capturas foram inspecionadas na sessão; o
filesystem somente leitura da ferramenta de navegador impediu sua exportação para
arquivos. As medições e resultados estão versionados. Esta é inspeção técnica, não
aprovação visual humana. Dispositivos físicos e outros navegadores não foram certificados.

## Validação local anterior (backend preservado; frontend retificado acima)

- Instalação limpa por lockfile, Node 22.23.3; nenhum lockfile ou threshold alterado.
- Backend completo uma vez: **3.481 PASS, os mesmos 5 skips legados**, 270 arquivos
  aprovados/2 skipped, 413,60s. Cobertura: **93,92% statements / 88,98% branches /
  96,27% functions / 95,79% lines**.
- Frontend completo uma vez: **1.884 PASS / 152 arquivos**, 53,19s. Cobertura:
  **87,11% statements / 81,60% branches / 83,27% functions / 89,37% lines**.
- Direcionados: 120 casos UI antes das duas regressões adicionais da suíte final;
  411 casos backend funcionais e 41 casos de contrato/API standalone aprovados.
  A assertion antiga de tabela temporária foi substituída pelo contrato corrigido.
- Lint/formatação backend e frontend, Prisma validate/generate, arquitetura, scanner de
  segredos e 91 testes de políticas/inventário/auditoria aprovados.
- Build frontend aprovado; mantém avisos existentes de imports dinâmicos e diretivas.
  Auditorias backend/frontend: zero high/critical e nenhuma exceção utilizada.
- Laboratórios restrito e histórico, política de CI e checagem final de diff registrados
  nos logs locais. O gate remoto confirma a compatibilidade com MySQL 8.4.8.

## Revisão remota

Os commits desta correção atualizam max-dev sem merge. A descrição da PR registra o
SHA final e os links dos cinco checks novos (Quality, Backend Tests, Frontend Tests,
Supply Chain e Dependency Review). Checks anteriores não aprovam esta revisão.
