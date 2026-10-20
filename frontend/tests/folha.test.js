import test from "node:test";
import assert from "node:assert/strict";
import { S, CFG_PADRAO } from "../scripts/core/estado.js";
import { inss, irrf, fgts } from "../scripts/features/folha/regras.js";
import { estadoEm, remun, partesMes, folhaMes } from "../scripts/features/remuneracao.js";
import { excluirMudanca } from "../scripts/features/funcionarios/historico.js";
import { controleFerias, reciboFerias } from "../scripts/features/ferias.js";
import { gerarXlsx } from "../scripts/features/folha/xlsx.js";
import { ficha } from "../scripts/features/funcionarios/ficha.js";
import { csvFolha } from "../scripts/features/folha.js";

function preparar() {
  S.y = 2026; S.m = 9; S.ocs = []; S.func = [];
  S.cfg = {...CFG_PADRAO, aa: 0, feriados: []};
  S.rem = {carreiras: {analista: Array.from({length: 30}, (_, i) => 3000 * (i + 1))},
    comissao: {I: {salario: 6000, gratificacao: 1000}, II: {salario: 9000, gratificacao: 2000}},
    fg: {chefia: 1000, assessor1: 500, assessor2: 700}, estagio: {superior6: 2000, aprendiz: 1500},
    beneficios: {alimentacao: 0}, gratificacaoPct: 60};
}
const pessoa = () => ({id: "teste", nome: "Pessoa Teste", vinculo: "efetivo", admissao: "2025-01-01", carreira: "analista", nivelSalarial: 1, situacao: "ativo"});
const mudanca = (data="2026-10-15") => ({id: "h1", tipo: "nivel", data, de: 1, para: 2, ato: "Ato de teste"});

test("ficha sem lançamentos mantém calendário, tabela do ponto e CSS externo", () => {
  preparar(); S.recAbertos = new Set();
  const f = pessoa(); S.func = [f];
  const html = ficha(f);
  assert.match(html, /id="ponto-ficha"/);
  assert.match(html, /Calendário de 2026/);
  assert.doesNotMatch(html, /style=|<style/);
});

test("exportação CSV neutraliza fórmulas em nomes de funcionários", () => {
  preparar(); S.func = [{...pessoa(), nome: '=HYPERLINK("teste")'}];
  assert.match(csvFolha().data, /'\=HYPERLINK/);
});

test("INSS usa faixas progressivas e truncamento do HTML de referência", () => {
  assert.equal(inss(0), 0);
  assert.equal(inss(1621), 121.57);
  assert.equal(inss(8475.55), 988.07);
  assert.equal(inss(20000), 988.07);
});
test("IRRF aplica redução de 2026 e o exemplo publicado pela Receita", () => {
  assert.equal(irrf(5000, 0).ir, 0);
  assert.equal(irrf(6000, 649.60).ir, 382.88);
  assert.equal(irrf(7350.01, 988.07).ir, 840.80);
  assert.equal(irrf(3000, 400, 3).simplificado, false);
});
test("FGTS é encargo e usa 2% no aprendiz", () => {
  assert.equal(fgts(3000, false), 240);
  assert.equal(fgts(1500, true), 30);
});
test("mudança futura não altera remuneração anterior à vigência", () => {
  preparar(); const f = {...pessoa(), nivelSalarial: 2, historicoRem: [mudanca()]};
  assert.equal(remun(f, "2026-10-14").base, 3000);
  assert.equal(remun(f, "2026-10-15").base, 6000);
  assert.equal(estadoEm(f, "2026-10-14").nivelSalarial, 1);
});
test("nível automático anterior permanece dependente da data de referência", () => {
  preparar(); const f = {...pessoa(), nivelSalarial: 4, historicoRem: [{...mudanca(), de: 2, para: 4, deAuto: true}]};
  assert.equal(remun(f, "2025-09-01").nivel, 1);
  assert.equal(remun(f, "2026-10-14").nivel, 2);
  assert.equal(remun(f, "2026-10-15").nivel, 4);
});
test("mês de 31 dias e fevereiro usam 30 dias comerciais sem perder a mudança", () => {
  preparar();
  for (const [ano, mes, data] of [[2026, 0, "2026-01-15"], [2026, 1, "2026-02-15"], [2024, 1, "2024-02-15"]]) {
    const f = {...pessoa(), admissao: "2023-01-01", nivelSalarial: 2, historicoRem: [mudanca(data)]};
    const partes = partesMes(f, ano, mes);
    assert.equal(partes.reduce((n, p) => n + p.com, 0), 30);
    assert.equal(partes.reduce((n, p) => n + p.sal, 0), 4600);
  }
});
test("salário e gratificação são rateados independentemente", () => {
  preparar(); S.m = 8;
  const antes = {funcao: "Chefia", funcaoTipo: "comissao", nivel: "I", fgTipo: "", portariaFuncao: "Ato 1"};
  const depois = {...antes, nivel: "II", portariaFuncao: "Ato 2"};
  const f = {...pessoa(), ...depois, historicoRem: [{id: "g1", tipo: "grat", data: "2026-09-16", de: antes, para: depois}]};
  const fo = folhaMes(f);
  assert.equal(fo.prov.filter(p => p[0].startsWith("Salário base")).reduce((n,p) => n+p[1], 0), 3000);
  assert.equal(fo.prov.filter(p => p[0].includes("Gratificação")).reduce((n,p) => n+p[1], 0), 1500);
  assert.equal(fo.prov.filter(p => p[0].includes("Gratificação")).length, 2);
});
test("titulação, anuênio e descontos entram no contracheque; FGTS não é desconto", () => {
  preparar();
  const f = {...pessoa(), titulacaoPct: 10, anuenioPct: 2, outrosDescontos: 100, sindicalizado: true};
  const fo = folhaMes(f);
  assert.equal(fo.tributavel, 3360);
  assert.equal(fo.prov.find(p => p[0] === "Adicional de titulação")[1], 300);
  assert.equal(fo.prov.find(p => p[0] === "Anuênio")[1], 60);
  assert.equal(fo.desc.find(p => p[0] === "Mensalidade sindical")[1], 90.35);
  assert.equal(fo.liquido, Math.round((fo.bruto - fo.descontos) * 100) / 100);
  assert.equal(fo.desc.some(p => p[0].includes("FGTS")), false);
});
test("excluir a última mudança restaura o valor anterior e não altera o objeto original", () => {
  preparar(); const f = {...pessoa(), nivelSalarial: 2, historicoRem: [mudanca()]};
  const alterado = excluirMudanca(f, "h1");
  assert.equal(alterado.nivelSalarial, 1);
  assert.equal(alterado.historicoRem.length, 0);
  assert.equal(f.nivelSalarial, 2);
});
test("excluir uma mudança intermediária corrige o valor anterior da próxima", () => {
  preparar();
  const f = {...pessoa(), nivelSalarial: 3, historicoRem: [mudanca("2026-08-01"), {...mudanca("2026-10-15"), id: "h2", de: 2, para: 3}]};
  const alterado = excluirMudanca(f, "h1");
  assert.equal(alterado.nivelSalarial, 3);
  assert.equal(alterado.historicoRem[0].de, 1);
  assert.equal(remun(alterado, "2026-10-14").base, 3000);
});
test("recibo de férias usa a remuneração vigente no início do gozo", () => {
  preparar(); const f = {...pessoa(), nivelSalarial: 2, historicoRem: [mudanca()]};
  assert.equal(reciboFerias(f, 15, 0, 0, "2026-10-01").rem, 3000);
  assert.equal(reciboFerias(f, 15, 0, 0, "2026-10-16").rem, 6000);
});

test("dias vencidos têm remuneração dobrada sem dobrar a base previdenciária", () => {
  preparar(); const f = pessoa();
  const misto = reciboFerias(f, 15, 0, 15, "2026-10-01");
  assert.equal(misto.ferias, 1500);
  assert.equal(misto.dobro, 3000);
  assert.equal(misto.terco, 1500);
  assert.equal(misto.bruto, 6000);
  assert.equal(misto.trib, 4000);
  assert.equal(misto.baseIR, 6000);
  const vencido = reciboFerias(f, 0, 0, 30, "2026-10-01");
  assert.equal(vencido.bruto, 8000);
  assert.equal(vencido.trib, 4000);
});
test("período aquisitivo calculado permite controlar cadastros antigos sem períodos explícitos", () => {
  preparar(); const periodos = controleFerias(pessoa());
  assert.ok(periodos.length > 0);
  assert.ok(periodos.every(p => p.pa.inicio <= p.pa.fim));
});
test("exportação XLSX produz um ZIP de planilha, inclusive com texto que parece fórmula", async () => {
  const arquivo = gerarXlsx([{nome: "Teste", linhas: [["=1+1", 123.45]], larguras: [20, 15], moeda: [1], cab: 1}]);
  assert.ok(arquivo instanceof Blob);
  assert.deepEqual([...new Uint8Array(await arquivo.arrayBuffer()).slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
});
