# TRACEFLOW Frontend

Interface web do TRACEFLOW, desenvolvida em React com Vite. Permite gerenciar projetos, requisitos, tarefas e artefatos GitHub e explorar visualmente a rastreabilidade.

As regras transversais do produto estão em [Contexto e arquitetura](../TRACEFLOW_CONTEXTO_ARQUITETURA.md).

## Tecnologias

- React e Vite
- JavaScript e CSS
- React Router
- Axios
- React Flow (`@xyflow/react`)

## Estrutura

```txt
frontend/
└── src/
    ├── api/          # cliente HTTP
    ├── assets/
    ├── components/   # componentes reutilizáveis
    ├── pages/        # páginas por fluxo
    ├── routes/       # navegação
    ├── styles/
    ├── App.jsx
    └── main.jsx
```

## Configuração e execução

```bash
cd frontend
npm install
npm run dev
```

Build de produção e pré-visualização:

```bash
npm run build
npm run preview
```

Por padrão, a interface é servida em `http://localhost:5173` e o cliente em `src/api/api.js` consome a API em `http://localhost:3001/api`.

URLs e configurações específicas de ambiente não devem ser espalhadas por componentes. Ao parametrizá-las, use variáveis `VITE_*` sem incluir segredos: tudo que chega ao bundle do navegador é público.

## Páginas principais

- Projetos: listagem, criação e acesso aos projetos.
- Detalhes: visão geral, membros, convites e sincronização GitHub.
- Tarefas: manutenção e vínculos de rastreabilidade.
- Requisitos: manutenção, status e vínculos com tarefas.
- Kanban: movimentação e histórico de tarefas.
- Repositório: commits, pull requests e issues importados.
- Rastreabilidade: matriz de requisitos e fluxograma interativo.

## Integração com API

Chamadas HTTP devem permanecer centralizadas em `src/api/api.js` ou em módulos dedicados dentro de `src/api`. Componentes não devem conhecer credenciais, regras de autorização ou detalhes de persistência.

O frontend deve tratar estados de carregamento, vazio e erro; apresentar mensagens seguras; e não interpretar uma falha como sucesso. Nenhuma resposta mockada ou dado artificial pode substituir a API real no código de produção.

## Rastreabilidade visual

A matriz apresenta progresso, tarefas e artefatos. Ao selecionar um requisito, o fluxograma conecta requisito, tarefas, issues, pull requests e commits, com zoom, movimentação, detalhes expansíveis e links para o GitHub.

A visualização apoia a análise, mas não deve inferir conclusão sem as regras de negócio fornecidas pela API.

## Segurança, privacidade e acessibilidade

- Não armazenar tokens ou segredos no bundle, `localStorage`, URL ou logs do navegador.
- Não renderizar HTML não confiável sem sanitização e necessidade comprovada.
- Evitar exposição de dados pessoais em mensagens, telemetria e capturas de erro.
- Aplicar autorização no backend; ocultar um controle na interface não é controle de acesso.
- Manter navegação por teclado, rótulos, foco visível, contraste e mensagens de erro compreensíveis.
- Tratar dependências e conteúdo externo conforme OWASP ASVS 5.0 e LGPD.

## Testes e validações

Novas regras de interface devem incluir testes unitários de componentes/hooks; fluxos com API, testes de integração; e jornadas críticas, testes end-to-end. Mocks e fixtures são permitidos apenas nos testes e devem refletir os contratos reais.

Validação atualmente disponível:

```bash
npm run build
```

A CI executa o build em cada alteração relevante. Quando suites forem adicionadas, o script `test` deve ser incorporado como gate obrigatório.

## Definition of Done

Uma alteração de frontend está concluída quando contempla estados de uso e erro, acessibilidade, privacidade, integração real com a API, testes proporcionais ao risco, build aprovado pela CI e documentação atualizada.
