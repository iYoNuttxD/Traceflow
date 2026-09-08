# Histórico e evidências de casos de teste — S1-07

## Autoridade e camadas

`Route → Controller → Service → Repository → Prisma → MySQL`. O módulo `testCases`
possui services de definição e execução, repositories próprios e o contrato
`TestEvidenceStorage`, implementado por `LocalTestEvidenceStorage`. Nenhum arquivo
é servido por `express.static`; não há integração com OCI nem chamada ao GitHub
para registrar execução ou selecionar referências já importadas.

## Definição atual e versões

`TestCase` pertence obrigatoriamente a um Project. Tem status `ATIVO | INATIVO`,
responsável obrigatório com ProjectMembership ativa, requisito opcional singular,
0–100 Tasks do mesmo projeto por `TestCaseTask`, e 1–100 passos ordenados.
Responsável segue a política de membership ativa usada em Task, inclusive VIEWER.
O executor é um membro com escrita, independentemente do responsável.

A definição inicia em `currentVersion = 1`. Título, descrição, pré-condições,
resultado esperado, texto/ordem dos passos, requisito e conjunto de Tasks criam
uma nova versão. Espaços externos são normalizados, Task IDs são ordenados como
conjunto e duplicatas são rejeitadas. No-op, responsável e status não criam versão.
PUT aceita atualização parcial; campos omitidos permanecem como estavam.

`TestCaseVersion` é única por `(testCaseId, version)`; `snapshotVersion = 1` e
`snapshotJson.schemaVersion = 1`. Snapshot autocontido:

```json
{
  "schemaVersion": 1,
  "title": "Título",
  "description": null,
  "preconditions": "Pré-condições",
  "expectedResult": "Resultado geral",
  "requirement": { "id": 4, "title": "Título capturado" },
  "tasks": [{ "id": 9, "title": "Título capturado" }],
  "steps": [{ "position": 1, "action": "Ação", "expectedResult": "Resultado" }]
}
```

`requirement` pode ser null e `tasks` pode ser vazio. Histórico não consulta títulos
atuais para reconstruir definição. Exclusão física de Requirement remove o ponteiro
atual por SET NULL; exclusão física de Task remove seu join atual. Essas operações
legadas não alteram snapshots anteriores. A próxima alteração explícita da definição
captura seus vínculos atuais. Os modelos históricos não têm cascade destrutivo do caso.

## Concorrência e exclusão

PUT e PATCH status exigem `expectedVersion`; execução exige `testCaseVersion`.
A transação READ COMMITTED adquire `SELECT ... FOR UPDATE` do TestCase, lê estado
atual e compara versão. Divergência: `409 TEST_CASE_VERSION_CONFLICT`. Edição,
status, exclusão e execução usam a mesma linha de lock. Dois editores de definição
com a mesma versão produzem uma versão nova e um conflito. Como status/responsável
não incrementam a versão, duas mudanças apenas administrativas são serializadas,
sem inventar um conflito de definição.

DELETE define `deletedAt/deletedById` e grava histórico/auditoria na mesma transação.
Listas, detalhes correntes, versões/histórico pelo caso e novas execuções retornam
404 para tombstones. Execuções existentes por ID e seus downloads continuam
acessíveis a membros ativos. Não há restauração ou exclusão física de evidências
pelo DELETE do caso.

## Execução imutável

`TestExecution` referencia a versão por FK e registra o número da versão. Ambiente:
`LOCAL | DESENVOLVIMENTO | HOMOLOGACAO`. A referência principal é exatamente uma
PullRequest OU Commit importado do projeto; discriminator/FKs têm CHECK de XOR.
O snapshot guarda PR id/number/title/state/githubUrl ou Commit
id/hash/shortHash/message/authorName/date/githubUrl, sem e-mail.

`executedByUserId` vem da sessão e `executedByDisplayNameSnapshot` do nome da conta;
`executedAt/createdAt` são timestamps do banco. O payload não aceita autor, horário
ou resultado geral. Cada posição da versão deve aparecer exatamente uma vez.
Texto do passo e resultado esperado são copiados da versão, nunca do cliente.
FAIL/BLOCKED exigem observação; PASS permite observação opcional.
Resultado puro: qualquer FAIL → FAIL; senão qualquer BLOCKED → BLOCKED; senão PASS.
FAIL não cria defeito. Não há reteste ou entidade S1-08.

Detalhe de execução usa exclusivamente sua versão, resultados, snapshot técnico
e identidade de exibição capturada. Edições futuras, sync de PR/Commit e mudança
normal do nome do usuário não reescrevem execução.

## Evidências privadas e limites

`TEST_EVIDENCE_STORAGE_DIR` define diretório privado. Em produção deve ser absoluto,
legível/gravável e fora de frontend/public/dist. Não há fallback em produção.
Desenvolvimento usa `backend/.data/test-evidence`, ignorado pelo Git. Componentes
simbólicos do caminho são recusados; abertura usa `O_NOFOLLOW`, nome interno UUID
e criação exclusiva, modo 0600 (diretórios 0700). Operador deve manter a raiz
privada sob controle do processo; verificações de caminho não substituem ACLs do SO.

| Destino  | Formatos                            |
| -------- | ----------------------------------- |
| Passo    | PNG, JPG/JPEG, WEBP, MP4, WEBM, MOV |
| Execução | todos acima + PDF, TXT, LOG, JSON   |

Validação combina extensão permitida e detecção binária `file-type`; texto deve
ser UTF-8 sem controles binários e JSON deve ser parseável. Conteúdo ativo HTML/SVG
mascarado como texto é recusado. Não equivale a antivírus ou decodificação completa
de imagem/vídeo. MIME do cliente nunca decide tipo persistido.

| Limite padrão      |   Valor | Variável opcional               |
| ------------------ | ------: | ------------------------------- |
| arquivo não vídeo  |  10 MiB | `TEST_EVIDENCE_MAX_FILE_BYTES`  |
| vídeo              |  50 MiB | `TEST_EVIDENCE_MAX_VIDEO_BYTES` |
| arquivos por passo |       3 | `TEST_EVIDENCE_MAX_PER_STEP`    |
| arquivos gerais    |       5 | `TEST_EVIDENCE_MAX_GENERAL`     |
| arquivos totais    |      20 | `TEST_EVIDENCE_MAX_FILES`       |
| bytes totais       | 100 MiB | `TEST_EVIDENCE_MAX_TOTAL_BYTES` |

Overrides podem reduzir esses limites; valores acima do teto são recusados.
MiB = 1024² bytes, limites inclusivos. O parser limita arquivos/partes/campos e
6 MiB de payload JSON antes de aceitação; contador de bytes também limita o stream
por arquivo e por tentativa. SHA-256 hexadecimal é calculado sobre bytes que serão
persistidos. Nome original é sanitizado e nunca compõe caminho ou chave de storage.

Fluxo: autenticação/CSRF/RBAC → staging privado → validação/hash → promoção local
→ transação/lock/revalidação → execução/passos/metadados/auditoria → commit.
Upload, hashing e leitura de arquivos não ocorrem sob lock de banco.
Falha conhecida remove staging e arquivos promovidos somente daquela tentativa.
Se o banco falhar, execução e filhos são revertidos e arquivos compensados.
Após commit, falha de limpeza de staging é registrada sem converter sucesso em
falha de negócio. Queda abrupta entre promoção e commit pode deixar órfãos: não
há transação distribuída nem coletor automático nesta entrega. Reconciliação
operacional deve conferir chaves no banco, tentativas em curso e idade antes de
remover qualquer arquivo; nunca executar sweep cego.

Download revalida membership ativa pelo Project da evidência, inclusive VIEWER,
e usa stream privado com Content-Type validado, Content-Length, Content-Disposition
attachment com nome UTF-8 codificado e `X-Content-Type-Options: nosniff`.
Chaves/caminhos não aparecem no DTO nem em headers. Range de vídeo não é suportado.

## Trilhas e privacidade

- `TestCaseHistoryEntry`: CREATED, VERSION_CREATED, STATUS_CHANGED,
  RESPONSIBLE_CHANGED, DELETED; metadados mínimos de campos, versões e mudança de
  responsável com id/nome capturado.
- `TestCaseVersion`: definição autocontida imutável.
- `TestExecution`: ocorrência histórica, resultados e referência testada.
- `AuditEvent`: evento transversal minimizado, escrito pelo adapter canônico na
  mesma transação. Não armazena descrição, passos, observações ou bytes.

Retenção técnica: ciclo do projeto, sem novo expurgo automático. A anonimização
canônica neutraliza nome capturado do executor e nomes identificáveis do histórico
de responsável; mantém IDs ligados à conta pseudonimizada, definição, resultados e
arquivos. Essa neutralização é a exceção explícita à imutabilidade de exibição.
Conteúdo livre, nomes originais e snapshots de autor externo de Commit podem conter
PII que não é identificável com segurança apenas pelo nome; exigem revisão humana
conforme finalidade e política operacional. Não há promessa de remoção universal
de PII nem conclusão jurídica de conformidade.

Exportação pessoal inclui os próprios casos sob responsabilidade, próprias
execuções e metadados dos próprios uploads, somente de projetos com membership ativa.
Não exporta bytes, storage keys, observações ou dados desnecessários de terceiros.
