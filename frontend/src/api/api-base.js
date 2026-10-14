export function configuredApiBase() {
  return (
    import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:3001/api')
  );
}
