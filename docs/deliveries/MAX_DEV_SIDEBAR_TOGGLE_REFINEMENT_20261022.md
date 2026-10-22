# Refinamento visual do botão da sidebar — PR #25

O botão recolhido ainda parecia próximo e pesado em relação à marca. O ícone passa de 20px para 16px nos dois estados; a variante recolhida deixa de ter círculo, fundo e sombra permanentes e usa o mesmo tratamento discreto do estado expandido. O alvo continua 44×44px, com hover e foco visível. O cabeçalho recolhido reserva 8px entre os alvos da marca e do botão, resultando em 24px entre a marca visível e a seta. O acréscimo de altura é de apenas 8px.

A alteração de produção é restrita a `AppShell.css`; a regressão de CSS foi atualizada para preservar ícone pequeno, alvo confortável, espaçamento e contenção. A correção anterior de posição, abertura durante transição, animação pela área de conteúdo, foco e semântica modal permanece. Não houve mudança de z-index, lógica de navegação ou dados.

## Verificação

- 19 testes afetados aprovados (CSS e interação/modal), lint, Prettier e build aprovados com Node 22.23.3. Build mantém o aviso anterior de importação estática/dinâmica de `NotificationPreferencesPage`.
- Chrome no Mac, componentes reais em fixture P8 com dados sintéticos, tema escuro: lateral recolhida/expandida, notificações abertas/fechadas, 1280×800 e 1440×900. Ícone 16×16px, alvo 44×44px, sem sobreposição inclusive ao abrir imediatamente depois de recolher.
- Clique real no alvo, Enter e Espaço alternam depois de fechar o modal; com o modal aberto o shield fecha primeiro sem acionar o fundo. Foco visível tem contorno de 3px; Shift+Tab fica no diálogo; Escape retorna ao sino.
- Em 768×640 com três projetos rápidos: conteúdo da lateral 536/536px e largura global 768px. Abas e rolagem do conteúdo não foram alteradas. Em 390×844: cabeçalho móvel continua horizontal, gap 12px e toggle desktop oculto.
- Limites: não é homologação de toda a aplicação autenticada, de gravações na API real, de outros navegadores ou de todos os temas. O resultado completo da CI pertence ao commit publicado e será informado na entrega; a CI anterior não é prova deste refinamento.

## Evidência

[Recolhida, fechada](../design/validation/sidebar-toggle-refinement-20261022/collapsed-closed-1280.jpg) · [Recolhida, painel aberto](../design/validation/sidebar-toggle-refinement-20261022/collapsed-open-1280.jpg) · [Foco visível](../design/validation/sidebar-toggle-refinement-20261022/collapsed-focus-1280.jpg) · [Expandida, fechada](../design/validation/sidebar-toggle-refinement-20261022/expanded-closed-1440.jpg) · [Expandida, painel aberto](../design/validation/sidebar-toggle-refinement-20261022/expanded-open-1440.jpg) · [Medições](../design/validation/sidebar-toggle-refinement-20261022/measurements.json).

Captura principal Library: `libfile_f78acca4a5088191ba4dc73ef1051b56`.

Estado antes de publicar: max-dev remoto `63c1ce82`, workspace limpo antes da alteração; main avançou para `daf5c1e8` (PR #31, apenas CD/runbook). Este refinamento permanece restrito à UI e preserva o histórico e as alterações existentes. Sem force push, merge em main ou deploy.
