const fallbackMessage = 'Não foi possível concluir a operação com o GitHub. Tente novamente.';

const githubOAuthErrors = Object.freeze({
  email_conflict:
    'Já existe uma conta TraceFlow associada a este endereço. Entre com sua conta atual e vincule o GitHub em Configurações.',
  verified_email_required:
    'Sua conta GitHub precisa ter um e-mail principal verificado para criar uma conta TraceFlow.',
  invalid_state: 'A confirmação com GitHub não é mais válida. Inicie novamente.',
  expired_state: 'A confirmação com GitHub expirou. Inicie novamente.',
  identity_conflict: 'Esta conta GitHub já está vinculada a outra conta TraceFlow.',
  identity_exists: 'Esta conta TraceFlow já possui uma identidade GitHub vinculada.',
  identity_mismatch:
    'A conta GitHub confirmada não corresponde à identidade vinculada. Tente novamente.',
  account_anonymized: 'Esta conta não pode mais ser vinculada ao GitHub.',
  unavailable: 'A operação com GitHub está indisponível agora. Tente novamente mais tarde.',
  oauth_failed: fallbackMessage
});

export function githubOAuthErrorMessage(reason) {
  return githubOAuthErrors[reason] || fallbackMessage;
}
