// Ponto de entrada do backend TRACEFLOW. A configuracao da aplicacao fica em app.js.
// TODO: Adicionar encerramento controlado do servidor quando a infraestrutura exigir.
import app from './app.js';
import { env } from './config/env.js';

app.listen(env.port, () => {
  console.log(`TRACEFLOW backend running on port ${env.port}`);
});
