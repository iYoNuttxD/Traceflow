# TRACEFLOW — Contexto, arquitetura e padrões de engenharia

## 1. Finalidade deste documento

Este documento é a referência técnica para desenvolver e manter o TRACEFLOW como produto real. Ele orienta pessoas desenvolvedoras e agentes de IA e substitui premissas temporárias limitadas à entrega de um MVP.

O código atual continua sendo a base evolutiva. Funcionalidades já implementadas não devem ser reescritas sem necessidade comprovada, e lacunas de produção devem ser tratadas de forma incremental, rastreável e testada.

## 2. Fontes de verdade

Em caso de divergência, adote esta ordem:

1. documento oficial do projeto, especialmente requisitos e diagramas do Capítulo 3;
2. código, schema Prisma e migrações efetivamente versionados;
3. este documento e decisões arquiteturais registradas (ADRs);
4. READMEs do repositório;
5. documentos históricos de arquitetura, separação e escopo.

Documentos históricos explicam decisões anteriores, mas não limitam o produto ao escopo do MVP. Uma divergência relevante deve ser registrada e resolvida, não ocultada por implementação ad hoc.

## 3. Visão do produto

O TRACEFLOW integra gestão de requisitos, planejamento e evidências técnicas para responder quais entregas implementam cada necessidade do projeto.

```txt
Requisito -> Tarefa -> Issue / Pull Request / Commit
```

O produto oferece projetos e membros, requisitos, tarefas, Kanban, sincronização com GitHub, vínculos de rastreabilidade, matriz de cobertura e fluxograma interativo. A evolução deve preservar a rastreabilidade ponta a ponta e a auditabilidade das decisões.

## 4. Princípios obrigatórios

- **Implementação completa:** não introduzir atalhos destinados a serem esquecidos.
- **Integrações reais:** não usar mocks, respostas estáticas ou dados falsos no runtime de produção.
- **Segurança e privacidade desde o desenho:** considerar OWASP ASVS 5.0 e LGPD em cada requisito.
- **Separação de responsabilidades:** manter limites claros entre interface, HTTP, negócio e persistência.
- **Compatibilidade e migração:** evoluir contratos e dados sem perdas silenciosas.
- **Observabilidade segura:** erros devem ser diagnosticáveis sem expor segredos ou dados pessoais.
- **Qualidade automatizada:** testes e CI fazem parte da entrega, não são uma etapa opcional posterior.

Mocks são aceitáveis em testes automatizados para isolar dependências externas. Fora de testes, só podem existir mediante solicitação explícita, claramente isolados e impossibilitados de chegar ao ambiente de produção.

## 5. Arquitetura

### 5.1 Visão geral

```txt
Navegador
  -> React + Vite
    -> Axios / API REST
      -> Express Routes
        -> Controller
          -> Service
            -> Repository
              -> Prisma ORM
                -> MySQL

Service -> cliente Octokit -> GitHub API
```

O backend segue a sequência obrigatória **Routes → Controller → Service → Repository → Database**.

### 5.2 Responsabilidades

- **Routes:** caminho, método HTTP e middlewares.
- **Controller:** tradução do protocolo HTTP; leitura de parâmetros/corpo e formatação da resposta.
- **Service:** casos de uso, regras, autorização e coordenação de transações/integrações.
- **Repository:** acesso a dados por Prisma, sem decisões de negócio.
- **Database:** MySQL, schema Prisma e migrações versionadas.
- **Frontend:** experiência do usuário e estado de apresentação; não é fronteira de autorização.
- **Cliente GitHub:** encapsula Octokit e detalhes do provedor externo.

Não é permitido acessar Prisma diretamente em routes/controllers nem deslocar regras de autorização para o frontend.

### 5.3 Organização modular

O backend agrupa cada domínio em `src/modules/<dominio>` com routes, controller, service e repository conforme necessário. O frontend separa cliente de API, componentes reutilizáveis, páginas, rotas e estilos.

Dependências entre módulos devem ocorrer por contratos explícitos. Ciclos, utilitários genéricos sem domínio e duplicação de regras devem ser evitados.

## 6. Dados e Prisma

- `schema.prisma` e migrações são artefatos de produção e devem permanecer sincronizados.
- Toda alteração estrutural exige migração versionada e validação sobre dados existentes.
- Migrações destrutivas exigem plano de transição, backup, restauração e aprovação explícita.
- Operações compostas que precisam ser atômicas devem usar transações.
- Restrições, índices e relações devem representar invariantes do domínio, não apenas conveniência da interface.
- Modelos legados ou sobrepostos devem ser consolidados por migração planejada, nunca removidos por suposição.

## 7. API REST

- Usar recursos e métodos HTTP consistentes.
- Validar parâmetros, query e corpo antes da regra de negócio.
- Responder com códigos HTTP e estrutura de erro previsíveis.
- Paginar coleções potencialmente grandes.
- Preservar compatibilidade; rupturas exigem versionamento ou plano de migração.
- Não expor stack traces, consultas, caminhos internos, tokens ou detalhes do banco.
- Documentar mudanças de contrato junto com a implementação.

## 8. Integração com GitHub

Octokit é a biblioteca oficial do projeto para consumir GitHub. A sincronização deve:

- usar credenciais de menor privilégio e armazenadas como segredo;
- ser idempotente sempre que possível;
- respeitar paginação, rate limits, timeout e indisponibilidade;
- persistir estado de sucesso/falha de forma coerente;
- sanitizar erros antes de salvar ou responder;
- não apagar dados locais válidos por falha parcial;
- não recorrer a artefatos simulados em produção.

Tokens de GitHub são dados sensíveis. Devem ser protegidos em trânsito e repouso, nunca incluídos em logs e rotacionados após suspeita de exposição.

## 9. Segurança — OWASP ASVS 5.0

O TRACEFLOW adota OWASP ASVS 5.0 **Level 2** como referência inicial. A adoção é incremental e verificável: requisitos aplicáveis devem virar controles, testes e evidências; não basta declarar conformidade.

Controles mínimos:

- inventário de superfícies, ativos, dados e relações de confiança;
- validação allowlist, normalização e limites de entrada;
- consultas parametrizadas via Prisma e proteção contra injeção;
- autenticação robusta e gerenciamento seguro de sessão/token;
- autorização server-side por operação e por recurso/projeto;
- TLS em ambientes publicados e configurações seguras de CORS/cabeçalhos;
- segredos fora do código, com privilégio mínimo e rotação;
- criptografia adequada para dados sensíveis em trânsito e, quando aplicável, em repouso;
- dependências verificadas e atualizadas com avaliação de risco;
- tratamento seguro de erros, logging auditável e sem dados sensíveis;
- limites de requisição, rate limiting e mitigação de abuso;
- revisão de upload, URL externa e conteúdo ativo antes de introduzir essas capacidades.

Cada pull request deve identificar controles afetados quando a alteração envolver autenticação, autorização, dados sensíveis, criptografia, integrações ou configuração.

## 10. LGPD e privacidade

Antes de coletar um dado pessoal, documentar:

- finalidade e base legal;
- titular e origem;
- campos, fluxo e sistemas que recebem o dado;
- prazo e critério de retenção;
- controles de acesso e proteção;
- processo de correção, exportação e eliminação quando aplicável.

Aplicar minimização, necessidade, transparência, segurança e responsabilização. Ambientes de desenvolvimento/teste não devem usar dados pessoais reais sem necessidade e proteção formal. Logs e telemetria devem preferir identificadores técnicos e evitar conteúdo de issues, nomes, e-mails e tokens.

Incidentes de segurança ou privacidade exigem contenção, preservação de evidências, avaliação de impacto e comunicação conforme o processo organizacional aplicável.

## 11. Testes

A pirâmide de testes esperada inclui:

- **unitários:** services, regras, validações, cálculos e componentes/hooks;
- **integração:** repositories, Prisma, transações, clientes e contratos entre camadas;
- **API:** rotas, códigos HTTP, validação, autenticação e autorização;
- **frontend:** estados, acessibilidade e integração com o cliente HTTP;
- **end-to-end:** jornadas críticas de projeto, sincronização e rastreabilidade;
- **segurança:** casos negativos derivados dos controles ASVS aplicáveis.

Correções devem incluir teste de regressão. Código novo precisa ser desenhado para testabilidade sem criar caminhos alternativos de produção. Mocks ficam restritos ao ambiente de teste e devem reproduzir contratos reais.

Enquanto a cobertura automatizada é implantada, validações manuais precisam ser registradas no PR. A ausência atual de uma suite não autoriza novas alterações sem testes quando for viável adicioná-los.

## 12. Integração contínua

GitHub Actions deve executar em pull requests e atualizações das branches protegidas:

1. instalação reprodutível com `npm ci`;
2. validação e geração do Prisma Client;
3. verificação sintática/lint quando disponível;
4. testes automatizados de backend e frontend;
5. build de produção do frontend;
6. verificações de dependências/segurança definidas pelo projeto.

Gates não podem ser ignorados silenciosamente. Se um teste depender de infraestrutura, a CI deve fornecer serviço isolado ou estratégia de teste apropriada, nunca apontar para banco de produção.

O workflow atual estabelece a base com as validações disponíveis; scripts de teste devem ser incorporados como gates obrigatórios junto com a criação das suites.

## 13. Observabilidade e erros

- Usar logs estruturados com nível, timestamp, correlação e contexto mínimo.
- Separar mensagem pública de detalhe interno.
- Nunca registrar credenciais, tokens, cookies, cabeçalhos de autorização ou dados pessoais desnecessários.
- Monitorar falhas de sincronização, latência, taxa de erro e saúde das dependências.
- Eventos de auditoria relevantes devem identificar ação, recurso, resultado e ator sem armazenar conteúdo excessivo.

## 14. Ambientes e configuração

- Configuração varia por ambiente; código e contrato permanecem os mesmos.
- Segredos são fornecidos por mecanismo seguro do ambiente/GitHub, nunca pelo repositório.
- Produção deve usar TLS, credenciais exclusivas, menor privilégio e backups testados.
- `.env.example` contém somente nomes e exemplos não sensíveis.
- Dados e integrações de produção não devem ser usados em testes locais ou CI.

## 15. Definition of Done

Uma entrega só está concluída quando, conforme aplicável:

- atende ao requisito e aos critérios de aceitação sem mock de produção;
- preserva a arquitetura Routes → Controller → Service → Repository → Database;
- valida entradas, autentica e autoriza operações;
- avalia OWASP ASVS 5.0 e impactos de LGPD;
- inclui migração segura e reversível quando altera dados;
- possui testes automatizados proporcionais ao risco e teste de regressão para correções;
- passa por todos os gates da CI;
- trata erros e adiciona observabilidade sem vazar informações;
- atualiza documentação, contratos e rastreabilidade;
- foi revisada e não contém segredos, dados pessoais indevidos ou dependências vulneráveis conhecidas sem decisão registrada;
- possui plano de implantação/rollback quando houver risco operacional.

## 16. Regras para pessoas e agentes de IA

Antes de alterar código:

1. ler este documento, o README do componente e os módulos relacionados;
2. verificar o schema/migrações e contratos reais;
3. identificar requisito, dependências, riscos ASVS/LGPD e testes necessários;
4. evitar assumir que documentação histórica representa o estado atual.

Durante a implementação:

- entregar o requisito de ponta a ponta ou deixar um contrato real pronto para a dependência ainda não implementada;
- não inserir mocks, TODOs ocultos, credenciais ou bypasses de segurança;
- manter alterações pequenas, commits claros e documentação sincronizada;
- não modificar comportamento adjacente sem necessidade e justificativa.

## 17. Decisões arquiteturais

Mudanças relevantes devem ser registradas em ADR, incluindo contexto, decisão, alternativas, consequências, segurança, privacidade e plano de migração. Exemplos: autenticação, autorização, armazenamento de tokens, mudança de banco, alteração da cadeia de rastreabilidade, filas, cache ou serviços externos.

## 18. Prioridades de evolução

1. estabelecer testes unitários e de integração para regras críticas;
2. tornar os testes gates obrigatórios da CI;
3. inventariar dados pessoais e controles ASVS aplicáveis;
4. fortalecer autenticação, autorização, segredos, logging e tratamento de erros;
5. documentar contratos da API e decisões por ADR;
6. ampliar observabilidade, backup, recuperação e segurança operacional;
7. evoluir requisitos funcionais preservando rastreabilidade e compatibilidade.

Essas prioridades não substituem os requisitos oficiais; orientam a transformação contínua da base atual em um produto seguro, testável e operável.
