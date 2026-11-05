# Especificação Técnica: Mini Plataforma iGaming Monolítica (Node.js + EJS + Canvas)

Este documento atua como o **Plano de Contexto e Arquitetura** para desenvolvimento assistido por Inteligência Artificial no VS Code. Ele define as diretrizes matemáticas, de infraestrutura com a gateway **PushinPay**, e travas críticas de SecOps.

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
      └── Módulo 3: Integração via API/Webhooks com a PushinPay
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

## 3. Integração com a Gateway PushinPay

A comunicação financeira de Pay-in (Depósito) e Pay-out (Saque) utiliza o protocolo REST da PushinPay com Bearer Token injetado via variáveis de ambiente (`process.env`) ou configurado dinamicamente no painel administrativo `/admin/pushinpay`.

### 3.1 Credenciais e Configuração
*   `PUSHINPAY_TOKEN`: Bearer token de autenticação (enviado no header `Authorization: Bearer <TOKEN>`)
*   `PUSHINPAY_URL_BASE`: 
    *   Produção: `https://api.pushinpay.com.br/api`
    *   Sandbox: `https://api-sandbox.pushinpay.com.br/api`
*   `ENABLE_PUSHINPAY_MOCK`: Booleano para simular QR Codes e saques localmente sem token ativo.

### 3.2 Endpoints e Payloads Mapeados

#### A. Pay-in (Geração de Pix Copia e Cola / QR Code)
*   **Endpoint:** `POST /api/pix/cashIn`
*   **Campos Requeridos no Body:** 
    *   `value` (inteiro em centavos, ex: R$ 20,00 = `2000`)
    *   `webhook_url` (URL de retorno para notificação instantânea)
*   **Retorno:** Objeto com `id` (armazenado como `external_reference`), `qr_code` (Pix copia e cola), `qr_code_base64` e `status: "created"`.

#### B. Pay-out (Envio de Saque Automatizado via Pix)
*   **Endpoint:** `POST /api/pix/cashOut`
*   **Campos Requeridos no Body:** 
    *   `value` (inteiro em centavos)
    *   `pix_key` (chave Pix, obrigatoriamente o CPF do titular)
    *   `pix_key_type`: `"national_registration"` (CPF)
    *   `receiver_national_registration`: Documento do recebedor (deve ser idêntico ao CPF cadastrado)
    *   `webhook_url`: URL de confirmação do cash-out.

#### C. Webhook de Confirmação de Pagamento
*   **Endpoint da Aplicação:** `POST /api/webhooks/pushinpay`
*   **Payload Recebido:** `{ id: number, status: "paid", value: number, end_to_end_id: string }`
*   **Processamento Idempotente:** A transação é localizada pelo `external_reference` (o `id` retornado no cashIn). Se já estiver paga, responde HTTP 200 `{ status: "ALREADY_PROCESSED" }`. Quando confirmada, credita o saldo atomicamente e registra o `end_to_end_id` nos metadados.

---

## 4. Nuances Críticas de SecOps e Travas de Segurança

Para mitigar fraudes de abuso de bônus, ataques de concorrência ou brechas regulatórias, o Node.js deve implementar as seguintes travas a nível de banco de dados e rotas.

### 4.1 Controle Extremo de Concorrência (Prevenção de Race Condition / Double Spending)
*   **Risco:** O usuário clica simultaneamente em "Girar" ou "Sacar" usando múltiplos disparos assíncronos. Se o saldo for lido antes que a requisição anterior termine, o saldo ficará negativo.
*   **Solução:** Sempre que a rota `/api/spin` ou `/api/wallet/withdraw` for acionada, a transação SQLite/WAL deve ser aberta no modo imediato (`db.transaction(...).immediate()`). O saldo deve ser decrementado **antes** do cálculo do PRNG ou da chamada externa de saque da PushinPay.

### 4.2 Regra de Rollover Estrita (Giro de Saldo)
*   **Risco:** Usuário deposita via Pix, não joga, e solicita o saque imediatamente para limpar dinheiro de origem ilícita, gerando custo de taxas para a plataforma.
*   **Solução:** Cada usuário possui os campos `total_deposited` e `total_bet` em seu perfil. A rota de saque recusa a transação caso a validação abaixo falhe:
    $$\text{total\_bet} < \text{total\_deposited} \times \text{FatorRollover (padrão: 1.0)}$$

### 4.3 Trava de CPF Casado (Anti-Fraude de Saque)
*   **Risco:** Alguém descobre a senha de um usuário e solicita um saque transferindo o saldo para uma chave Pix de terceiros.
*   **Solução:** O sistema só permite saques onde o tipo de chave seja `CPF` e o valor da chave corresponda exatamente ao CPF cadastrado pelo usuário (e validado pela PushinPay na transferência). É estritamente proibido enviar Payout para CPFs divergentes do titular da conta na plataforma.

---

## 5. Bootstrapper de Contexto para a IA (Prompt Guia)

*Utilize este comando sempre que iniciar uma nova funcionalidade no chat do Gemini no VS Code:*

> "Aja como um engenheiro de software especialista em iGaming. Leia e siga estritamente a arquitetura descrita em `docs/ARCHITECTURE.md`. Toda lógica matemática de rolos deve herdar o modelo CSPRNG e a configuração PAR descrita no pilar 2. Não utilize Math.random. Toda rota financeira de saque ou giro criada no Express deve implementar nativamente as proteções de concorrência e as travas de CPF/Rollover descritas no pilar 4. Escreva códigos limpos, performáticos e integre-os à nossa estrutura monolítica."

---
## 6. Referências Técnicas para Alinhamento Lógico da IA
A IA deve usar os padrões lógicos estruturais destes modelos conceituais para guiar o desenvolvimento das funções:
*   [Documentação Oficial da PushinPay](https://pushinpay.com.br/)
*   [Lógica de Provably Fair Criptográfico (SHA-256/HMAC)](https://github.com/brave/provably-fair)
