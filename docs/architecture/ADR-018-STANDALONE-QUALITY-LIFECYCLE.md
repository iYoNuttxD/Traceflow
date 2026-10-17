# ADR-018 — Qualidade e proveniência em projetos sem GitHub

- **Status:** aceito para implementação local; preservação da conclusão local confirmada em 13/10/2026.
- **Data:** 13/10/2026.
- **Escopo:** correções do fluxo sem GitHub na branch `max-dev`; não autoriza implantação.

## Contexto

A criação sem GitHub já é suportada. Contudo, a execução de um caso de teste exigia um Commit ou
PullRequest importado, impedindo o registro de resultados e, por consequência, a detecção e o
reteste de defeitos em projetos locais. Remover somente a validação da interface violaria o
contrato e a restrição de integridade persistida.

## Decisão: referência manual explícita

Uma execução em projeto sem `ProjectGitHubIntegration` pode usar
`testedReference: {type: "MANUAL", version: "identificação da versão testada"}`. `version` é
obrigatória, normalizada com trim e limitada a 200 caracteres. Não aceita ID, URL ou outros campos.
Não se cria Commit, PullRequest ou Issue fictício. Não se interpreta essa identificação como
hash, evidência técnica sincronizada ou vínculo GitHub.

Projetos integrados preservam a exigência existente de Commit/PullRequest importado do mesmo
projeto, inclusive quando a integração está desconectada ou requer reconexão. O serviço valida a
ausência da integração novamente sob o lock do Project, compartilhado com a vinculação GitHub;
a capability da interface não concede autoridade e pode ficar desatualizada.

`TestedReferenceType` recebe `MANUAL`. A migration incremental amplia a restrição XOR existente:
MANUAL exige ambas as FKs nulas, enquanto as alternativas importadas preservam exatamente uma FK.
A identificação manual fica no snapshot imutável `{type, version}`; não exige nova entidade.
Histórico, evidências, detalhes e retestes continuam a usar snapshots. Vincular GitHub depois não
reescreve, apaga nem converte referências manuais históricas; novas execuções seguem a configuração
vigente. As regras de membro, versão atual, passos, resultado derivado, upload e auditoria não mudam.

O detalhe do caso expõe `capabilities.canUseManualReference` para membros com escrita, caso ativo e
projeto sem integração. O catálogo de referências expõe `manualReferenceAllowed`; seus `items`
continuam contendo somente referências importadas. Ausência de referência não implica MANUAL:
o executor deve identificar explicitamente a versão testada.

## Decisão: base imutável do lifecycle do Requirement

`Requirement.lifecycleBasis` é `LOCAL` ou `GITHUB`, definida na criação sob o lock do Project
pela ausência ou presença da integração. Não é editável pelo payload. O default físico GITHUB
preserva consumidores legados; a migration classifica como LOCAL requisitos existentes em projetos
sem integração. A leitura nunca infere essa base novamente a partir do estado atual do projeto.

LOCAL exige ao menos uma tarefa e todas concluídas para implementação; GITHUB mantém adicionalmente
a exigência de Commit/PR real. Ambos exigem casos ativos relevantes não vazios, todos PASS na versão
atual e nenhum defeito pendente para concluir. Falhas, reabertura de tarefas, novas versões e retestes
seguem as regras canônicas. Vincular GitHub depois não muda a base, não reabre requisitos locais e
não transforma evidência manual em código; novos requisitos após a vinculação recebem GITHUB.

A projeção distingue `implementation.basis`, `implementation.implemented` (critério da base) e
`implementation.technicalImplemented` (tarefas concluídas com Commit/PR real). Evidência técnica
continua booleana e factual. Evidência de correção LOCAL exige tarefa de correção concluída no ciclo
e reteste desse ciclo, identificada por `evidence.correctionBasis`; não fabrica artefato técnico.

I65 usa conclusão canônica por base e expõe `sourceScope: LOCAL | GITHUB | MIXED`. Freshness GitHub
só se aplica quando requisitos GITHUB contribuem. I62/I66 preservam numeradores técnicos e denominador
global; sem integração permanecem UNAVAILABLE/null. Health mantém neutras comparações técnicas sem
integração. Em projetos com requisitos LOCAL, comparações técnicas de Health usam somente a coorte
GITHUB, explicitamente identificada; coorte vazia não é penalidade e fica fora dos pesos aplicáveis.
Projetos exclusivamente GITHUB preservam as comparações e fórmulas anteriores.

## Alternativas rejeitadas

- Omitir a referência silenciosamente: perde a identificação do objeto testado e o contrato imutável.
- Criar artefato técnico fictício: contamina rastreabilidade, indicadores e histórico.
- Liberar MANUAL globalmente: muda sem necessidade os critérios de projetos já integrados.
- Usar apenas o estado da UI: permite corrida com vinculação e requisição direta fora do contrato.

## Verificação exigida

Testes de schema, serviço e API devem cobrir metadados manuais válidos/inválidos, preservação do
contrato PR/Commit, rejeição em projeto integrado e de artefato de outro projeto, autenticação,
CSRF, papéis, versão obsoleta, fluxo FAIL → defeito → correção → reteste PASS e leitura histórica
após ligação. Aplicação da migration e integridade física exigem MySQL isolado de teste; uma análise
estática ou execução unitária não é equivalente à validação de banco ou à CI completa.

## Upgrade e falhas de migration

O rollout deve suspender escritores da aplicação durante a migration e a troca para o novo código,
para que escritores legados não criem requisitos locais com o default de compatibilidade.
A migration de lifecycle adiciona a coluna e, em uma única transação de dados, classifica a coorte
LOCAL e recalcula `Requirement.status` e `RequirementTraceabilityState` pelas regras de versão 4.
A agregação usa casos ativos, execução mais recente da versão atual, vínculos diretos/por Task e
prioridade canônica de defeitos. Não depende de uma futura mutação do usuário para corrigir status.
Requisitos GITHUB e entradas históricas existentes não são atualizados. Somente situação alterada
ou estado anteriormente ausente acrescenta histórico: transição usa `LIFECYCLE_BASIS_MIGRATION`,
primeira observação preserva `BASELINE_INITIALIZED`. Ambos registram versão 4, base LOCAL e
`migrationReason: LIFECYCLE_BASIS_MIGRATION` nos metadados; ajuste apenas do macrostatus não inventa transição detalhada.

MySQL confirma DDL implicitamente: se a etapa de dados falhar, a nova coluna pode existir, mas
classificação, status, estado e novos eventos revertem juntos. A migration deve ser marcada como
falha e bloquear rollout. Não repetir cegamente a adição da coluna nem remover histórico para
forçar sucesso. A recuperação exige inspeção do schema e do registro Prisma pelo responsável
operacional, correção da causa e reconciliação controlada da migration; não há reparo automático
em banco de desenvolvimento/produção nesta mudança. A etapa de dados é idempotente em estado
inalterado (o histórico só recebe transições novas), mas essa propriedade não torna o DDL inteiro
reexecutável. A validação de upgrade deve executar o SQL completo sobre fixture de schema anterior
e comparar situações/status/histórico com a política JavaScript, além da cadeia vazia.
