/** Infraestrutura compartilhada: formatacao. */

const fmtH = h => {
  const v = Math.round(h * 10) / 10;
  return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toLocaleString("pt-BR") + " h";
};
const brl = v => (Number(v) || 0).toLocaleString("pt-BR", {
  style: "currency",
  currency: "BRL"
});
const n2 = v => (Number(v) || 0).toLocaleString("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const r2 = v => Math.round(v * 100) / 100;
export { fmtH, brl, n2, r2 };
