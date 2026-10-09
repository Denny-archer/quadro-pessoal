/** Aplica apenas os larguras calculadas dos gráficos; o CSS fixo vive em styles/. */
const propriedades = {
  "data-ui-width": "width"
};
const seletor = Object.keys(propriedades).map(nome => `[${nome}]`).join(",");
export function aplicarEstilosDinamicos(raiz) {
  if (!raiz || !seletor) return;
  const elementos = [...(raiz.matches?.(seletor) ? [raiz] : []), ...(raiz.querySelectorAll?.(seletor) || [])];
  for (const elemento of elementos) {
    for (const [atributo, propriedade] of Object.entries(propriedades)) {
      if (elemento.hasAttribute(atributo)) elemento.style.setProperty(propriedade, elemento.getAttribute(atributo));
    }
  }
}
export function iniciarEstilosDinamicos() {
  aplicarEstilosDinamicos(document.documentElement);
  const observador = new MutationObserver(registros => {
    for (const registro of registros) for (const no of registro.addedNodes) if (no.nodeType === 1) aplicarEstilosDinamicos(no);
  });
  observador.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  return () => observador.disconnect();
}
