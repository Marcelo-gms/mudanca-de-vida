const app = require('./app');
const env = require('./config/env');
const { initSchema } = require('./config/database');

// Garante tabelas criadas antes de iniciar o listener
initSchema();

const server = app.listen(env.port, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(` 🐯 Mini Plataforma iGaming Tigrinho iniciada com sucesso!`);
  console.log(` 🚀 Servidor rodando em: http://localhost:${env.port} ou http://0.0.0.0:${env.port}`);
  console.log(` 📦 Modo: ${env.nodeEnv} | PushinPay Mock: ${env.pushinpay.enableMock}`);
  console.log(`=======================================================`);
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

