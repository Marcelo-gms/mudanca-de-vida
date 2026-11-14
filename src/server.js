const app = require('./app');
const env = require('./config/env');
const { initSchema } = require('./config/database');

// Garante tabelas criadas antes de iniciar o listener
initSchema();

// A hospedagem (Passenger/cPanel) injeta process.env.PORT, que pode ser um número
// ou o caminho de um socket. Por isso usamos o valor cru, sem parseInt e sem host fixo.
const PORT = process.env.PORT || env.port;

const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` 🐯 Mini Plataforma iGaming Tigrinho iniciada com sucesso!`);
  console.log(` 🚀 Servidor escutando em: ${PORT}`);
  console.log(` 📦 Modo: ${env.nodeEnv} | Asaas Mock: ${env.asaas.enableMock}`);
  console.log(`=======================================================`);

  // Avisos de configuração insegura para produção
  if (env.nodeEnv === 'production') {
    if (env.asaas.enableMock) {
      console.warn(' ⚠️  ATENÇÃO: modo mock do Asaas ativo em produção — pagamentos NÃO são reais.');
    }
    if (!env.asaas.webhookToken) {
      console.warn(' ⚠️  ATENÇÃO: ASAAS_WEBHOOK_TOKEN não configurado — webhooks serão rejeitados.');
    }
    if (env.sessionSecret.includes('fallback')) {
      console.warn(' ⚠️  ATENÇÃO: SESSION_SECRET padrão em uso — defina um segredo forte no .env.');
    }
  }
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('Encerrando servidor gracefully...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('Encerrando servidor...');
  server.close(() => process.exit(0));
});

