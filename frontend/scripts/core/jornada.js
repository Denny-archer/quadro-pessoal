/** Infraestrutura compartilhada: jornada. */
import { pad } from "./datas.js";
const WD_NOME = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const FORMATO = {
  P: "Presencial",
  H: "Home office",
  M: "Misto"
};
const DIAS_UTEIS = [1, 2, 3, 4, 5];
const mins = t => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
function horasPeriodo(a, b, intervalo) {
  const x = mins(a),
    y = mins(b);
  if (x == null || y == null || y <= x) return 0;
  const d = y - x;
  return (d > 360 ? d - intervalo : d) / 60;
}
const intervaloDe = f => f.intervalo == null || f.intervalo === "" ? 60 : Number(f.intervalo);
function semanaDe(f) {
  if (f.regime === "Híbrido" && f.semana) return f.semana;
  const s = {};
  for (const d of DIAS_UTEIS) {
    if (f.regime === "Teletrabalho") s[d] = {
      tipo: "H",
      pe: "",
      ps: "",
      he: f.entradaHO || f.entrada || "",
      hs: f.saidaHO || f.saida || ""
    };else if (f.regime === "Híbrido" && (f.diasHO || []).includes(d)) s[d] = {
      tipo: "H",
      pe: "",
      ps: "",
      he: f.entradaHO || f.entrada || "",
      hs: f.saidaHO || f.saida || ""
    };else s[d] = {
      tipo: "P",
      pe: f.entrada || "",
      ps: f.saida || "",
      he: "",
      hs: ""
    };
  }
  return s;
}
function horasDia(dia, intervalo) {
  if (!dia) return {
    p: 0,
    h: 0
  };
  return {
    p: dia.tipo === "H" ? 0 : horasPeriodo(dia.pe, dia.ps, intervalo),
    h: dia.tipo === "P" ? 0 : horasPeriodo(dia.he, dia.hs, intervalo)
  };
}
function totaisSemana(f) {
  const s = semanaDe(f),
    iv = intervaloDe(f);
  let p = 0,
    h = 0;
  for (const d of DIAS_UTEIS) {
    const x = horasDia(s[d], iv);
    p += x.p;
    h += x.h;
  }
  return {
    p,
    h,
    t: p + h
  };
}
function modoDia(f, wd) {
  if (wd === 0 || wd === 6) return null;
  return semanaDe(f)[wd]?.tipo || "P";
}
const hN = n => (Math.round(n * 100) / 100).toLocaleString("pt-BR") + "h";
function descDia(dia) {
  if (!dia) return "";
  const p = `presencial ${dia.pe || "?"}–${dia.ps || "?"}`,
    h = `home office ${dia.he || "?"}–${dia.hs || "?"}`;
  if (dia.tipo === "P") return p;
  if (dia.tipo === "H") return h;
  return mins(dia.he) < mins(dia.pe) ? `${h}, depois ${p}` : `${p}, depois ${h}`;
}
const addHoras = (t, h) => {
  const m = mins(t);
  if (m == null) return "";
  const x = m + h * 60;
  return `${pad(Math.floor(x / 60) % 24)}:${pad(x % 60)}`;
};
function checaHibrido(s) {
  const tipos = DIAS_UTEIS.map(d => s[d]?.tipo);
  const n = t => tipos.filter(x => x === t).length;
  if (n("M") === 5) return "diario";
  if (n("H") === 1 && n("M") === 1 && n("P") === 3) return "dia";
  return null;
}
export { WD_NOME, FORMATO, DIAS_UTEIS, mins, horasPeriodo, intervaloDe, semanaDe, horasDia, totaisSemana, modoDia, hN, descDia, addHoras, checaHibrido };
