# Dataset da banca após a integração

Esta é uma operação posterior ao deploy; este runbook não autoriza importação.

## Compatibilidade comprovada

O protótipo em `/Users/daniel/Coding/Traceflow-tcc-demo`, branch
`demo/tcc-three-projects-20261021`, usa a base funcional a828bb3c. Seu schema de 83 migrations
é byte-idêntico ao da main daf5c1e8. O upgrade isolado 83→84 passou, preservando todos os
registros/colunas anteriores e acrescentando a migration de uploads retomáveis. O código
integrado de `backend/src/modules/indicators/` é byte-idêntico ao desse protótipo. A fórmula
Health e seus thresholds não foram alterados para a integração.

Isso comprova compatibilidade estrutural e preservação da fórmula. Não é uma nova medição
dos três projetos no schema integrado nem uma importação na OCI. A evidência anterior está
em `docs/demo/TCC_DEMO_EVIDENCE.json` daquele worktree; não deve ser apresentada como resultado
produtivo. Os scripts/dataset desse worktree estão atualmente fora dos commits: congelar e
revisar seus hashes/revisão antes de transportá-los. Não alterar o worktree de demonstração
ou incorporar seu conteúdo não revisado automaticamente ao pacote da aplicação.

## Procedimento da operação posterior

1. Exigir deploy encerrado, versão e 84 migrations verificadas, backup atual recuperável e
   janela própria autorizada. Manter o deploy e o seed em operações distintas.
2. Fixar a revisão e os hashes do seed/dataset, executar novamente o dry-run com o schema
   efetivamente publicado e conferir a identidade combinada calculada pelo próprio seed.
   O SHA-256 do arquivo `schema.prisma` e o hash combinado do seed têm representações distintas.
3. Resolver o OWNER legítimo por identidade e autorização atuais, nunca por IDs locais.
   Conferir também sua cronologia: o seed exige que o ator anteceda a história demonstrativa.
   Se essa condição não existir, parar e definir uma adaptação explícita para dados fictícios;
   não retroceder a data de uma conta real nem remover a guarda para forçar a importação.
4. Validar a instalação GitHub realmente autorizada para esse OWNER e acesso às fontes.
   Não copiar instalações, sessões, autorizações ou IDs de outro banco.
5. Criar journal privado **novo**, autorização nominal de até 60 min e escopo somente dos três
   projetos `[TCC DEMO]`. O exemplo de autorização permanece `approved=false` até essa operação.
   Conferir host privado, `traceflow_live`, ator real, data-base civil atual e hash combinado.
6. Usar os services canônicos do seed revisado, com o cliente/contratos da revisão publicada,
   em workspace administrativo separado, sem editar arquivos imutáveis da release. Executar
   primeiro o dry-run; só aplicar após revisar o plano e obter a autorização dessa operação.
7. Verificar pela API autenticada os projetos criados e seus IDs reais:
   Portal do Cliente → HEALTHY; Gestão de Pedidos → ATTENTION; Integração de Pagamentos → CRITICAL.
   Verificar amostras/cobertura, relatórios/PDF e cronologia; se houver divergência, preservar
   journal e fatos, sem forçar score ou modificar projetos já existentes.

Não usar `reset`, `migrate resolve`, SQL direto para corrigir indicadores ou restauração global.
O journal permite retomada exclusivamente quando a operação e a auditoria correspondem; não
apagar locks/pending ambíguos. Nenhum dado produtivo ou dataset foi importado nesta entrega.
