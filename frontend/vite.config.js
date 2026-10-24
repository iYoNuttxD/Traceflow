import { defineConfig, loadEnv } from 'vite';
import { validateProductionBundle, validateProductionEnvironment } from './production-contract.js';

export default defineConfig(({ command, mode }) => {
  if (command !== 'build') return {};
  // Every deployable build uses the production contract, even with a custom --mode.
  const environment = {
    ...loadEnv(mode, process.cwd(), 'VITE_'),
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('VITE_')))
  };
  const base = validateProductionEnvironment(environment);
  return {
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(base) },
    plugins: [
      {
        name: 'traceflow-production-contract',
        enforce: 'post',
        generateBundle(_options, bundle) {
          validateProductionBundle(bundle);
        }
      }
    ]
  };
});
