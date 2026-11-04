const { spawn } = require('child_process');
const settingsService = require('../src/services/settingsService');

const PORT = process.env.PORT || 3000;

console.log(`=======================================================`);
console.log(` 🌐 Iniciando Túnel Seguro para Webhook da SuitPay...`);
console.log(` 📡 Porta local direcionada: ${PORT}`);
console.log(`=======================================================\n`);

// Inicia localtunnel via npx de forma automática
const lt = spawn('npx', ['--yes', 'localtunnel', '--port', String(PORT)]);

lt.stdout.on('data', (data) => {
  const output = data.toString();
  console.log(output);

  // Detecta URL pública gerada
  const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.loca\.lt/);
  if (match) {
    const publicUrl = match[0];
    const webhookUrl = `${publicUrl}/api/webhooks/suitpay`;

    // Atualiza automaticamente no banco de configurações
    settingsService.set('public_webhook_url', webhookUrl);

    console.log(`\n=======================================================`);
    console.log(` 🎉 TÚNEL PÚBLICO CRIADO COM SUCESSO!`);
    console.log(` 🔗 URL Base Pública:   ${publicUrl}`);
    console.log(` 🔔 URL DO SEU WEBHOOK: ${webhookUrl}`);
    console.log(` 👉 Cadastre esta URL do Webhook no portal da SuitPay!`);
    console.log(`=======================================================\n`);
  }
});

lt.stderr.on('data', (data) => {
  console.error('[Tunnel Log]:', data.toString());
});

lt.on('close', (code) => {
  console.log(`Túnel encerrado com código ${code}`);
});

process.on('SIGINT', () => {
  lt.kill();
  process.exit();
});

