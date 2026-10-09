/** Seleciona classes da paleta; as declarações de cor ficam em styles/cores.css. */
const tokens = new Set(["accent", "bad", "c-abono", "c-atestado", "c-banco", "c-capacitacao", "c-ferias", "c-ho-strong", "c-viagem", "good", "inherit", "muted"]);
const propriedades = new Set(["c", "k", "pc", "color", "fill"]);
export function classeCor(valor, propriedade = "color") {
  const token = valor === "inherit" ? "inherit" : /^var\(--([\w-]+)\)$/.exec(valor || "")?.[1];
  return tokens.has(token) && propriedades.has(propriedade) ? `cor-${propriedade}-${token}` : "";
}
