/** Infraestrutura compartilhada: constantes. */

const TIPOS = {
  ferias: {
    nome: "Férias",
    sigla: "F",
    cor: "var(--c-ferias)"
  },
  atestado: {
    nome: "Atestado",
    sigla: "AT",
    cor: "var(--c-atestado)"
  },
  abono: {
    nome: "Abono",
    sigla: "AB",
    cor: "var(--c-abono)"
  },
  viagem: {
    nome: "Viagem",
    sigla: "V",
    cor: "var(--c-viagem)"
  },
  capacitacao: {
    nome: "Capacitação",
    sigla: "C",
    cor: "var(--c-capacitacao)"
  },
  banco: {
    nome: "Banco de horas",
    sigla: "BH",
    cor: "var(--c-banco)"
  }
};
const AUSENCIAS = ["atestado", "ferias", "abono", "viagem", "capacitacao"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WD = ["D", "S", "T", "Q", "Q", "S", "S"];
const VINC = {
  efetivo: "Empregado efetivo",
  comissionado: "Emprego em comissão (sem vínculo)",
  cedido: "Cedido de outro órgão",
  estagiario: "Estagiário",
  aprendiz: "Jovem aprendiz"
};
const VINC_TAG = {
  estagiario: "estágio",
  aprendiz: "aprendiz",
  cedido: "cedido"
};
const FUNCAO_TIPO = {
  comissao: "Emprego em comissão",
  fg: "Função gratificada"
};
const SIT_CONTRATO = [["vencido", "Vencido", "var(--bad)", "prazo encerrado — regularizar ou desligar"], ["critico", "Crítico", "var(--bad)", "vence em até 30 dias — prorrogar ou desligar agora"], ["atencao", "Atenção", "var(--c-abono)", "vence em 31 a 60 dias — iniciar o trâmite"], ["proximo", "Próximo", "var(--c-viagem)", "vence em 61 a 90 dias — acompanhar"], ["vigente", "Em vigência", "var(--good)", "faltam mais de 90 dias"], ["naoinic", "Não iniciado", "var(--c-capacitacao)", "início depois de hoje"], ["semdata", "Sem data", "var(--c-banco)", "faltam as datas do contrato"]];
const SIT_C = Object.fromEntries(SIT_CONTRATO.map(([k, n, c, d]) => [k, {
  nome: n,
  cor: c,
  desc: d
}]));
export { TIPOS, AUSENCIAS, MESES, WD, VINC, VINC_TAG, FUNCAO_TIPO, SIT_CONTRATO, SIT_C };
