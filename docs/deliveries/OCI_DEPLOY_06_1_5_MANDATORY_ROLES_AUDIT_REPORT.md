# OCI-DEPLOY-06.1.5 — Auditoria de roles obrigatórias

Data: 16/10/2026. Escopo: implementação e validação locais do diagnóstico.
Veredito: **PASS LOCAL**, condicionado ao escopo de código/testes abaixo.
**D03 real da 06.1.4 continua FAIL. Prisma–HeatWave não foi homologado nesta entrega.**

## A. Baseline e preservação

- Repositório local: `/Users/daniel/Coding/Traceflow`.
- Origin: `https://github.com/iYoNuttxD/Traceflow.git`; branch: `daniel-dev`.
- HEAD inicial/final: `2d10ca610a5a5cf528fa5c0500a629735bff2478`.
- Working tree inicial limpo. Nenhuma alteração concorrente identificada.
- O HEAD histórico `cf155225` avançou: `4a9b64e` incorporou a instrumentação e
  `2d10ca6` incorporou a entrega de empacotamento 06.1.2. Avanço esperado, inspecionado.
- Working tree final: seis arquivos modificados e este relatório novo, sem staging/commit.
- Pacotes `efa7abc8191bbf10` e `fa4a318dfa1c636d` preservados; nenhum pacote foi criado.

Arquivos desta entrega:

| Arquivo                                                             | Alteração e justificativa                                                                                                                           |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/scripts/validate-oci-heatwave-connection.js`               | Mantém as leituras na mesma sessão; audita inventário e escolhe expansão conforme ativação da role; preserva falha primária também durante rollback |
| `backend/scripts/lib/heatwave-connection.js`                        | Parser fechado de grants, destinatário/colunas, inventário recursivo e evidência obrigatória de expansão; fases constantes adicionais               |
| `backend/test/unit/heatwave-connection.test.js`                     | Adapta o contrato de expansão e verifica metadata malformada/prova ausente                                                                          |
| `deploy/tests/heatwave-diagnostic.test.mjs`                         | Exercita o entrypoint real com Prisma simulado, caminhos de roles, privilégios excessivos, falhas SQL, sessão e saída sanitizada                    |
| `deploy/tests/diagnostic-launcher.test.mjs`                         | Confere aceitação das fases constantes novas e rejeição de valores fora da enumeração                                                               |
| `docs/runbooks/OCI_HEATWAVE_PRISMA_DIAGNOSTIC.md`                   | Acrescenta seção 29; preserva integralmente o conteúdo histórico                                                                                    |
| `docs/deliveries/OCI_DEPLOY_06_1_5_MANDATORY_ROLES_AUDIT_REPORT.md` | Relatório e rastreabilidade desta entrega                                                                                                           |

Launcher operacional, preflight, empacotador, verificador, Prisma compartilhado, schema,
68 migrations, dependências e demais arquivos da aplicação permanecem inalterados.

## B. Diagnóstico técnico

**Comprovado pela evidência fornecida pelo operador:** o pacote `fa4a318dfa1c636d` falhou
na consulta de expansão, com P2010 e código MySQL 3530. O servidor recusou a role solicitada
na cláusula USING. A instrumentação isolou a etapa; não houve evidência de erro de TLS,
identidade ou `@@datadir` nessa tentativa.

**Comportamento documentado:** role obrigatória é implicitamente concedida, mas não
necessariamente ativa. SHOW GRANTS sem FOR inclui roles obrigatórias e agrega roles ativas.
USING expande as roles indicadas. A implementação upstream aceita também roles obrigatórias
nessa cláusula; portanto, a ausência de GRANT explícito não explica, sozinha, o erro observado.

**Ainda não comprovado:** por que o build gerenciado recusou public@%; seu valor efetivo de
CURRENT_ROLE na 06.1.4; existência/resolução da role e eventual particularidade/cache do
serviço. Não houve nova conexão para obter essas evidências. Os mocks não resolvem essa lacuna.
Confiança alta na identificação da consulta/erro; causa interna do servidor permanece aberta.

As fontes oficiais, distinções entre formas de SHOW GRANTS e limites de cada inferência
estão em [runbook, seção 29](../runbooks/OCI_HEATWAVE_PRISMA_DIAGNOSTIC.md#29-adendo-oci-deploy-0615--auditoria-de-roles-obrigatórias).
O catálogo consultado é MySQL 8.4 para o identificador estável 3530; os manuais de roles,
grants e INFORMATION_SCHEMA são 26.7. O código upstream consultado não é uma certificação
da implementação privada do HeatWave 26.7.0-cloud.

## C. Correção e consultas

1. Mantém `SHOW GRANTS FOR CURRENT_USER` e valida integralmente seus direitos.
2. Quando existe mandatory public, lê `information_schema.APPLICABLE_ROLES` sem filtro e
   exige somente public@%, vinculada ao usuário corrente, obrigatória e não delegável.
3. Se public está ativa, usa `SHOW GRANTS` e exige a atribuição obrigatória e os direitos
   agregados dentro da allowlist. Se está inativa, mantém a consulta USING original.
4. Exige conservação dos direitos já observados e recusa qualquer expansão incompleta.
5. Fixa todas essas leituras na mesma conexão por transação interativa. O callback contém
   apenas consultas de metadata/SELECT 1. Não há SET ROLE, DML, DDL ou mudança de permissões.
6. Mantém erro SQL fatal; não existe catch específico de 3530, retry ou fallback permissivo.

Os seis textos SQL anteriores continuam idênticos. Há duas novas possibilidades de SQL:
a consulta do inventário e o comando sem FOR. A ordem identidade/TLS/parâmetros/grants/
SELECT 1 permanece; o inventário fica entre grants e expansão. Sem mandatory public,
inventário e expansão são omitidos, e qualquer atribuição explícita de role é recusada.
Prisma passa a gerenciar BEGIN e COMMIT/ROLLBACK da sessão de leitura; isso requer validação
real futura, não representa escrita de dados de aplicação e não ocorreu contra banco nesta entrega.

A transação usa maxWait de 5s e timeout de 30s, sob o deadline global existente de 30s.
Pool, socket, supervisor de processos, TLS, CA, hostname, DNS, UUID, versão e desconexão
mantêm seus controles. Novas fases: SESSION_START, SESSION_END, SQL_ROLE_GRAPH, ROLE_GRAPH.
Falhas continuam com code/phase/writes e mysqlCode opcional sanitizado. PASS acrescenta
somente graphVerified/strategy aos metadados de roleVerification.

## D. Evidências de segurança

- Privilégios diretos e expandidos passam pelo mesmo parser fechado. Para diagnóstico:
  SELECT obrigatório e SHOW VIEW permitido apenas no schema autorizado; global somente USAGE.
- Grafo completo para public: zero, múltiplas linhas, roles aninhadas/desconhecidas,
  grantability, identidade/host ou formato inesperados resultam em FAIL.
- Grants adicionais, globais, administrativos, de escrita, outro schema, GRANT OPTION,
  ADMIN OPTION, PROXY, REVOKE e formatos ambíguos são recusados.
- A mera presença da atribuição public nunca basta: o inventário e a expansão são obrigatórios.
- Strings, colunas, destinatários, caracteres de controle e duplicatas são validados;
  getters, Error/meta, mensagens e SQL não são serializados na saída operacional.
- Primária preservada mesmo com falha/prazo de rollback e desconexão. Um único JSON;
  mysqlCode continua limitado a decimal canônico de 1 a 65535.
- A enumeração importada pelo launcher aceita as fases novas sem relaxar sua whitelist.
- Não houve acesso a OCI/VM/HeatWave, leitura de credenciais reais, migrations, alteração
  de contas/grants/certificados operacionais, instalação de dependências ou publicação Git.
- Acesso externo limitou-se à documentação pública oficial. O teste TLS abriu somente
  loopback com certificados sintéticos temporários; não houve MySQL ou SQL real.

## E. Validação executada

Toolchain local: Node.js 22.23.3 no Mac; Prisma permanece 6.12.0. Não confundir com uma
validação nativa na VM Node.js 22.23.2/Oracle Linux ARM64.

| Verificação                                                         | Resultado                                        |
| ------------------------------------------------------------------- | ------------------------------------------------ |
| Entrypoint instrumentado e launcher, Node test runner               | 138 PASS, 0 FAIL, 0 skipped/cancelled            |
| Helpers, Vitest com configuração isolada                            | 50 PASS                                          |
| TLS/CA/arquivos protegidos, fixtures sintéticas em loopback         | 10 PASS                                          |
| Total de casos automatizados                                        | 198 PASS                                         |
| ESLint dos JS alterados e lint dos testes MJS                       | PASS                                             |
| Prettier dos cinco arquivos de código, relatório e adendo novo      | PASS                                             |
| Prettier do runbook inteiro                                         | FAIL preexistente na parte histórica, preservada |
| Sintaxe dos cinco arquivos de código/teste alterados                | PASS                                             |
| Secret scan dos sete arquivos da entrega                            | PASS                                             |
| git diff --check                                                    | PASS                                             |
| Consultas históricas, controles preservados e histórico append-only | PASS                                             |

Comandos de reprodução, usando apenas dependências já disponíveis:

```bash
env -i PATH=/usr/bin:/bin /opt/homebrew/opt/node@22/bin/node \
  --experimental-vm-modules --test --test-reporter=spec \
  deploy/tests/heatwave-diagnostic.test.mjs deploy/tests/diagnostic-launcher.test.mjs
```

O Vitest padrão do backend tem hooks de banco. **Não usar `npm test` para esta entrega.**
O comando abaixo foi executado em `backend`, com configuração, hooks, .env e cache persistente
desativados; o runner ainda precisa criar seus próprios arquivos temporários de transformação:

```bash
env -i PATH=/usr/bin:/bin /opt/homebrew/opt/node@22/bin/node --input-type=module -e '
import { startVitest } from "./node_modules/vitest/dist/node.js";
const ctx = await startVitest("test",
  ["test/unit/heatwave-connection.test.js", "test/unit/heatwave-tls.test.js"],
  { config: false, run: true, environment: "node", setupFiles: [], globalSetup: [], maxWorkers: 1, cache: false },
  { envDir: false, server: { watch: null } });
await ctx.close();'
```

Houve duas tentativas iniciais impedidas pelo sandbox somente leitura: criação do temporário
do heredoc e criação do diretório temporário SSR do Vitest. A segunda reportou uma suíte
falha com **zero testes executados**. A execução com permissão apenas para esses testes locais
concluiu os 60 casos acima. Não foi corrigido código nem relaxada asserção para contornar
uma falha de teste. O runner Node emite o aviso esperado de VM Modules experimental.

Verificações estáticas no diretório `backend`:

```bash
env -i PATH=/usr/bin:/bin /opt/homebrew/opt/node@22/bin/node node_modules/eslint/bin/eslint.js \
  scripts/validate-oci-heatwave-connection.js scripts/lib/heatwave-connection.js \
  test/unit/heatwave-connection.test.js
```

Os comandos de Prettier, sintaxe, scanner de segredos e diff foram limitados aos arquivos
da entrega. Nenhuma varredura de arquivos privados/.env foi executada.

O primeiro check de formatação apontou três arquivos. A formatação foi corrigida nas partes
novas. O formatter também tentou normalizar tabelas e fences antigos do runbook; a auditoria
detectou isso e essas mudanças foram desfeitas. A comparação final comprova o prefixo histórico
**idêntico byte a byte ao HEAD**. `prettier.check` retorna false tanto para o runbook do HEAD
quanto para o arquivo inteiro atual, e true para a seção 29. O FAIL integral foi registrado,
não convertido em PASS nem corrigido mediante reescrita do histórico proibida pelo escopo.

Comando final de formatação dos arquivos sem conteúdo histórico congelado, na raiz:

```bash
env -i PATH=/usr/bin:/bin /opt/homebrew/opt/node@22/bin/node \
  backend/node_modules/prettier/bin/prettier.cjs --check \
  backend/scripts/validate-oci-heatwave-connection.js \
  backend/scripts/lib/heatwave-connection.js \
  backend/test/unit/heatwave-connection.test.js \
  deploy/tests/heatwave-diagnostic.test.mjs \
  deploy/tests/diagnostic-launcher.test.mjs \
  docs/deliveries/OCI_DEPLOY_06_1_5_MANDATORY_ROLES_AUDIT_REPORT.md

env -i PATH=/usr/bin:/bin /opt/homebrew/opt/node@22/bin/node \
  backend/scripts/check-secrets.js \
  backend/scripts/validate-oci-heatwave-connection.js \
  backend/scripts/lib/heatwave-connection.js \
  backend/test/unit/heatwave-connection.test.js \
  deploy/tests/heatwave-diagnostic.test.mjs \
  deploy/tests/diagnostic-launcher.test.mjs \
  docs/runbooks/OCI_HEATWAVE_PRISMA_DIAGNOSTIC.md \
  docs/deliveries/OCI_DEPLOY_06_1_5_MANDATORY_ROLES_AUDIT_REPORT.md

git diff --check
```

O lint dos dois `.mjs` usou a API do ESLint instalado, `@eslint/js` recommended e globals
Node, sem configuração externa; resultado: zero erros/avisos. A sintaxe usou `node --check`
individualmente nos cinco JS/MJS alterados. Uma comparação via AST contra HEAD confirmou
os seis literais SQL históricos e os corpos inalterados de dez helpers de segurança:
phases/codes, sanitização de erros, arquivos protegidos, CA, DNS, identidade, contrato de
conexão e TLS. Verificações Git confirmaram as 68 migrations e os módulos protegidos intactos.
Os seis pins externos dos dois pacotes anteriores (tar, manifesto e verificador) conferiram.

Cobertura dos cenários solicitados:

| Itens | Evidência local                                                                                                              |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1–6   | SELECT no schema; mandatory public; atribuição explícita/implícita; herança USAGE e SELECT/SHOW VIEW; caminhos ativa/inativa |
| 7–10  | INSERT/UPDATE/DELETE, CREATE/ALTER/DROP, privilégios administrativos e GRANT OPTION recusados nos dois caminhos              |
| 11–13 | Roles extras/inativas/aninhadas, role obrigatória desconhecida, grafo vazio/não concedido e erro 3530 recusados              |
| 14–17 | Direitos globais, outro schema, SHOW GRANTS inesperado, colunas/valores malformados, getters e duplicatas                    |
| 18–21 | P2010/3530, 1142, 1295, ausência de código nativo; expansão sem SELECT, atribuição ou direitos anteriores                    |
| 22–23 | Desconexão, erro secundário, prazo e erro de rollback, preservação da falha primária                                         |
| 24–25 | Senha sintética, URL, SQL, mensagens, stack/meta/getters não aparecem no JSON; whitelist do launcher                         |
| 26–28 | Fases antigas/novas, SQL condicional/ordem, sessão única, TLS, identidade, CA, DNS e autorização                             |
| 29–30 | local-isolated e oci-read-only simulados, com/sem mandatory public                                                           |

Não executados: suíte persistente completa do backend, MySQL real/local, HeatWave, engine
ARM64 real, empacotamento, CI remoto e D03. Proibidos pelo escopo ou dependentes de autorização
futura; não recebem PASS. Mocks não comprovam ACL, resolução de roles, prepared statements,
transação nativa ou semântica exata do build cloud.

## F. Riscos e pendências

- Com public inativa, USING pode retornar novamente 3530. Isso continuará FAIL.
- A view de roles e a transação precisam ser verificadas com Prisma 6.12.0 no serviço
  gerenciado; erro/indisponibilidade mantém FAIL, sem pedir grants automaticamente.
- O parser é deliberadamente restritivo. Formatos novos, contas com quoting diferente,
  roles adicionais mesmo somente leitura ou inventário incompleto podem recusar um servidor
  legítimo. Revisar evidência antes de qualquer ampliação.
- A sessão fica fixa, mas permissões administrativas podem mudar fora dela. A janela futura
  deve impedir mudanças concorrentes de grants/roles; não há garantia sobre estado futuro.
- Ainda falta evidência da identidade/resolução/ativação de public na execução real que
  falhou. Não foi determinada a causa interna exata nem afirmado que 3530 deixará de ocorrer.

## G. Próxima etapa e critérios

Após revisão humana, autorizar separadamente um novo pacote ARM64 com fontes correspondentes,
manifesto e packageId novos, recalculando todos os checksums. Preservar os dois pacotes
anteriores. O verificador intacto pode manter o mesmo hash, mas deve ser recalculado.
Instalação/verificação offline e execução D03 são etapas distintas, cada uma autorizada.

PASS futuro exige identidade/TLS, inventário e privilégios completos, somente a role esperada,
allowlist respeitada, SELECT 1 e término/desconexão bem-sucedidos, JSON sanitizado único,
seguido da limpeza/relock/zero sessões confirmados pelo operador. Erro 3530, falta de
evidência ou qualquer divergência mantém FAIL. Não modificar permissões para obter PASS.

## H. Encerramento

**PASS LOCAL:** a auditoria dos privilégios diretos/herdados permanece obrigatória e os
casos locais de excesso, ambiguidade e falha são recusados. Esse veredito não encerra a
homologação gerenciada. Nenhum pacote, transferência, acesso à VM, deploy, commit ou push
foi realizado. Aguardar revisão e autorização explícita para a próxima entrega.
