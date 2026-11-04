# Guia de Contexto, Arquitetura e Diretrizes para IAs (Tigrinho2)

Este documento deve ser lido por qualquer Inteligência Artificial ou desenvolvedor antes de modificar ou estender esta base de código. Ele resume o que foi implementado, a arquitetura vigente, as regras de negócio e travas críticas de segurança (SecOps).

---

## 1. Visão Geral da Aplicação

O **Tigrinho2** é uma mini-plataforma iGaming monolítica em **Node.js + Express + EJS + HTML5 Canvas**, com persistência relacional em **SQLite (WAL mode com locks imediatos)** e integração financeira via Pix com a gateway **SuitPay**.

### Principais Módulos do Sistema:
1. **Motor Matemático (CSPRNG & PAR Model)**:
   - Sorteio criptograficamente seguro via módulo nativo `crypto` (`crypto.randomBytes`).
   - Tabela PAR calibrada: `TIGRE` (Wild 50x / peso 2), `MOEDA` (10x / peso 8), `BARRA` (5x / peso 20) e `LARANJA` (2x / peso 70).
   - "Modo Tigre da Sorte" (Bônus de 5x ativado dinamicamente) garantindo **RTP calibrado de 96%** com alta volatilidade.
   - Auditoria **Provably Fair** com hash HMAC SHA-256 para cada rodada.
2. **Carteira & SecOps (Seamless Interno com Locks)**:
   - Gestão atômica de saldo e prevenção contra Race Conditions / Double Spending.
   - Trava de Rollover Estrito (`total_apostado >= total_depositado * FatorRollover`).
   - Trava de CPF Casado (saques exclusivos para Pix CPF idêntico ao documento cadastrado).
3. **Integração SuitPay**:
   - Pay-in (`/request-qrcode`) e Pay-out (`/pix-payment`).
   - Webhook idempotente contra duplicidade de crédito (`/api/webhooks/suitpay`).
   - Mock local automático e suporte a túnel público (`npm run tunnel` via Localtunnel ou Ngrok).
4. **Painel Administrativo (`/admin`)**:
   - Métricas em tempo real: GGR (Lucro da Casa), Turnover, Payout, RTP Real, House Edge Real e Hit Frequency.
   - Gestão de Usuários: Ajuste manual de saldo, liberação de rollover, bloqueio e papéis (Admin/User).
   - Calibração de RTP, House Edge, frequências de bônus e pesos em tempo real sem reiniciar o servidor.
5. **Front-End Monolítico**:
   - Renderização EJS com layout temático asiático (Dark Red & Gold) responsivo mobile-first.
   - Canvas HTML5 a 60 FPS com desaceleração física sequencial dos rolos (Rolo 1 -> 2 -> 3), partículas e linhas premiadas.
   - Efeitos sonoros sintetizados nativamente via Web Audio API (sem dependência de arquivos `.mp3`).

---

## 2. Regras Inegociáveis de Engenharia & SecOps

Qualquer código novo ou refatoração DEVE respeitar estas 6 diretrizes absolutas:

### ⚠️ Regra 1: PROIBIDO usar `Math.random()`
- **Diretriz:** Toda geração de aleatoriedade no jogo deve obrigatoriamente utilizar o motor CSPRNG em `src/engine/prng.js` baseado em `crypto.randomBytes`.
- **Motivo:** `Math.random()` no V8 utiliza o algoritmo xoroshiro128+, que é vulnerável a ataques de predição de estado e engenharia reversa estatística.

### ⚠️ Regra 2: Controle Atômico de Concorrência
- **Diretriz:** Operações de débito de aposta (`processSpin`) e reserva de saque (`reserveWithdrawal`) em `src/services/walletService.js` devem sempre rodar dentro de `db.transaction(fn).immediate()`.
- **Ordem de Operações:** O saldo do usuário DEVE ser verificado e debitado **antes** do sorteio matemático do PRNG ou de qualquer requisição externa à SuitPay.
- **Motivo:** Evitar Race Conditions onde cliques simultâneos causam Double Spending e deixam o saldo negativo.

### ⚠️ Regra 3: Valores Financeiros em Centavos Inteiros
- **Diretriz:** No banco de dados e na lógica de negócio, saldos e valores NUNCA devem ser armazenados em números de ponto flutuante (`float`). Utilize sempre números inteiros representando centavos (`balance_cents`, `bet_cents`, `payout_cents`, `amount_cents`).
- **Motivo:** Eliminar imprecisões de representação IEEE 754 (ex: `0.1 + 0.2 !== 0.3`).

### ⚠️ Regra 4: Trava de CPF Casado Obrigatório
- **Diretriz:** A rota de saque (`POST /api/wallet/withdraw`) só pode aceitar chave Pix do tipo `CPF`, e o valor da chave sanitizada deve ser estritamente igual ao `document` cadastrado pelo titular da conta (`user.document`).
- **Motivo:** Prevenir que contas comprometidas transfiram saldo para chaves de terceiros.

### ⚠️ Regra 5: Trava de Rollover Estrito
- **Diretriz:** O saque DEVE ser recusado se $\text{total\_wagered\_cents} < \text{total\_deposited\_cents} \times \text{rollover\_factor}$.
- **Motivo:** Conformidade regulatória e proteção contra lavagem de dinheiro e custos operacionais de gateway.

### ⚠️ Regra 6: Idempotência Rigorosa nos Webhooks
- **Diretriz:** Ao receber callback da SuitPay em `POST /api/webhooks/suitpay`, consultar o status da transação. Se já estiver `COMPLETED`, responder sucesso e ignorar sem creditar novamente.
- **Motivo:** Evitar crédito duplicado em caso de retentativas automáticas da gateway.

---

## 3. Estrutura de Diretórios e Responsabilidades

```
tigrinho2/
├── package.json               # Configurações, dependências e scripts npm
├── .env / .env.example        # Variáveis de ambiente (PORT, SuitPay, Rollover)
├── AI_GUIDE.md                # Este documento de orientação
├── ARCHITECTURE.md            # Especificação técnica original do projeto
├── src/
│   ├── app.js                 # Express, Helmet, Session, EJS e montagem de rotas
│   ├── server.js              # Inicialização do listener HTTP (binding 0.0.0.0)
│   ├── config/
│   │   ├── env.js             # Carregamento e validação de variáveis de ambiente
│   │   └── database.js        # Instância SQLite WAL, schema e migrações
│   ├── engine/
│   │   ├── parSheet.js        # Tabela PAR padrão de símbolos, multiplicadores e linhas
│   │   ├── prng.js            # Algoritmo CSPRNG nativo e Provably Fair HMAC SHA-256
│   │   └── slotEngine.js      # Avaliação de matriz 3x3, Wild, Bônus e Simulador
│   ├── services/
│   │   ├── settingsService.js # Gestão em cache e banco de configurações dinâmicas
│   │   ├── walletService.js   # Carteira atômica, travas de SecOps e métodos Admin
│   │   ├── suitpayService.js  # Chamadas HTTP REST à SuitPay e health check
│   │   └── mockSuitpayService.js # Mock de QR Code e Pix para testes locais
│   ├── controllers/
│   │   ├── authController.js  # Cadastro, login e logout com bcrypt
│   │   ├── gameController.js  # Rota de giro (/api/game/spin) e histórico
│   │   ├── walletController.js# Depósito Pix, saque e saldo
│   │   ├── webhookController.js# Webhook oficial e rota mock de teste
│   │   └── adminController.js # Páginas e APIs do painel administrativo
│   ├── middlewares/
│   │   ├── authMiddleware.js  # Autenticação de sessão de usuários
│   │   ├── adminMiddleware.js # Verificação estrita de papel 'admin'
│   │   └── rateLimiter.js     # Proteção contra flooding e brute-force
│   ├── routes/
│   │   ├── authRoutes.js      # /login, /register, /logout
│   │   ├── gameRoutes.js      # /api/game/spin, /api/game/history
│   │   ├── walletRoutes.js    # /api/wallet/me, /deposit, /withdraw, /transactions
│   │   ├── webhookRoutes.js   # /api/webhooks/suitpay, /api/webhooks/mock-pay
│   │   └── adminRoutes.js     # /admin, /admin/users, /admin/rtp, /admin/suitpay
│   └── views/
│       ├── layout.ejs
│       ├── index.ejs          # Página principal do jogo (Canvas + Modais)
│       ├── login.ejs / register.ejs # Telas de autenticação
│       └── admin/             # Telas do painel administrativo
│           ├── header.ejs     # Navegação do painel admin
│           ├── dashboard.ejs  # KPIs financeiros (GGR, Turnover, Payout, RTP)
│           ├── users.ejs      # Gestão de usuários, saldo e rollover
│           ├── rtp.ejs        # Calibração dinâmica de RTP e simulador
│           └── suitpay.ejs    # Configuração e testes da Sandbox SuitPay
├── public/
│   ├── css/
│   │   ├── style.css          # Estilo visual do jogo (tema Dark Red & Gold)
│   │   └── admin.css          # Estilo completo do painel administrativo
│   └── js/
│       ├── audio.js           # Sintetizador Web Audio API nativo
│       ├── app.js             # Gerenciador de eventos, apostas e modais
│       └── game/
│           ├── symbols.js     # Desenho vetorial dos símbolos no Canvas
│           └── slotCanvas.js  # Física de giro e renderização do Canvas a 60 FPS
├── scripts/
│   ├── initDb.js              # Inicializa schema e contas demo/admin
│   ├── simulate-rtp.js        # Simulação Monte Carlo CLI de 100.000 giros
│   └── tunnel.js              # Inicializador de túnel público para Webhooks
└── tests/
    ├── prng.test.js           # Testes do CSPRNG e PAR sheet
    ├── slotEngine.test.js     # Testes de regras do jogo e Wild
    ├── rollover_and_cpf.test.js # Testes das travas de Rollover e CPF Casado
    ├── concurrency.test.js    # Teste de Race Condition com requisições concorrentes
    ├── webhook.test.js        # Teste de idempotência em depósitos
    └── admin.test.js          # Testes do painel admin e calibração dinâmica
```

---

## 4. Contas Pré-configuradas no Sistema

| Papel | E-mail | Senha | Saldo Inicial |
| :--- | :--- | :--- | :--- |
| **Administrador** | `admin@tigrinho.com` | `admin1234` | R$ 0,00 |
| **Jogador / Admin Demo** | `demo@tigrinho.com` | `demo1234` | R$ 100,00 (Rollover cumprido) |

---

## 5. Comandos de Desenvolvimento e Testes

```bash
# Iniciar o servidor
npm start

# Modo de desenvolvimento com auto-reload
npm run dev

# Executar a suíte completa de testes automatizados (13 testes)
npm test

# Executar apenas o teste de concorrência / race condition
npm run test:concurrency

# Executar simulação matemática Monte Carlo de 100.000 giros (validação de RTP)
npm run simulate-rtp

# Iniciar o túnel público para receber Webhooks da SuitPay na porta 3000
npm run tunnel

# Iniciar o túnel alternativo via Ngrok (se configurado authtoken)
npm run tunnel:ngrok
```

---

## 6. Prompt Bootstrapper para Novas Interações de IA

Ao iniciar uma nova sessão ou funcionalidade neste projeto, copie e envie o seguinte prompt para a IA:

> *"Aja como um engenheiro de software sênior especialista em iGaming e Node.js. Leia e siga estritamente as regras de arquitetura e SecOps descritas em `AI_GUIDE.md` e `ARCHITECTURE.md`. Toda lógica matemática deve utilizar o motor CSPRNG nativo sem Math.random(). Toda operação financeira de saldo ou giro deve utilizar travas atômicas imediatas no banco. Respeite as travas de CPF Casado, Rollover Estrito e Idempotência de Webhook. Escreva códigos limpos, performáticos e com cobertura de testes automatizados."*

