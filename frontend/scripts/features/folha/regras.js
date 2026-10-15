import { r2 } from "../../core/formatacao.js";
const trunc = v => Math.floor(v * 100 + 1e-6) / 100;
const INSS_2026 = [[1621.00, 0.075], [2902.84, 0.09], [4354.27, 0.12], [8475.55, 0.14]];
function inss(base, tabela = INSS_2026) {
  let anterior = 0,
    total = 0;
  for (const [limite, aliq] of tabela) {
    if (base <= anterior) break;
    total += trunc((Math.min(base, limite) - anterior) * aliq);
    anterior = limite;
  }
  return r2(total);
}
const IRRF_2026 = {
  faixas: [[2428.80, 0, 0], [2826.65, 0.075, 182.16], [3751.05, 0.15, 394.16], [4664.68, 0.225, 675.49], [Infinity, 0.275, 908.73]],
  dependente: 189.59,
  simplificado: 607.20,
  // desconto simplificado mensal: usado quando é maior que INSS + dependentes
  reducao: {
    isentoAte: 5000.00,
    ate: 7350.00,
    a: 978.62,
    b: 0.133145
  }
};
function irrf(tributavel, inssDesc, dependentes = 0, T = IRRF_2026) {
  const legais = inssDesc + dependentes * T.dependente;
  const deducao = Math.max(legais, T.simplificado);
  const base = Math.max(0, r2(tributavel - deducao));
  const [, aliq, parcela] = T.faixas.find(([lim]) => base <= lim);
  let ir = Math.max(0, base * aliq - parcela);
  if (tributavel <= T.reducao.isentoAte) ir = 0;else if (tributavel <= T.reducao.ate) ir = Math.max(0, ir - (T.reducao.a - T.reducao.b * tributavel));
  return {
    base,
    ir: r2(ir),
    aliq,
    simplificado: legais < T.simplificado
  };
}
const fgts = (base, aprendiz) => r2(base * (aprendiz ? 0.02 : 0.08));
export { trunc, INSS_2026, inss, IRRF_2026, irrf, fgts };
export { r2 } from "../../core/formatacao.js";
