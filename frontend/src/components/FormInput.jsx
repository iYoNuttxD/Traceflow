// Campo de formulario reutilizavel.
// TODO: Adicionar exibicao padronizada de erros de validacao.
export function FormInput({ label, ...inputProps }) {
  return (
    <label>
      <span>{label}</span>
      <input {...inputProps} />
    </label>
  );
}
