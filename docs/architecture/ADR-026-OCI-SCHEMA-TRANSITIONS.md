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
