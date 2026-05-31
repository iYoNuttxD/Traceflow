// Configuracao principal da aplicacao Express do TRACEFLOW.
// TODO: Registrar middlewares adicionais somente conforme as necessidades do MVP.
import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  return res.json({
    status: 'ok',
    message: 'TRACEFLOW backend structure is ready.'
  });
});

app.use('/api', routes);

export default app;
