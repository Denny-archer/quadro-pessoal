/** Infraestrutura compartilhada: datas. */

const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => {
  const [y, m, d] = String(s).split("-").map(Number);
  return new Date(y, m - 1, d);
};
const fmt = s => s ? s.split("-").reverse().join("/") : "—";
const fmtCurto = s => s ? s.split("-").slice(1).reverse().join("/") : "";
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const DAY = 864e5;
const hoje = new Date();
const HOJE = iso(hoje);
export { pad, iso, parse, fmt, fmtCurto, cap, DAY, hoje, HOJE };
