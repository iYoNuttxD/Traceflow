# PR proposto — manutenção de segurança TraceFlow

**Descrição preparada; push e PR em rascunho autorizados pelo operador.**
Checkpoint anterior ao envio; resultados remotos serão registrados na seção de CI do relatório.
Título: `security: corrigir qs/follow-redirects e homologar Node 22.23.4 na OCI ARM64`

## Descrição para o PR

O runtime produtivo Node.js 22.23.2 e as dependências registradas no inventário
exigem correção. Esta branch atualiza somente `qs` para 6.16.2 no backend,
`follow-redirects` para 1.16.2 no frontend e os dois pins do builder para
Node.js 22.23.4. A documentação descreve a instalação operacional lado a lado,
sem sobrescrever o runtime RPM e sem alterar lógica de negócio, endpoints,
autenticação, schema ou migrations.

Os 71 arquivos do frontend candidato são idênticos aos publicados. O pacote local
reutiliza esse bundle e passa pelo empacotador/validador oficial; a futura pipeline
mantém seus dois builds e gates originais. A CD atual transporta ambos os componentes:
preservar o conteúdo idêntico e os 184 assets históricos, sem criar outro deployer.

Validação preservada: 5.380 testes da etapa 1, 433 adicionais ARM64 da etapa 2.
Na etapa 3, 97 execuções de regressão após dez patches seletivos do SO passaram
sem falhas/skips; instalação, downgrade e reaplicação desses dez RPMs foram
exercitados no Oracle Linux 9.8 aarch64. Dois `npm ci` independentes do backend
geraram pacote idêntico, com dependências de produção podadas, Prisma 6.12.0,
Argon2 nativo, API e worker reais. Auditorias de produção de ambos os componentes
retornaram zero vulnerabilidades. Cinco leituras públicas GitHub passaram usando
transporte/mapeadores reais; não comprovam autenticação nem sincronização GitHub App.

A produção permanece inalterada. O backup de boot tem autorização somente se a
franquia gratuita for comprovada; essa condição ainda não foi satisfeita. Restore
real de boot e da captura atual, CI remoto no HEAD final e release oficial seguem
pendentes. A ausência de credenciais de homologação GitHub exige autorização para
um ambiente de teste próprio ou aceitação explícita do risco. Este PR não concede GO
de produção e não autoriza publicar uma release assinada que o receiver possa promover.

Evidências: [relatório](SECURITY_MAINTENANCE_2026-11-04.md),
[etapa 3](evidence/security-20261104/stage3-validation.json),
[transação proposta](evidence/security-20261104/stage3-os-transaction.json) e
[runbook](../runbooks/OCI_SECURITY_MAINTENANCE_2026-11-04.md).

## Checklist de CI e critérios de revisão

- [x] Autorização específica para enviar somente a branch de manutenção e abrir
      PR em rascunho para `main`. Nenhum push/PR ocorreu nesta etapa.
- [ ] Registrar HEAD final completo e base remota exata antes do envio; conferir
      preservação dos quatro scripts locais do checkout `daniel`.
- [ ] Os checks **Quality, Backend Tests, Frontend Tests e Supply Chain** devem passar
      para o HEAD efetivo. Um push somente da branch não aciona `ci.yml`, cujo evento
      push está restrito a main; o evento pull_request é necessário.
- [ ] Conferir o workflow `OCI Controlled CD` no contexto PR: a alteração em
      `deploy/cd/**` aciona build-homologate. O job publish/prod deve permanecer
      inelegível: depende de workflow_dispatch com promote=true.
- [ ] Nenhum workflow_dispatch, assinatura de pedido produtivo ou GitHub Release
      `oci-cd-*` nesta autorização. A publicação é acoplada à promoção automática
      do receiver; não usar uma release oficial como simples armazenamento de teste.
- [ ] Dois builds oficiais reprodutíveis; auditoria de produção sem high/critical;
      schema e histórico das 86 migrations idênticos à release ativa; nenhuma execução DDL.
- [ ] Conferir SHA do aplicativo, SHA do workflow, provenance, pins e os dois
      arquivos de autoridade do builder. Não ampliar trustedWorkflowShas por conveniência.
- [ ] O baseline padrão histórico do workflow é
      `b9c1beb9f6ded49ce9257d346c086a8893f700c9`; a release ativa usa
      `d0645b457960b6830d6f8e87cb6e1a6fa461ebf6`.
      Prova PR com baseline antigo não substitui comparação com a produção atual.
      Em futura execução manual autorizada, informar baseline_sha da release efetiva,
      transition_sha256 vazio e promote=false para homologação. Não alterar main
      apenas para viabilizar esse disparo.
- [ ] Comparar hashes de todos os 71 arquivos frontend e preservação dos 184 assets
      históricos antes de eventual promoção. Nenhuma mudança visual é aceita.
- [ ] Documentar quatro avisos moderados de desenvolvimento ESLint/minimatch,
      separados de dependências produtivas; não fazer upgrades incompatíveis por esse gate.
- [ ] Revisão humana do conteúdo e evidências no SHA final; COMMENT técnico não
      equivale a APPROVE formal. Revalidar checks/reviews se o HEAD mudar.
- [ ] Recuperação comprovada, recursos e janela aprovados antes de pedir GO produtivo.

## Identidade do candidato local

Fonte `2ed99fe7c51c4d343e6f18cd82c40eb4742f1595`; alterações posteriores desta etapa
são documentação/evidências. Não atribuir ao commit documental o pacote de outra fonte.

- Pacote: `build/security-stage3-20261104/traceflow-security-2ed99fe7-arm64.tar.gz`.
- SHA-256: `9609a448680cd950fb5775f022bb59b9cba283ef5da69d2282b877d781c63bf3`.
- Manifesto: `09ddcfa37091e4a7cbf73c07f512fd79381fea5dd39319732193dd6bd3225904`.
- 80.029.952 bytes; 4.764 entradas; 86 migrations; Node v22.23.4; Oracle Linux ARM64.
- Não assinado; não publicado; não substitui a pipeline/CI no SHA final aprovado.
