/** Mesmos limites do backend: bcrypt aceita no máximo 72 bytes. */
export function problemaSenha(atual, nova, confirma) {
  if (!atual) return {
    campo: "s-atual",
    mensagem: "Informe sua senha atual."
  };
  if ([...nova].length < 10) return {
    campo: "s-nova",
    mensagem: "A nova senha precisa ter pelo menos 10 caracteres."
  };
  if (new TextEncoder().encode(nova).length > 72) return {
    campo: "s-nova",
    mensagem: "A nova senha ultrapassa o limite permitido. Reduza o tamanho."
  };
  if (nova === atual) return {
    campo: "s-nova",
    mensagem: "Escolha uma senha diferente da atual."
  };
  if (!confirma) return {
    campo: "s-confirma",
    mensagem: "Confirme a nova senha."
  };
  if (nova !== confirma) return {
    campo: "s-confirma",
    mensagem: "As novas senhas precisam ser iguais."
  };
  return null;
}
