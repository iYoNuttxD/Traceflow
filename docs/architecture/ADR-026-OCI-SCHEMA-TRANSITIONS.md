# ADR-026 — Promoção OCI com transição explícita de schema

Estado: implementação e homologação em andamento; execução produtiva depende do GO desta entrega.

## Contrato

A instalação limpa continua usando a CD pull/OIDC e o ambiente `production`. Uma mudança de
schema exige um plano protegido aprovado, vinculado ao SHA da aplicação, schemas de origem e
alvo, listas completas de migrations e checksums, migrations adicionais, prova do upgrade
isolado, backup externo e restore do mesmo conjunto. O hash do plano integra o request OIDC.
Ausência de plano mantém o contrato de promoção sem mudança de schema.

A cadeia aplicada é um conjunto de nomes únicos com checksums exatos, nunca uma quantidade
fixa nem somente um prefixo cronológico: as 16 migrations desta união têm datas anteriores à
última migration já aplicada. Nomes removidos, duplicados, falhas, rollbacks e alterações de
checksum recusam a operação. A homologação cria a cadeia publicada e aplica a união pelo
Prisma 6.12.0, verificando dados anteriores, preenchimentos e integridade referencial.

`prisma migrate deploy` é executado uma vez, pelo CLI imutável do pacote. A credencial migradora
é específica, root/systemd, restrita a `traceflow_live` e à origem privada. O backup continua
SELECT-only. TLS estrito, CA existente, pool de comando de até duas conexões e advisory lock
Prisma permanecem obrigatórios. O deploy e o backup usam os locks operacionais existentes.
Não há download de CLI nem `migrate dev/reset/resolve` na OCI.

## Compatibilidade e falhas

Antes do DDL, a API e o worker anteriores drenam e param para impedir que o binário antigo
crie vínculos durante os preenchimentos históricos. Essa breve suspensão da API faz parte do
GO produtivo; Nginx, frontend e controles operacionais permanecem instalados. A transição é
persistida antes de iniciar o comando exclusivo. Seu request não pode ser reaproveitado.

Falha ou interrupção durante DDL deixa uma evidência terminal e exige intervenção. Não se
executa down migration, restore, limpeza do histórico nem segunda tentativa automática.
Uma saída 0 só é aceita após conferir novamente toda a cadeia aplicada e o schema observado.
Depois da transição integral, o retorno ao binário anterior só é permitido se sua compatibilidade
com o schema alvo tiver sido demonstrada e aprovada no mesmo plano. O schema permanece atualizado.
Caso contrário, a CD preserva o estado para recuperação específica.

## Operação

O backup aceita contratos explícitos de schema, com cadeia completa, quantidade de tabelas e
FKs comprovadas na homologação, mantendo checksums e recuperação. A configuração pode conter
origem e alvo durante a promoção; não aceita um schema desconhecido nem substitui a política
legada. A captura registra a identidade efetiva do schema separada da versão da aplicação.

O plano root e seus documentos de prova são preparados antes da publicação. O GO único aprova
as identidades finais, a atualização mínima da autoridade CD, a custódia migradora, a suspensão
breve e a estratégia de recuperação. A aprovação humana do ambiente GitHub continua obrigatória.
Nenhum resultado de simulação é evidência de produção.

## Referências

- [Prisma 6: desenvolvimento e produção](https://docs.prisma.io/docs/orm/v6/prisma-migrate/workflows/development-and-production).
- [ADR-024: conexões, recuperação e jobs](ADR-024-OPERACAO-CONEXOES-RECUPERACAO-E-JOBS.md).
- [CD da instalação limpa](../runbooks/OCI_CONTINUOUS_DEPLOYMENT.md).

O Prisma não detecta todo drift nem toda migration aplicada ausente em `migrate deploy`;
essas recusas pertencem ao preflight da CD. DDL MySQL não oferece rollback transacional geral.


Quando o binário anterior retorna sobre o schema expandido já concluído, o contrato de backup
registra explicitamente esse commit e seu schema em `compatiblePriorApplications`. O backup
conserva a identidade real do binário e a identidade separada do schema capturado; não exige
que o binário antigo finja ter recebido migrations novas. Novos binários com o mesmo schema
exato continuam elegíveis. Uma falha após DDL não autoriza outro deploy automático: o operador
precisa revisar o recibo da transição e a cadeia real antes de preparar uma nova operação.


A unidade migradora é separada para limitar a credencial, mas usa `BindsTo` e `PartOf` da
unidade CD. Não se usa `After` do pai oneshot: ele ainda está ativando enquanto aguarda o
filho. Um ensaio nativo confirmou que parar somente o pai, sem esse vínculo, deixava o filho
ativo; a configuração vinculada encerrou ambos. A falha também solicita stop exclusivo do
migrador desta execução, nunca KILL geral no banco. O sandbox efetivo, credencial sintética e
SELinux Enforcing foram exercitados na VM sem iniciar serviços da aplicação.

Um marcador próprio da CD impede que backup e retenção iniciem durante uma transição de
schema. Não é o guard legado. As duas unidades recebem somente `ConditionPathExists` para
esse marcador. A retenção deve estar inativa antes da parada de API/worker. O marcador é
exclusivo e somente a execução proprietária pode removê-lo após conclusão ou recuperação
comprovada; falha parcial de DDL o preserva e gera alerta de intervenção.

Antes e depois do DDL, com escritores parados, um dump SELECT-only em memória anônima
(`memfd`, limite 512 MiB, swap/core desabilitados) verifica os hashes e contagens de todos os
dados anteriores e os hashes dos registros históricos completos do Prisma. Não persiste SQL
ou valores de negócio. O caminho real foi exercitado na OCI com a credencial SELECT existente.
Uma divergência impede a promoção. Os resultados privados ficam vinculados por hash ao recibo.

A retenção seleciona o WorkingDirectory da release sob custódia root, usa pool de comando 2
e desconecta os clientes do aplicativo selecionado. Após schema completo, ela acompanha o
contrato novo mesmo se o binário anterior voltar. API e worker podem voltar sem fazer a
retenção ignorar as tabelas acrescentadas. Nenhum job de retenção é executado por este ensaio.

A autoridade revisada inclui também `.github/workflows/ci.yml`: a promoção não deve aceitar
silenciosamente uma mudança nos comandos que geram os checks obrigatórios. No job Supply Chain,
instalações não repetem o audit implícito; os dois audits explícitos continuam obrigatórios e
falham se o registro não responder. O timeout de rede é limitado, sem transformar erro em PASS.

## Preservação na transição 84 → 86 (24/10/2026)

A comparação estrita de hashes continua sendo o padrão. Para as duas migrations
`20261013170000_manual_test_execution_reference` e
`20261013171000_requirement_lifecycle_basis`, o plano deve declarar
`dataPreservation: standalone-lifecycle-84-86-v1`. O receptor valida os hashes das
cadeias completas, schemas e SQL; um plano dessa transição sem a política é recusado
no preflight. A política não autoriza outras migrations.

Com os escritores parados, a projeção esperada é calculada sobre os fatos anteriores
ao DDL usando SELECT e o SQL fixado por hash. O ensaio confronta essa projeção com as
regras canônicas do backend. Requisitos preservam identidade, projeto e todos os
campos anteriores, exceto status e timestamp quando a reconciliação os exige.
Estados novos ou alterados precisam corresponder à projeção LOCAL. Todo histórico
anterior permanece idêntico; cada entrada nova deve corresponder exatamente a uma
transição esperada, sem duplicações. Demais tabelas continuam com hashes e contagens
idênticos. Os 84 registros Prisma mantêm seus metadados e as duas novas migrations
precisam estar concluídas. Todas as chaves estrangeiras são verificadas.

Valores de negócio ficam somente em memória: dump anônimo limitado a 512 MiB e
linhas estruturadas das três tabelas limitadas a 8 MiB/50 mil registros. Os arquivos
de evidência contêm somente hashes, contagens e resultados. Exceder limites recusa
a operação; não autoriza aumentar privilégios ou desligar verificações.

O teste permanente `db:test:validate-restricted` usa MySQL isolado e sete privilégios,
chamando `Host.apply_migrations`, os fingerprints e `contract.promote` reais.
Somente fronteiras de serviços/roteamento são adaptadas no laboratório. Exercita
base populada, vazia, falha parcial e falha após DDL, além de controles negativos
de corrupção e inicialização real da API/worker com quatro jobs. Também integra
o build ARM64; sua prova é `receiver-upgrade-proof.json`.

Falha após início do DDL preserva o guard e exige verificação administrativa.
Não há rollback destrutivo ou retry automático. Uma atualização do receptor exige
revisão, checks, cópias root-only, locks operacionais e atualização mínima dos
fingerprints correspondentes. Não se reexecuta o instalador inicial. Uma promoção
cancelada não permite reutilizar request, plano ou autorização consumida.
