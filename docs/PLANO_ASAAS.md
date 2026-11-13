# Plano de Migração: Gateway de Pagamento Asaas

> **STATUS: ✅ EXECUTADO.** A migração foi concluída: o gateway legado foi removido
> do código e o Asaas é o único gateway (`src/services/asaasService.js`,
> webhook em `/api/webhooks/asaas`, painel em `/admin/asaas`). Este documento
> permanece como referência da arquitetura e do checklist de produção (seção 0).

> Objetivo original: substituir a PushinPay usando o Asaas para
> depósitos Pix (cash-in) e saques Pix (transfers), mantendo o modelo de
> transações em centavos e as travas de segurança já existentes (rollover,
> CPF casado, idempotência de webhook).

---

## 0. Pré-requisitos de conta (fazer antes de codar)

1. Criar conta no Asaas e **conta sandbox** (`https://sandbox.asaas.com`).
2. Gerar a API Key em *Integrações → API*. Guardar em `.env` (`ASAAS_API_KEY`), nunca no código.
3. **Verificar com o Asaas se a vertical do seu negócio é aceita** nos termos de uso
   e qual o enquadramento necessário. Plataformas de aposta com dinheiro real no
   Brasil exigem autorização da SPA/Ministério da Fazenda (Lei 14.790/2023) e
   gateways costumam exigir comprovação disso para liberar a conta. Resolver isso
   primeiro evita ter a conta bloqueada com saldo retido depois.
4. Cadastrar o webhook no painel (ou via `POST /v3/webhooks`) apontando para
   `https://SEU_DOMINIO/api/webhooks/asaas`, com **authToken** definido (o Asaas
   envia esse token no header `asaas-access-token` de cada chamada).

**URLs base**
- Produção: `https://api.asaas.com/v3`
- Sandbox: `https://api-sandbox.asaas.com/v3`
- Autenticação: header `access_token: <ASAAS_API_KEY>`

**Atenção à unidade monetária:** o Asaas trabalha com **reais em decimal**
(`value: 50.00`); o banco do projeto usa **centavos inteiros**. A conversão fica
isolada no service (`cents / 100` ao enviar, `Math.round(value * 100)` ao receber).

---

## Fase 1 — Camada de gateway plugável (sem mudar comportamento)

Hoje `walletController` chama `pushinpayService` direto. Criar uma interface única:

```
src/services/payments/
  index.js            → factory: getGateway() lê setting 'payment_gateway'
  pushinpayGateway.js → código atual, adaptado à interface
  asaasGateway.js     → novo
```

Interface comum (todos trabalham em **centavos** e com erros com flag `ambiguous`):

```js
{
  requestPixCashIn({ userId, name, cpf, amountCents })  → { externalId, qrCode, qrCodeBase64 }
  requestPixCashOut({ amountCents, pixKey, receiverDocument }) → { externalId, status }
  getTransaction(externalId)                            → { status: 'PENDING'|'PAID'|'FAILED' }
  testConnection()
}
```

Novas settings no `system_settings` (seguindo o padrão existente):
`payment_gateway` (`pushinpay` | `asaas`), `asaas_api_key`, `asaas_url_base`,
`asaas_webhook_token`, `asaas_mock_mode`.

**Critério de aceite:** com `payment_gateway=pushinpay` tudo funciona exatamente como hoje.

## Fase 2 — Cash-in (depósito Pix) no Asaas

Fluxo da API:

1. **Cliente**: `POST /v3/customers` com `{ name, cpfCnpj }` na primeira vez;
   salvar o `customer_id` retornado (nova coluna `users.asaas_customer_id`, via
   migração `ALTER TABLE` no padrão do `database.js`). Nas próximas, reutilizar.
2. **Cobrança**: `POST /v3/payments` com
   `{ customer, billingType: 'PIX', value: amountCents/100, dueDate: hoje, externalReference: txId }`.
3. **QR Code**: `GET /v3/payments/{id}/pixQrCode` → `{ encodedImage (base64), payload (copia-e-cola), expirationDate }`.
4. Salvar `payment.id` em `transactions.external_reference` (igual ao fluxo atual).

O `externalReference` enviado ao Asaas = `txId` interno fecha o elo nos dois sentidos.

**Reaproveitar:** a tela de depósito e o polling atuais não mudam — só a origem do QR.

## Fase 3 — Webhook Asaas (a parte mais crítica)

Nova rota `POST /api/webhooks/asaas` com as mesmas defesas já implementadas para
a PushinPay, mais o token:

1. **Validar header** `asaas-access-token` contra `asaas_webhook_token`. Divergiu → 401 e loga.
2. Eventos de interesse: `PAYMENT_RECEIVED` e `PAYMENT_CONFIRMED` (crédito),
   `TRANSFER_DONE` / `TRANSFER_FAILED` / `TRANSFER_CANCELLED` (conciliação de saque).
3. Localizar a transação por `payment.externalReference` (nosso txId) ou `payment.id`.
4. **Regras inegociáveis (já aplicadas no código atual, manter):**
   - só creditar `tx.type === 'DEPOSIT'`;
   - creditar **sempre `tx.amount_cents` do banco**, nunca o valor do payload;
   - idempotência: `COMPLETED` → responde 200 `ALREADY_PROCESSED`;
   - **confirmar o status com `GET /v3/payments/{id}` antes de creditar**
     (defesa em profundidade além do token).
5. Responder **200 rápido** (nada de processamento pesado no handler): o Asaas
   enfileira webhooks e **pausa a fila inteira** se o endpoint responder erro
   repetidamente — depósitos de todos os usuários param de ser confirmados.
   Monitorar a fila no painel do Asaas.

## Fase 4 — Cash-out (saque Pix) via Transfers

1. `POST /v3/transfers` com
   `{ value: amountCents/100, operationType: 'PIX', pixAddressKey: cpf, pixAddressKeyType: 'CPF', description }`.
2. Manter o fluxo atual: `reserveWithdrawal` (trava saldo) → chamada → `finalizeWithdrawal`.
3. Manter a regra de **erro ambíguo** (timeout/5xx → transação fica `PENDING`
   com `needsManualReview`, **sem estorno automático**) — o webhook
   `TRANSFER_DONE`/`TRANSFER_FAILED` resolve o estado depois.
4. Transferência exige **saldo disponível na conta Asaas** e a conta aprovada
   para transfers; em sandbox simule saldo antes de testar.

## Fase 5 — Admin, testes e rollout

- Página `admin/asaas.ejs` nos moldes da `pushinpay.ejs` (chave, URL, token do
  webhook, modo mock, botão "testar conexão", seletor do gateway ativo).
- Mock `mockAsaasService.js` espelhando o mock atual para dev/testes.
- Testes a adicionar (padrão `node:test` já usado):
  - webhook Asaas recusa token inválido;
  - conversão reais ↔ centavos sem erro de arredondamento (ex.: R$ 0,57);
  - idempotência de `PAYMENT_RECEIVED` duplicado;
  - `TRANSFER_FAILED` estorna saque PENDING uma única vez.
- Rollout: sandbox → produção com `payment_gateway=asaas` mas PushinPay ainda
  configurada (rollback = trocar uma setting) → remover PushinPay depois de
  1–2 semanas estáveis.

Estimativa: Fase 1 (0,5 dia), Fase 2 (1 dia), Fase 3 (1 dia), Fase 4 (1 dia), Fase 5 (1 dia).

---

## Decisão: Make + Pusher para "tempo real"?

**Recomendação: não usar Make no caminho do dinheiro, e não contratar Pusher agora.**

O problema real é só um: *avisar o navegador do jogador que o Pix caiu*. Hoje o
front já faz polling de 2,5 s em `/api/wallet/transactions`, que funciona.

| Opção | Caminho | Avaliação |
|---|---|---|
| **Make + Pusher** | Asaas → Make → Pusher → navegador | Pior opção: coloca um automatizador third-party no fluxo financeiro (latência, custo por operação, mais um ponto de falha e mais um lugar com credenciais). Se o Make cair ou o cenário pausar, depósito "não cai". |
| **Pusher direto** | Asaas → seu backend → Pusher → navegador | Funciona, mas é dependência externa paga para resolver algo que um monólito Express resolve sozinho. |
| **Polling (atual)** | navegador pergunta a cada 2,5 s | Já funciona, zero infra. Suficiente até centenas de usuários simultâneos. |
| **SSE (recomendado)** | Asaas → seu backend → evento SSE → navegador | Push de verdade com ~40 linhas no próprio Express, sem dependência nova. Comunicação é só servidor→cliente, exatamente o caso de uso. |

**Arquitetura recomendada:**

```
Asaas ──webhook──▶ POST /api/webhooks/asaas (valida token + reconsulta API)
                        │ credita (idempotente)
                        ▼
                  emite evento 'deposit:confirmed' para a sessão do usuário
                        │
             GET /api/events (SSE) ──▶ navegador atualiza saldo + animação de moedas
                        ▲
            polling atual mantido como fallback (rede móvel, proxy que corta SSE)
```

Esboço do SSE no monólito (um `Map<userId, Set<res>>` em memória):

```js
// routes: GET /api/events  (authMiddleware)
res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
sseClients.add(req.user.id, res);
req.on('close', () => sseClients.remove(req.user.id, res));

// no webhook, após creditar:
sseClients.send(userId, { type: 'deposit:confirmed', amountCents });
```

Limitação honesta: SSE em memória funciona enquanto houver **1 processo Node**
(que é o caso: better-sqlite3 também exige isso). Se um dia escalar para várias
instâncias, aí sim Pusher/Ably/Redis pub-sub viram a escolha certa — contratados
pelo backend, nunca via Make.

**Onde o Make até cabe:** automações fora do caminho crítico — ex. mandar
mensagem no Telegram/Slack a cada depósito aprovado ou saque em revisão manual.
