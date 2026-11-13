# Contexto do Projeto — Retomada em Outro PC

> Última atualização: **13/11/2026**. Leia este arquivo inteiro antes de continuar
> o desenvolvimento em outra máquina (ou antes de pedir ajuda a uma IA — aponte-a
> para cá e para `docs/ARCHITECTURE.md` e `docs/AI_GUIDE.md`).

---

## 1. Estado atual do projeto

Plataforma iGaming monolítica (Node.js >= 20, Express 4, EJS, better-sqlite3 em
modo WAL). Dinheiro sempre em **centavos inteiros** no banco.

**Migração de gateway concluída e validada:** PushinPay foi totalmente removido;
o **Asaas (API v3)** é o único gateway de pagamento.

- Cliente do gateway: `src/services/asaasService.js` (+ `mockAsaasService.js` para dev)
- Webhook: `POST /api/webhooks/asaas` (`src/controllers/webhookController.js`)
- Painel admin do gateway: `/admin/asaas` (`src/views/admin/asaas.ejs`)
- Plano/decisões da migração: `docs/PLANO_ASAAS.md` (inclui a decisão de **não**
  usar Make/Pusher; recomendação é SSE nativo com polling como fallback)

**Teste de ponta a ponta no sandbox feito em 13/11/2026, com sucesso:**
depósito gerou QR Pix real (`pix-h.asaas.com`), pagamento simulado via
`POST /payments/{id}/receiveInCash`, webhook validou token + reconsultou a API
e creditou o valor exato. Idempotência confirmada (replay responde
`ALREADY_PROCESSED`). Suíte de testes: 16/16 passando (`npm test`).

## 2. ATENÇÃO — o que NÃO viaja pelo git

Ao clonar em outro PC, estes itens ficam para trás (estão no `.gitignore`):

| Item | O que contém | O que fazer no PC novo |
|---|---|---|
| `.env` | Config local (chaves ficam vazias nele por padrão) | Copiar de `.env.example` e preencher |
| `data/tigrinho.sqlite` | Usuários, saldos, transações **e as configurações do Asaas salvas pelo painel admin** | Será recriado vazio no primeiro boot; reconfigurar o Asaas (seção 4) |

**A migração Asaas ainda NÃO está commitada** (22 modificados, 3 deletados,
4 novos em 13/11/2026). Se isso ainda aparecer em `git status`, commite e faça
push **antes** de trocar de PC, senão o trabalho fica só na máquina antiga.

## 3. Como a configuração é resolvida (pegadinha importante)

As settings vivem na tabela `system_settings` do SQLite e **prevalecem sobre o
`.env`**. O `.env` só semeia os valores na primeira inicialização (INSERT OR
IGNORE em `src/services/settingsService.js`). Depois disso, mudar o `.env` não
tem efeito — mude pelo painel `/admin/asaas` (aplica na hora, sem restart).

## 4. Configurar o Asaas sandbox no PC novo

1. `cp .env.example .env` e preencher **antes do primeiro boot** (para semear o
   banco novo), ou configurar depois pelo painel `/admin/asaas`:
   - `ASAAS_API_KEY`: chave sandbox (começa com `$aact_hmlg_`) — gere/copie em
     `sandbox.asaas.com` → Integrações → API. **Nunca commitar.**
   - `ASAAS_URL_BASE=https://api-sandbox.asaas.com/v3`
   - `ASAAS_WEBHOOK_TOKEN`: o mesmo valor cadastrado no webhook do painel Asaas
   - `ENABLE_ASAAS_MOCK=false` (true = simula tudo localmente, sem API)
2. Webhook no painel do sandbox (Integrações → Webhooks):
   - URL: `https://<tunel>/api/webhooks/asaas` (rode `npm run tunnel`; a URL do
     localtunnel **muda a cada execução** — atualize o cadastro sempre)
   - Eventos: `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `TRANSFER_DONE`,
     `TRANSFER_FAILED`, `TRANSFER_CANCELLED`
   - Token de autenticação = `ASAAS_WEBHOOK_TOKEN` (chega no header
     `asaas-access-token`; divergiu → nossa API responde 401)
3. Se o túnel ficar fechado durante um pagamento, o Asaas **pausa a fila de
   webhooks** após falhas repetidas — reative em Integrações → Webhooks e os
   eventos represados são reentregues. Nada se perde; a transação fica PENDING
   até o webhook chegar.
4. Para "pagar" um QR no sandbox: abrir a cobrança no painel e confirmar o
   recebimento, ou `POST /v3/payments/{id}/receiveInCash`.

## 5. Rodando o projeto

```bash
npm install
npm run dev      # servidor com watch em http://localhost:3000
npm test         # suíte node:test (16 testes)
npm run tunnel   # localtunnel p/ webhook (salva a URL pública no banco)
npm run simulate-rtp  # valida RTP ~96% em 100k giros
```

Usuário de teste: `demo@tigrinho.com` / `demo1234` (recriado pelo seed se o
banco for novo — confira `scripts/initDb.js`). Há também `admin@tigrinho.com`
com role admin.

Observação sobre testes: eles usam o **mesmo** SQLite de dev
(`data/tigrinho.sqlite`); raramente um teste de concorrência falha por
interferência de estado — rode de novo antes de suspeitar de regressão.

## 6. Regras de segurança do dinheiro (não regredir)

- Webhook: valida token → reconsulta `GET /payments/{id}` na API antes de
  creditar → credita **somente** `tx.amount_cents` do banco (nunca o payload) →
  só transações `type='DEPOSIT'` → idempotente → responde 200 rápido.
- Saque: `reserveWithdrawal` debita antes da chamada externa; erro ambíguo
  (timeout/5xx, `err.ambiguous`) **não estorna** — marca `needsManualReview` e
  o webhook `TRANSFER_*` concilia depois. Chave Pix de saque: só CPF igual ao
  do titular (trava anti-fraude). Rollover: `total_bet >= total_deposited × fator`.
- Asaas trabalha em **reais decimais**; a conversão centavos↔reais fica isolada
  em `asaasService.js`. Não converter em mais nenhum lugar.
- PRNG: `crypto.randomInt` (nunca `Math.random`, nunca `randomBytes % n`).
- `mock-pay` é bloqueado em produção; o botão de simular pagamento some com
  mock desligado.

## 7. Pendências / próximos passos

- [ ] **Commitar e dar push na migração Asaas** (se ainda não foi feito).
- [ ] Job de reconciliação: varrer depósitos PENDING antigos e consultar
      `GET /payments/{id}` para creditar mesmo se o webhook se perder
      (`asaasService.getPayment` já existe; falta agendar). Recomendado antes
      de produção.
- [ ] SSE para avisar o navegador do Pix confirmado (hoje é polling de 2,5 s —
      funciona; esboço do SSE está em `docs/PLANO_ASAAS.md`).
- [ ] Limpeza: no banco antigo havia 2 depósitos PENDING órfãos da era do mock
      (cobranças 404 no sandbox) — marcar FAILED se ainda existirem.
- [ ] "Provably Fair" é decorativo (hash não deriva o resultado; seed do
      servidor nunca é revelada) — implementar de verdade ou remover a alegação.

## 8. Checklist de produção (quando chegar a hora)

1. `NODE_ENV=production`, `SESSION_SECRET` forte, `ENABLE_ASAAS_MOCK=false`.
2. `ASAAS_API_KEY` de produção e `ASAAS_URL_BASE=https://api.asaas.com/v3`.
3. `ASAAS_WEBHOOK_TOKEN` definido (**obrigatório**: sem ele, produção rejeita
   todos os webhooks) e webhook cadastrado no domínio público fixo (sem túnel).
4. Transfers exigem conta Asaas aprovada para saques e saldo disponível.
5. **Regulatório:** apostas com dinheiro real no Brasil exigem autorização
   SPA/Ministério da Fazenda (Lei 14.790/2023); confirmar com o Asaas a
   aceitação da vertical antes de operar — evita conta bloqueada com saldo retido.
6. O servidor loga avisos no boot se algo acima estiver errado (`src/server.js`).
