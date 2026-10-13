import test from "node:test";
import assert from "node:assert/strict";
import { intervaloSemana, duracaoPonto, totalizarPonto, tabelaPonto, criarConsultaPonto, periodosPonto } from "../scripts/features/funcionarios/ponto.js";

const semana = { de: "2026-10-12", ate: "2026-10-18" };
const linha = { data: "2026-10-13", dados: {
  marcacoes: [{ momento: "2026-10-13T11:34:00Z", acao: "entrada", local: "presencial" },
    { momento: "2026-10-13T17:34:00Z", acao: "saida", local: "presencial" }],
  segundos_presenciais: 21600, segundos_remotos: 0, segundos_registrados: 21600,
  segundos_oficiais: 21600, carga_esperada_segundos: 21600, saldo_segundos: 0,
  situacao_ponto: "Normal", pendencias: []
} };

test("a semana inclui segunda a domingo e atravessa meses/anos", () => {
  assert.deepEqual(intervaloSemana("2026-10-13"), semana);
  assert.deepEqual(intervaloSemana("2027-01-01"), { de: "2026-12-28", ate: "2027-01-03" });
  assert.deepEqual(intervaloSemana("2026-10-18"), semana);
});
test("as batidas 08:34/14:34 exibem seis horas do ponto sem cadastro de horários", () => {
  const html = tabelaPonto([linha], semana, "2026-10-13");
  assert.match(html, /08:34/); assert.match(html, /14:34/); assert.match(html, /06:00/);
  assert.match(html, /data-ponto-dia="2026-10-13"/);
  assert.equal((html.match(/Sem apuração recebida/g) || []).length, 1);
  assert.equal((html.match(/Dia futuro/g) || []).length, 3);
});
test("valores oficiais, saldo e modalidades são conservados, inclusive quando divergem das horas registradas", () => {
  const registro = { ...linha, dados: { ...linha.dados, segundos_presenciais: 14400,
    segundos_remotos: 7200, segundos_oficiais: 25200, saldo_segundos: -3600 } };
  assert.deepEqual(totalizarPonto([registro]), { segundos_presenciais: 14400, segundos_remotos: 7200,
    segundos_registrados: 21600, segundos_oficiais: 25200, carga_esperada_segundos: 21600, saldo_segundos: -3600 });
  const html = tabelaPonto([registro], semana);
  for (const tempo of ["04:00", "02:00", "06:00", "07:00", "−01:00"]) assert.ok(html.includes(tempo));
});
test("sem apuração não se inventam zero horas, totais ou falta", () => {
  const html = tabelaPonto([], semana, "2026-10-18");
  assert.equal((html.match(/Sem apuração recebida/g) || []).length, 5);
  assert.ok(!html.includes("00:00")); assert.ok(!html.includes("<tfoot>"));
});
test("zero informado é válido, intervalos abertos são sinalizados e textos externos são escapados", () => {
  const html = tabelaPonto([{ ...linha, dados: { ...linha.dados, marcacoes: [],
    segundos_registrados: 0, pendencias: ["INTERVALO_ABERTO"], situacao_ponto: "<img onerror=alert(1)>" } }], semana);
  assert.match(html, /00:00/); assert.match(html, /Intervalo em aberto/);
  assert.ok(!html.includes("<img")); assert.match(html, /&lt;img/);
  assert.equal(duracaoPonto(null), "—"); assert.equal(duracaoPonto(5400, true), "+01:30");
});
test("resposta atrasada de outro colaborador não substitui a ficha atual", async () => {
  const pendentes = new Map(), entregues = [];
  const consulta = criarConsultaPonto(id => new Promise(resolve => pendentes.set(id, resolve)), e => entregues.push(e));
  const a = consulta.carregar("a", semana), b = consulta.carregar("b", semana);
  await Promise.resolve();
  pendentes.get("b")([linha]); await b;
  pendentes.get("a")([]); await a;
  assert.deepEqual(consulta.estado.registros, [linha]);
  assert.equal(consulta.estado.chave, JSON.stringify(["b", semana.de, semana.ate]));
  assert.equal(entregues.filter(e => e.status === "pronto").length, 1);
});
test("sair da ficha invalida a consulta anterior", async () => {
  let liberar;
  const consulta = criarConsultaPonto(() => new Promise(resolve => { liberar = resolve; }), () => {});
  const carga = consulta.carregar("a", semana);
  await Promise.resolve(); consulta.cancelar(); liberar([linha]); await carga;
  assert.equal(consulta.estado.status, "inicial"); assert.deepEqual(consulta.estado.registros, []);
});
test("falha de rede mantém o último resumo válido e permite nova consulta", async () => {
  let falha = false;
  const consulta = criarConsultaPonto(async () => { if (falha) throw Error("Sem rede"); return [linha]; }, () => {});
  await consulta.carregar("a", semana);
  falha = true; await consulta.carregar("a", semana, true);
  assert.equal(consulta.estado.status, "erro"); assert.deepEqual(consulta.estado.registros, [linha]);
  falha = false; await consulta.carregar("a", semana, true);
  assert.equal(consulta.estado.status, "pronto");
});
test("renderizações não duplicam consultas; atualização forçada busca correções", async () => {
  let chamadas = 0;
  const consulta = criarConsultaPonto(async () => { chamadas++; return [linha]; }, () => {});
  const a = consulta.carregar("a", semana), b = consulta.carregar("a", semana);
  assert.equal(a, b); await a;
  await consulta.carregar("a", semana); assert.equal(chamadas, 1);
  await consulta.carregar("a", semana, true); assert.equal(chamadas, 2);
});

test("a tabela conserva exatamente as cinco colunas originais", () => {
  const html = tabelaPonto([linha], semana);
  assert.deepEqual([...html.matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)].map(x => x[1]),
    ["Dia", "Formato", "Presencial", "Home office", "Horas"]);
  assert.match(html, /08:34–14:34/); assert.match(html, />6h</);
});
test("períodos mistos e intervalos abertos preenchem as modalidades corretas", () => {
  const d = { marcacoes: [
    {momento:"2026-10-13T08:00:00-03:00",local:"presencial"},
    {momento:"2026-10-13T12:00:00-03:00",local:"presencial"},
    {momento:"2026-10-13T13:00:00-03:00",local:"remoto"}
  ] };
  assert.deepEqual(periodosPonto(d), {presencial:["08:00–12:00"],remoto:["13:00–em aberto"],indefinidos:[],formato:"Misto"});
});
test("trabalho de fim de semana não é omitido nem contado em duplicidade", () => {
  const sabado = {...linha,data:"2026-10-17"};
  const html = tabelaPonto([sabado],semana,"2026-10-18");
  assert.match(html,/Sáb · 17\/10/);
  assert.equal((html.match(/data-ponto-dia=/g)||[]).length,1);
  assert.match(html,/6h presencial/);
});
