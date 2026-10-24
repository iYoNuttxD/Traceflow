# Sidebar, notificações e navegação — 21/10/2026

## Problema e correção

As duas referências fornecidas pelo usuário foram baixadas pela Library, verificadas como PNGs
legíveis e inspecionadas. A primeira mostra o painel de notificações mais claro que a sidebar;
a segunda mostra uma scrollbar vertical nas abas de Indicadores. O comportamento foi reproduzido
no Chrome do Mac com a aplicação local já aberta.

- `NotificationsPanel.css`: fundo e borda da sidebar, mesmo raio dos controles e hover coerente.
  Em 320px, Origem e Marcar todas quebram linha, mantendo o seletor legível.
- `internal-tabs.css`: overflow vertical oculto explicitamente; sublinhado ativo dentro da barra,
  eliminando o excedente real de 1px. Overflow horizontal continua automático.
- `SettingsLayout.css`: removidas margens negativas que causavam overflow global no mobile.
- Fixture P8: provider de contagem e 24 notificações sintéticas para reproduzir lista longa,
  alternância de abas, preferências, sidebar e menu móvel com os componentes reais.

Não foram alterados handlers de produção, permissões, API, persistência ou regras de notificações.
Os recursos anteriores de max-dev e os relatórios/cancelamento de main permanecem preservados.
Main atual `86e6fe4bdff0b82300af17cb8b93008071febc97` foi integrada por merge normal antes
da implementação; inclui as PRs #28/#29 e o limite de workers da CI. Nenhum deploy foi acionado.

## Evidência

[Registro visual e capturas](../design/validation/VISUAL_VALIDATION_LOG.md#2026-10-21--sidebar-notificações-e-overflow-de-navegação-max-dev).

Chrome do Mac: 1440×900, 1280×800, 768×900, 390×844 e 320×640, temas claro/escuro e estados
recolhido/expandido/móvel. As medidas e capturas usam fixture sintética, após a reprodução
inicial na aplicação autenticada. Não foi feita homologação de todos os fluxos da API.

Antes: abas 48px/49px (altura/conteúdo), overflow vertical automático. Depois: 48px/48px.
Configurações em 320px: documento 328px → 320px. Scroll horizontal necessário e scroll de
listas/preferências preservados; End, Escape, retorno de foco e menu móvel conferidos.

Captura principal na Library: `libfile_0250bdd1efe481918a2314c7f700dcbf`.

## Validação anterior ao push

- Frontend: 1.842 testes / 148 arquivos aprovados, sem skips, Node 22 (47,69 s).
- Lint, formatação e build aprovados; build mantém avisos conhecidos de bundle/diretivas/importação.
- 62 testes de inventário/workflow aprovados, sem skips; inventário e diff check aprovados.
- A CI completa do commit publicado deve ser conferida na PR #25; este é o checkpoint local.

Sem force push, merge em main, deploy ou mudança de proteções.
