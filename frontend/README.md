# TRACEFLOW Frontend

## Sobre

Frontend do TRACEFLOW, desenvolvido em React com Vite. A interface permite gerenciar projetos, requisitos, tarefas, Kanban, artefatos GitHub e a visualização de rastreabilidade do MVP.

## Tecnologias

- React
- Vite
- JavaScript
- CSS
- React Router
- Axios
- React Flow

## Estrutura de pastas

```txt
frontend/
├── src/
│   ├── api/
│   ├── assets/
│   ├── components/
│   ├── pages/
│   ├── routes/
│   ├── styles/
│   ├── App.jsx
│   └── main.jsx
└── package.json
```

## Instalação

```bash
cd frontend
npm install
```

## Executando o frontend

```bash
npm run dev
```

Servidor padrão do Vite:

```txt
http://localhost:5173
```

Build de produção:

```bash
npm run build
```

Preview local do build:

```bash
npm run preview
```

## Páginas principais

- Projetos: listagem e criação de projetos.
- Detalhes do projeto: visão geral, membros, convite, ações e sincronização GitHub.
- Tarefas: criação, edição, exclusão segura e vínculos de rastreabilidade.
- Requisitos: criação, edição, exclusão segura, status automático e vínculo com tarefas.
- Kanban: movimentação de tarefas por drag and drop e histórico de movimentações.
- Repositório: consulta de commits, pull requests e issues importados.
- Rastreabilidade: matriz de requisitos e fluxograma interativo.

## Integração com API

As chamadas HTTP ficam concentradas em:

```txt
frontend/src/api/api.js
```

O frontend espera a API backend em:

```txt
http://localhost:3001/api
```

## Rastreabilidade visual

A tela de rastreabilidade possui uma matriz de requisitos e um fluxograma interativo. Ao selecionar um requisito na matriz, o sistema exibe uma árvore visual conectando requisito, tarefas e artefatos técnicos GitHub.

Recursos da visualização:

- Matriz com progresso, tarefas, issues, PRs, commits e evidência técnica.
- Fluxograma com nós para requisito, tarefa, issue, pull request e commit.
- Zoom e movimentação no canvas.
- Nós expansíveis com detalhes.
- Links para abrir artefatos no GitHub.
- Botão para centralizar o fluxo.

## Validações úteis

```bash
npm run build
```
