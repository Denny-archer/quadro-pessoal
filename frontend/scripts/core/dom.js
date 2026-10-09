/** Infraestrutura compartilhada: dom. */

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
})[c]);
function errMsg(e) {
  const c = e && e.code;
  if (e && e.mensagem) return e.mensagem; // mensagem do servidor
  if (c === "invalid_argument") return "Você não tem permissão para alterar estes dados, ou o registro é inválido.";
  if (c === "quota_exceeded") return "O armazenamento atingiu o limite de registros. Exclua lançamentos antigos (exporte o CSV antes) e tente de novo.";
  if (c === "resource_exhausted") return "Muitas alterações seguidas. Aguarde alguns segundos e tente de novo.";
  return "Não foi possível salvar agora. Verifique a conexão e tente de novo.";
}
let toastT;
function toast(msg) {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toastT);
  toastT = setTimeout(() => t.remove(), 2600);
}
function dialogo(id, html) {
  let d = document.getElementById(id);
  if (!d) {
    d = document.createElement("dialog");
    d.id = id;
    d.className = "dlg-wide";
    document.body.appendChild(d);
  }
  d.innerHTML = html;
  d.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => d.close()));
  return d;
}
export { $, esc, errMsg, toastT, toast, dialogo };
