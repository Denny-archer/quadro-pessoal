import test from "node:test";
import assert from "node:assert/strict";
import { criarControladorPonto } from "../scripts/features/ponto/controlador.js";
import { iniciarCoreEstado, S } from "../scripts/core/estado.js";

const dados = { resumo: { no_posto: 2, afastado: 1 }, pessoas: [] };
function ambiente(consultar = async () => dados) {
  const estados = [], timers = new Map();
  let chamadas = 0, sequencia = 0, visivel = true;
  const controlador = criarControladorPonto({
    consultar: () => { chamadas++; return consultar(); },
    apresentar: estado => estados.push(estado), visivel: () => visivel,
    agendar: (acao, prazo) => { assert.equal(prazo, 15000); timers.set(++sequencia, acao); return sequencia; },
    cancelar: id => timers.delete(id)
  });
  return { controlador, estados, timers, chamadas: () => chamadas,
    ocultar: valor => { visivel = !valor; } };
}

test("entrada consulta imediatamente e renderizações repetidas não duplicam timers", async () => {
  const a = ambiente();
  a.controlador.ativar(true);
  a.controlador.ativar(true);
  await Promise.resolve();
  assert.equal(a.chamadas(), 1);
  assert.equal(a.timers.size, 1);
  assert.equal(a.estados.at(-1).status, "pronto");
  await [...a.timers.values()][0]();
  assert.equal(a.chamadas(), 2);
  a.controlador.ativar(false);
  assert.equal(a.timers.size, 0);
});

test("sair invalida respostas pendentes mesmo ao reabrir rapidamente", async () => {
  const pendentes = [];
  const a = ambiente(() => new Promise(resolve => pendentes.push(resolve)));
  a.controlador.ativar(true);
  a.controlador.ativar(false);
  a.controlador.ativar(true);
  pendentes[1]({ ...dados, marcador: "novo" });
  await Promise.resolve();
  pendentes[0]({ ...dados, marcador: "antigo" });
  await Promise.resolve();
  assert.equal(a.estados.at(-1).dados.marcador, "novo");
});

test("filtro é conservado ao sair e voltar durante a mesma sessão", async () => {
  const a = ambiente();
  a.controlador.ativar(true);
  await Promise.resolve();
  a.controlador.filtrar("afastado");
  a.controlador.filtrar("invalido");
  a.controlador.ativar(false);
  a.controlador.ativar(true);
  await Promise.resolve();
  assert.equal(a.estados.at(-1).filtro, "afastado");
});

test("página oculta e consulta pendente não geram consultas adicionais", async () => {
  let liberar;
  const a = ambiente(() => new Promise(resolve => { liberar = resolve; }));
  a.ocultar(true);
  a.controlador.ativar(true);
  await a.controlador.carregar();
  assert.equal(a.chamadas(), 0);
  a.ocultar(false);
  const carga = a.controlador.carregar();
  await a.controlador.carregar();
  assert.equal(a.chamadas(), 1);
  liberar(dados);
  await carga;
});

test("limpeza de acesso remove dados e não permite resposta antiga repovoar o painel", async () => {
  let liberar;
  const a = ambiente(() => new Promise(resolve => { liberar = resolve; }));
  a.controlador.ativar(true);
  a.controlador.limpar();
  liberar(dados);
  await Promise.resolve();
  assert.equal(a.estados.at(-1).dados, null);
  assert.equal(a.timers.size, 0);
  await a.controlador.carregar();
  assert.equal(a.chamadas(), 1);
});

test("falha apresenta mensagem e próxima atualização recupera o painel", async () => {
  let falhar = true;
  const a = ambiente(async () => { if (falhar) throw new Error("Sem rede"); return dados; });
  a.controlador.ativar(true);
  await Promise.resolve();
  assert.equal(a.estados.at(-1).erro, "Sem rede");
  falhar = false;
  await a.controlador.carregar();
  assert.equal(a.estados.at(-1).status, "pronto");
});

test("início ignora preferência antiga e restringe colaborador a Funcionários", () => {
  const anterior = Object.getOwnPropertyDescriptor(globalThis, "document");
  const storageAnterior = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  try {
    globalThis.localStorage = { getItem: () => "ponto" };
    for (const papel of ["admin", "rh", "gestor", "colaborador"]) {
      globalThis.document = { documentElement: { dataset: { papel } } };
      S.tab = "ponto";
      iniciarCoreEstado();
      assert.equal(S.tab, papel === "colaborador" ? "func" : "panorama");
    }
  } finally {
    if (anterior) Object.defineProperty(globalThis, "document", anterior); else delete globalThis.document;
    if (storageAnterior) Object.defineProperty(globalThis, "localStorage", storageAnterior); else delete globalThis.localStorage;
  }
});
