# Remake visual — caça-níquel físico animado

Pedido do usuário (2026-11-05, TCC): refazer o visual do jogo "como se fosse um caça-níquel de verdade e mais animado". Escopo **somente front-end**: motor matemático, carteira, rotas e regras de SecOps não foram tocados.

## O que mudou

| Área | Antes | Depois |
| :--- | :--- | :--- |
| Layout | Cartão escuro com canvas e painel de controles | Gabinete físico: letreiro com lâmpadas, tabela de pagamentos, janela cromada com vidro, displays LED, painel de botões, bandeja de moedas e alavanca |
| Rolos | Símbolos trocando por `Date.now()`, parada seca | Fita cíclica projetada num **tambor** (cilindro), motion blur, arranque com recuo, frenagem desacelerada com quique, parada sequencial |
| Símbolos | Desenho simples com multiplicador escrito no símbolo | Arte vetorial nova (tigre em medalhão com faixa WILD, moedas chinesas, barras de ouro, laranja) em fita marfim, como rolo real; cache por tamanho |
| Vitória | Banner + partículas | Linha premiada tracejada correndo, células pulsando, demais escurecidas, contador rolante do prêmio, chafariz de moedas saindo da bandeja; vitórias ≥5x/≥20x abrem tela "Grande/Mega vitória" com raios girando, tremor do gabinete e chuva de moedas |
| Suspense | — | Se os 2 primeiros rolos da linha central podem fechar prêmio ≥5x, o 3º rolo gira mais tempo com moldura pulsante e sirene ascendente |
| Som | 5 sons isolados | Ganho mestre (mudo corta tudo), alavanca, ronco contínuo dos rolos, sirene de suspense, tilintar na contagem |
| Interação | Botão GIRAR | Botão domo de fliperama, **alavanca clicável**, tecla Espaço, Esc fecha modais/celebração, clique fora fecha modal |
| Feedback | `alert()` | Toasts (sucesso/erro), região `aria-live` para leitores de tela |
| Login/Cadastro | Cartão simples | Mini gabinete com o mesmo letreiro |

## Arquivos

- `public/js/game/symbols.js` — arte e cache (`SymbolRenderer.get(id, px, blur)`).
- `public/js/game/slotCanvas.js` — `SlotCanvas` (física/tambor/efeitos) e `CoinRain` (moedas em tela cheia, só roda enquanto há moedas).
- `public/js/audio.js` — `SoundEngine` reescrito com helpers `tone()`/`noise()`.
- `public/js/app.js` — fluxo do giro, contadores, celebração, toasts. Lógica de depósito/saque/histórico mantida.
- `public/css/style.css` — reescrito. Classes compartilhadas com o admin (`form-group`, `btn-primary`, `btn-secondary`, `alert-error`, `field-hint`, `modal-*`, `table-responsive`, `mt-*`) mantidas.
- `src/views/index.ejs`, `login.ejs`, `register.ejs`.

## Decisões (minhas, revisáveis)

- **Sem nome/visual de jogo comercial.** O título antigo "FORTUNE TIGER" (nome de um jogo existente da PG Soft) foi removido; o letreiro usa só a marca do projeto, "Tigrinho da Sorte", com estética de máquina clássica de Las Vegas.
- **Texto da linha de pagamento corrigido.** A tela dizia "5 Linhas de Pagamento", mas `slotEngine.spinReels` só avalia a linha central (+ bônus na coluna central). A tabela agora diz "3 iguais na linha central".
- **Fita marfim** (como rolo físico) em vez de fundo escuro, com traço escuro nos símbolos para contraste.
- **Crédito sai na hora do giro** (exibição otimista) e o prêmio é somado depois da contagem, como numa máquina real. O valor final sempre vem de `newBalanceCents` do servidor; em erro, o display volta ao saldo anterior e a carteira é recarregada.
- **Display GANHO zera a cada giro** (antes era "último ganho" persistente), como em máquina real.
- **Duração mínima de giro** (1 s normal, 0,35 s turbo) para o giro não parecer instantâneo quando o servidor responde rápido.
- **Suspense só com prêmio real possível** (calculado a partir do resultado já sorteado pelo servidor). Nunca altera o resultado nem fabrica quase-vitória. Limitado a prêmios ≥5x (~6% dos giros) para não banalizar.
- `Math.random()` no cliente só para efeitos visuais (fita cosmética, partículas, moedas). A Regra 1 do `AI_GUIDE.md` continua valendo para o servidor: o resultado é do CSPRNG.
- `prefers-reduced-motion`: desliga lâmpadas, raios, tremor, chafariz/chuva de moedas e animações decorativas.
- Correção de bug herdado: em erro de rede/servidor os rolos continuavam girando para sempre. Agora `abortSpin()` freia os rolos e reabilita o botão.

## Em aberto

- Giro automático (AUTO) não foi feito — não foi pedido.
- Painel admin (`/admin`) mantém o visual antigo.
