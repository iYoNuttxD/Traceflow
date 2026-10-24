# Correção da sobreposição do botão da sidebar — PR #25

O botão de expandir a sidebar recolhida avançava 21px além da borda do menu de 88px: seu alvo de 44px ocupava x=65–109, enquanto o painel de notificações começava em x=88. O painel modal cobria parte do botão. A animação também partia 24px sobre o menu e a abertura durante a transição de largura podia desencontrar o painel e a sidebar.

## Correção

- `AppShell.css`: botão recolhido no fluxo normal, em uma segunda linha do cabeçalho, integralmente dentro da sidebar; o cabeçalho móvel continua horizontal com seu controle próprio de fechar.
- `AppShell.jsx` e CSS: estado de notificações exposto no shell para concluir a transição de largura quando o modal abre.
- `NotificationsPanel.css`: animação começa pela área de conteúdo, sem cruzar a borda da sidebar. Nenhum z-index foi elevado.
- Semântica modal preservada: shell inerte, foco preso ao diálogo, Escape devolve foco ao sino. Clicar sobre o botão de fundo com o modal aberto fecha o modal pelo shield, sem acionar a navegação de fundo; após fechar, clique/Enter/Espaço alternam a sidebar.
- Fixture visual P8 aceita três projetos rápidos sintéticos para verificar a altura curta.

Antes de editar, o remoto `max-dev` permanecia em `8fd642a1`. `main` avançou para `571d2fde` (PR #30); foi integrado por merge `ff2b66c1`, sem conflitos e preservando a correção da ordem determinística das migrations. Os recursos anteriores de max-dev e as novidades de main permanecem no histórico. Nenhum force push, merge da PR em main ou deploy foi executado.

## Verificação deste código

- Frontend: **149 arquivos / 1.848 testes aprovados**, sem pulados, com Node 22.23.3.
- Lint, Prettier e build do frontend aprovados. O build mantém o aviso anterior de importação estática/dinâmica de `NotificationPreferencesPage`.
- Quatro regressões de CSS e duas variantes de interação adicionadas. Controle negativo com os dois CSS de `8fd642a1`: quatro falhas esperadas; CSS final restaurado: quatro aprovados.
- Validador de CI e inventário visual aprovados. Os 26 testes de `deploy/cd/tests` passaram, incluindo a ordem de migrations integrada de main. A primeira execução ficou impedida de abrir o servidor de teste pelo sandbox; a execução local com acesso a loopback passou integralmente, sem deploy.
- A suíte completa do backend e as migrations serão conferidas na CI do commit publicado. Não se usa a CI186 anterior como prova desta correção.

## Inspeção visual e acessibilidade

Chrome no Mac, componentes reais na fixture P8 local, dados sintéticos e nenhuma gravação na API real. Tema escuro; esta correção não altera tokens de tema. Não é homologação completa da aplicação autenticada, nem de Safari/Firefox.

| Cenário | Resultado |
| --- | --- |
| Recolhida, 1280×800, painel fechado/aberto | Alvo 44×44 em x=21,5–65,5; sidebar/painel em x=88; sobreposição zero |
| Expandida, 1440×900, painel fechado/aberto | Alvo em x=207–251; sidebar/painel em x=272; sobreposição zero |
| Abertura imediatamente após recolher | Sidebar conclui largura em 88px, transição 0s; animação do painel permanece no conteúdo |
| Recolhida, 768×640, três projetos rápidos | Conteúdo da sidebar 544/544px, sem rolagem espúria; botão contido e painel alinhado |
| Clique real e teclado desktop | Clique no shield fecha sem alternar fundo; Enter/Espaço alternam após fechar; Shift+Tab permanece no modal; Escape retorna ao sino |
| Móvel 390×844 | Gaveta horizontal no cabeçalho, botão próprio de fechar, notificações fecham gaveta; foco preso e Escape devolve sino móvel |
| Móvel 320×640 | Controles quebram linha sem overflow global; lista 1760px em 384px, rolagem real até scrollTop=1280 preservada |
| Barras do projeto/Indicadores a 768px | Altura/conteúdo 48/48px, overflow-y hidden e overflow-x auto preservados |

## Evidências

- [Antes, sobreposição](../design/validation/sidebar-toggle-20261022/before-collapsed-open.jpg)
- [Depois, recolhida](../design/validation/sidebar-toggle-20261022/after-collapsed-open-1280.jpg)
- [Depois, expandida](../design/validation/sidebar-toggle-20261022/after-expanded-open-1440.jpg)
- [Gaveta móvel](../design/validation/sidebar-toggle-20261022/mobile-navigation-390.jpg)
- [Notificações em 390px](../design/validation/sidebar-toggle-20261022/mobile-notifications-390.jpg)
- [Notificações em 320px](../design/validation/sidebar-toggle-20261022/mobile-notifications-320.jpg)
- [Medições finais](../design/validation/sidebar-toggle-20261022/final-measurements.json)

Captura principal na Library: `libfile_960201dedee48191ab66573c723648b4`.
As duas referências do pedido anterior já haviam sido materializadas e inspecionadas; a regressão atual foi reproduzida diretamente no Chrome, incluindo o cenário ausente da entrega anterior.
