import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { S, CFG_PADRAO } from "../scripts/core/estado.js";
import { horasPeriodo, totaisSemana, checaHibrido } from "../scripts/core/jornada.js";
import { calcBen, diasUteisMes } from "../scripts/features/beneficios.js";
import { extrasNoMes, totalExtras } from "../scripts/features/beneficios-extras.js";
import { anosDeCasa } from "../scripts/features/remuneracao.js";
import { passaDe2Anos } from "../scripts/features/contratos.js";

const pessoa = extras => ({
  id: "pessoa-sintetica", nome: "Pessoa de teste", vinculo: "efetivo",
  admissao: "2020-01-01", situacao: "ativo", regime: "Presencial",
  entrada: "08:00", saida: "17:00", intervalo: 60,
  usaTransporte: true, valorTransporte: 420, beneficiosExtras: [], ...extras
});

beforeEach(() => {
  S.cfg = { ...CFG_PADRAO, feriados: ["2026-10-12"] };
  S.func = []; S.ocs = []; S.rem = null;
});

test("intervalo só é descontado acima de seis horas contínuas", () => {
  assert.equal(horasPeriodo("08:00", "14:00", 60), 6);
  assert.equal(horasPeriodo("08:00", "17:00", 60), 8);
  assert.equal(horasPeriodo("14:00", "08:00", 60), 0);
});

test("jornada presencial e teletrabalho mantêm quarenta horas semanais", () => {
  assert.deepEqual(totaisSemana(pessoa()), { p: 40, h: 0, t: 40 });
  assert.deepEqual(totaisSemana(pessoa({ regime: "Teletrabalho" })), { p: 0, h: 40, t: 40 });
});

test("híbrido diário preserva trinta horas presenciais e dez remotas", () => {
  const dia = { tipo: "M", pe: "08:00", ps: "14:00", he: "15:00", hs: "17:00" };
  const semana = Object.fromEntries([1, 2, 3, 4, 5].map(d => [d, { ...dia }]));
  assert.equal(checaHibrido(semana), "diario");
  assert.deepEqual(totaisSemana(pessoa({ regime: "Híbrido", semana })), { p: 30, h: 10, t: 40 });
});

test("o mês de outubro de 2026 tem vinte e um dias úteis com o feriado configurado", () => {
  assert.equal(diasUteisMes(2026, 9).length, 21);
  assert.ok(!diasUteisMes(2026, 9).includes("2026-10-12"));
});

test("benefícios mensais completos preservam alimentação e transporte", () => {
  const b = calcBen(pessoa(), 2026, 9);
  assert.equal(b.aa, 2100); assert.equal(b.at, 420); assert.equal(b.total, 2520);
});

test("teletrabalho integral desconta transporte e conserva alimentação", () => {
  const b = calcBen(pessoa({ regime: "Teletrabalho" }), 2026, 9);
  assert.equal(b.aa, 2100); assert.equal(b.at, 0); assert.equal(b.atMot.ho, 21);
});

test("admissão durante o mês proporcionaliza os benefícios", () => {
  const b = calcBen(pessoa({ admissao: "2026-10-15" }), 2026, 9);
  assert.equal(b.eleg, 12); assert.equal(b.aa, 1200); assert.equal(b.at, 240);
});

test("contrato temporário aplica percentual e período do contrato", () => {
  const b = calcBen(pessoa({ vinculo: "estagiario", contratoInicio: "2026-10-15", contratoFim: "2026-10-23" }), 2026, 9);
  assert.equal(b.eleg, 7); assert.equal(b.aa, 350);
});

test("atestado parcial conserva transporte; afastamento integral desconta", () => {
  S.ocs = [{ id: "oc-sintetica", func: "pessoa-sintetica", tipo: "atestado", inicio: "2026-10-05", fim: "2026-10-07", parcial: true }];
  assert.equal(calcBen(pessoa(), 2026, 9).at, 420);
  S.ocs[0].parcial = false;
  const b = calcBen(pessoa(), 2026, 9);
  assert.equal(b.at, 360); assert.equal(b.aa, 2100);
});

test("desconto de alimentação respeita o modo excedente", () => {
  S.cfg.modo = "excedente";
  S.ocs = [{ id: "oc-longa", func: "pessoa-sintetica", tipo: "atestado", inicio: "2026-10-01", fim: "2026-10-31", parcial: false }];
  const b = calcBen(pessoa(), 2026, 9);
  assert.equal(b.aaDescDias, 11); assert.equal(b.aa, 1000);
});

test("benefícios extras respeitam mês e período de vigência", () => {
  const f = pessoa({ beneficiosExtras: [
    { tipo: "creche", valor: 500, recorrencia: "mensal", inicio: "2026-10" },
    { tipo: "natal", valor: 200, recorrencia: "meses", meses: [11], inicio: "2026-01" },
    { tipo: "outro", valor: 100, recorrencia: "mensal", inicio: "2026-11" }
  ] });
  assert.equal(extrasNoMes(f, 2026, 9).length, 1);
  assert.equal(totalExtras(f, 2026, 9), 500);
  assert.equal(totalExtras(f, 2026, 11), 800);
});

test("tempo de casa só completa o ano no aniversário da admissão", () => {
  assert.equal(anosDeCasa("2020-10-09", new Date(2026, 9, 8)), 5);
  assert.equal(anosDeCasa("2020-10-09", new Date(2026, 9, 9)), 6);
});

test("limite de contrato mantém a fronteira dos dois anos", () => {
  assert.equal(passaDe2Anos("2024-10-09", "2026-10-08"), false);
  assert.equal(passaDe2Anos("2024-10-09", "2026-10-09"), true);
});
