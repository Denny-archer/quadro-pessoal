import test from "node:test";
import assert from "node:assert/strict";
import { problemaSenha } from "../scripts/features/conta/validacao.js";
import { destinoAposLogin } from "../scripts/core/sessao.js";

test("troca de senha exige atual, nova diferente e confirmação correspondente", () => {
  const nova = "Frase nova de teste!";
  assert.equal(problemaSenha("", nova, nova).campo, "s-atual");
  assert.equal(problemaSenha("Atual de teste!", "curta", "curta").campo, "s-nova");
  assert.equal(problemaSenha(nova, nova, nova).campo, "s-nova");
  assert.equal(problemaSenha("Atual de teste!", nova, "").campo, "s-confirma");
  assert.equal(problemaSenha("Atual de teste!", nova, "diferente").campo, "s-confirma");
  assert.equal(problemaSenha("Atual de teste!", nova, nova), null);
});

test("limite de bytes e caracteres Unicode corresponde ao bcrypt do backend", () => {
  assert.equal(problemaSenha("antiga", "a".repeat(72), "a".repeat(72)), null);
  assert.equal(problemaSenha("antiga", "á".repeat(37), "á".repeat(37)).campo, "s-nova");
  assert.equal(problemaSenha("antiga", "😀".repeat(9), "😀".repeat(9)).campo, "s-nova");
  assert.equal(problemaSenha("antiga", "😀".repeat(10), "😀".repeat(10)), null);
});

test("retorno do login fica restrito às páginas locais do RH", () => {
  const origem = "https://rh.exemplo.test";
  assert.equal(destinoAposLogin("/importacao.html", origem), "/importacao.html");
  for (const valor of [null, "https://externo.test", "//externo.test", "/\\externo.test", "/%5c%5cexterno.test", "/api/usuarios", "javascript:alert(1)"]) {
    assert.equal(destinoAposLogin(valor, origem), "/");
  }
});

test("avisos de atividade entre abas não criam um ciclo de renovação automática", async t => {
  const nomes = ["document", "window", "localStorage", "BroadcastChannel"];
  const anteriores = Object.fromEntries(nomes.map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
  const doc = Object.assign(new EventTarget(), {hidden: false});
  const canais = [];
  class Canal extends EventTarget {
    constructor() { super(); canais.push(this); }
    postMessage(dados) { for (const outro of canais) if (outro !== this) outro.dispatchEvent(new MessageEvent("message", {data: dados})); }
  }
  try {
    for (const [nome, valor] of Object.entries({document: doc, window: new EventTarget(), localStorage: {setItem() {}}, BroadcastChannel: Canal})) {
      Object.defineProperty(globalThis, nome, {value: valor, writable: true, configurable: true});
    }
    t.mock.timers.enable({apis: ["Date", "setInterval", "setTimeout"], now: new Date("2026-10-15T12:00:00Z")});
    const abas = await Promise.all([import("../scripts/core/sessao.js?aba=a"), import("../scripts/core/sessao.js?aba=b")]);
    const chamadas = [0, 0];
    abas.forEach((aba, i) => aba.iniciarControleSessao({
      atividade: async () => { chamadas[i]++; await new Promise(resolve => setTimeout(resolve, 3)); },
      validar: async () => ({})
    }));
    const proximo = () => new Promise(resolve => setImmediate(resolve));
    t.mock.timers.tick(10); await proximo();
    for (let n = 0; n < 12; n++) { t.mock.timers.tick(15000); await proximo(); }
    assert.deepEqual(chamadas, [1, 1]);
  } finally {
    t.mock.timers.reset();
    for (const nome of nomes) {
      if (anteriores[nome]) Object.defineProperty(globalThis, nome, anteriores[nome]);
      else delete globalThis[nome];
    }
  }
});
