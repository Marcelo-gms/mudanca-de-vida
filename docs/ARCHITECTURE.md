# Especificação Técnica: Mini Plataforma iGaming Monolítica (Node.js + EJS + Canvas)

Este documento atua como o **Plano de Contexto e Arquitetura** para desenvolvimento assistido por Inteligência Artificial no VS Code. Ele define as diretrizes matemáticas, de infraestrutura com a gateway **Asaas**, e travas críticas de SecOps.

---

## 1. Visão Geral da Arquitetura Monolítica

A aplicação é estruturada como um monolito único em Node.js usando Express, maximizando a eficiência de contexto para a IA e eliminando problemas de CORS ou latência entre microsserviços.

```
[Navegador do Usuário] 
      │ 
      ▼ (HTML5 Canvas / Renderização de Views via EJS)
[Servidor Express Monolítico] 
      ├── Módulo 1: Motor Matemático (CSPRNG Criptográfico)
      ├── Módulo 2: Motor de Carteira & Transações (Seamless Interno)
      └── Módulo 3: Integração via API/Webhooks com o Asaas
```

---

## 2. Motor Matemático: Algoritmo CSPRNG & Modelo PAR

O sistema de rolos não utiliza `Math.random()`. Em vez disso, adota um **Gerador de Números Pseudoaleatórios Criptograficamente Seguro (CSPRNG)** baseado na biblioteca nativa `crypto` do Node.js, mitigando riscos de engenharia reversa.

### 2.1 Lógica de Sorteio de Rolos Virtuais (Reel Strips)
Cada um dos 3 rolos virtuais é representado por uma tabela de mapeamento assimétrico de pesos, calibrada para perseguir estatisticamente um **RTP teórico de 96% com Alta Volatilidade**.

*   **Tabela de Símbolos, Pesos e Multiplicadores (Matriz de Configuração):**
    *   `TIGRE` (Premium/Wild): Peso 2 (Raro) | Multiplicador: **50x**
    *   `MOEDA`: Peso 8 | Multiplicador: **10x**
    *   `BARRA`: Peso 20 | Multiplicador: **5x**
    *   `LARANJA` (Low): Peso 70 (Comum) | Multiplicador: **2x**

### 2.2 Algoritmo de Sorteio Criptográfico (Blueprint)
```javascript
const crypto = require('crypto');

// Estrutura de pesos acumulados para seleção ponderada
const roloConfig = [
    { id: 'TIGRE', peso: 2, mult: 50 },
    { id: 'MOEDA', peso: 8, mult: 10 },
    { id: 'BARRA', peso: 20, mult: 5 },
    { id: 'LARANJA', peso: 70, mult: 2 }
];

function gerarSimboloAleatorio() {
    const pesoTotal = roloConfig.reduce((acc, curr) => acc + curr.peso, 0); // 100
    
    // Geração de bytes aleatórios seguros
    const randomByte = crypto.randomBytes(4).readUInt32BE(0);
    const numeroSorteado = randomByte % pesoTotal; // Resto garante o intervalo [0, pesoTotal-1]

    let somaPesos = 0;
    for (const simbolo of roloConfig) {
        somaPesos += simbolo.peso;
        if (numeroSorteado < somaPesos) {
            return simbolo;
        }
    }
}
```

---

## 3. Integração com a Gateway Asaas

A comunicação financeira de Pay-in (Depósito) e Pay-out (Saque) utiliza o protocolo REST do Asaas (API v3) com API Key injetada via variáveis de ambiente (`process.env`) ou configurado dinamicamente no painel administrativo `/admin/asaas`.

### 3.1 Credenciais e Configuração
*   `ASAAS_API_KEY`: chave de autenticação (enviada no header `access_token`)
*   `ASAAS_URL_BASE`: 
    *   Produção: `https://api.asaas.com/v3`
    *   Sandbox: `https://api-sandbox.asaas.com/v3`
*   `ASAAS_WEBHOOK_TOKEN`: token definido no cadastro do webhook; o Asaas o envia no header `asaas-access-token` (OBRIGATÓRIO em produção).
*   `ENABLE_ASAAS_MOCK`: Booleano para simular QR Codes e saques localmente sem API Key ativa.

### 3.2 Endpoints e Payloads Mapeados

> O Asaas trabalha com valores em **reais decimais** (`value: 20.00`); internamente o sistema usa centavos. A conversão fica isolada em `src/services/asaasService.js`.

#### A. Pay-in (Depósito Pix)
1.  **Cliente:** `POST /v3/customers` com `{ name, cpfCnpj }` na primeira cobrança do usuário; o id retornado é persistido em `users.asaas_customer_id` para reuso.
2.  **Cobrança:** `POST /v3/payments` com `{ customer, billingType: "PIX", value, dueDate, externalReference: <txId interno> }`.
3.  **QR Code:** `GET /v3/payments/{id}/pixQrCode` retorna `{ encodedImage (base64), payload (copia-e-cola), expirationDate }`.
*   O `payment.id` é armazenado em `transactions.external_reference`; o `externalReference` enviado é o `txId` interno (elo nos dois sentidos).

#### B. Pay-out (Saque Pix via Transfers)
*   **Endpoint:** `POST /v3/transfers`
*   **Body:** `{ value, operationType: "PIX", pixAddressKey: <CPF do titular>, pixAddressKeyType: "CPF" }`
*   **Status possíveis:** `PENDING`, `BANK_PROCESSING`, `DONE`, `FAILED`, `CANCELLED`. Se não vier `DONE` na resposta síncrona, o saque permanece `PENDING` aguardando o webhook `TRANSFER_DONE`.

#### C. Webhook de Confirmação
*   **Endpoint da Aplicação:** `POST /api/webhooks/asaas`
*   **Payload Recebido:** `{ event: "PAYMENT_RECEIVED" | "PAYMENT_CONFIRMED" | "TRANSFER_DONE" | "TRANSFER_FAILED" | "TRANSFER_CANCELLED", payment | transfer: { ... } }`
*   **Defesas obrigatórias (implementadas):**
    1.  Validação do header `asaas-access-token` contra `asaas_webhook_token`.
    2.  Reconsulta do status real na API (`GET /v3/payments/{id}` ou `GET /v3/transfers/{id}`) antes de creditar/estornar.
    3.  Crédito apenas de transações `type = 'DEPOSIT'`, sempre pelo `amount_cents` do banco (nunca pelo valor do payload).
    4.  Idempotência: transação `COMPLETED` responde HTTP 200 `{ status: "ALREADY_PROCESSED" }`.
    5.  Resposta 200 rápida: a fila de webhooks do Asaas pausa se o endpoint falhar repetidamente.

---

## 4. Nuances Críticas de SecOps e Travas de Segurança

Para mitigar fraudes de abuso de bônus, ataques de concorrência ou brechas regulatórias, o Node.js deve implementar as seguintes travas a nível de banco de dados e rotas.

### 4.1 Controle Extremo de Concorrência (Prevenção de Race Condition / Double Spending)
*   **Risco:** O usuário clica simultaneamente em "Girar" ou "Sacar" usando múltiplos disparos assíncronos. Se o saldo for lido antes que a requisição anterior termine, o saldo ficará negativo.
*   **Solução:** Sempre que a rota `/api/spin` ou `/api/wallet/withdraw` for acionada, a transação SQLite/WAL deve ser aberta no modo imediato (`db.transaction(...).immediate()`). O saldo deve ser decrementado **antes** do cálculo do PRNG ou da chamada externa de saque do Asaas.

### 4.2 Regra de Rollover Estrita (Giro de Saldo)
*   **Risco:** Usuário deposita via Pix, não joga, e solicita o saque imediatamente para limpar dinheiro de origem ilícita, gerando custo de taxas para a plataforma.
*   **Solução:** Cada usuário possui os campos `total_deposited` e `total_bet` em seu perfil. A rota de saque recusa a transação caso a validação abaixo falhe:
    $$\text{total\_bet} < \text{total\_deposited} \times \text{FatorRollover (padrão: 1.0)}$$

### 4.3 Trava de CPF Casado (Anti-Fraude de Saque)
*   **Risco:** Alguém descobre a senha de um usuário e solicita um saque transferindo o saldo para uma chave Pix de terceiros.
*   **Solução:** O sistema só permite saques onde o tipo de chave seja `CPF` e o valor da chave corresponda exatamente ao CPF cadastrado pelo usuário (e validado pelo Asaas na transferência). É estritamente proibido enviar Payout para CPFs divergentes do titular da conta na plataforma.

---

## 5. Bootstrapper de Contexto para a IA (Prompt Guia)

*Utilize este comando sempre que iniciar uma nova funcionalidade no chat do Gemini no VS Code:*

> "Aja como um engenheiro de software especialista em iGaming. Leia e siga estritamente a arquitetura descrita em `docs/ARCHITECTURE.md`. Toda lógica matemática de rolos deve herdar o modelo CSPRNG e a configuração PAR descrita no pilar 2. Não utilize Math.random. Toda rota financeira de saque ou giro criada no Express deve implementar nativamente as proteções de concorrência e as travas de CPF/Rollover descritas no pilar 4. Escreva códigos limpos, performáticos e integre-os à nossa estrutura monolítica."

---
## 6. Referências Técnicas para Alinhamento Lógico da IA
A IA deve usar os padrões lógicos estruturais destes modelos conceituais para guiar o desenvolvimento das funções:
*   [Documentação Oficial do Asaas](https://docs.asaas.com/)
*   [Lógica de Provably Fair Criptográfico (SHA-256/HMAC)](https://github.com/brave/provably-fair)
