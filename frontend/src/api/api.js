// Configuracao central do Axios. As chamadas HTTP futuras devem passar por este arquivo.
// TODO: Ajustar baseURL por ambiente e adicionar interceptors caso autenticacao seja implementada.
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
});
