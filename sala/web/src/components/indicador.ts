// Abas em segmentos com um fundo só que desliza até a aba escolhida: a visão troca e o olho acompanha.
// Uso: <div className="abas" ref={indicador}>…<button className="aba ativa">…</button></div>
// Mede a aba .ativa sempre que a classe muda ou o tamanho muda; sem aba ativa, volta ao fundo por aba.
// Função fixa do módulo (não é hook): o React chama uma vez ao montar e a limpeza ao desmontar.
export function indicador(el: HTMLDivElement | null) {
  if (!el) return;
  let quadro = 0;
  const medir = () => {
    const a = el.querySelector<HTMLElement>(".aba.ativa");
    if (!a) { delete el.dataset.deslizar; delete el.dataset.deslizarPronto; return; }
    el.style.setProperty("--x", `${a.offsetLeft}px`);
    el.style.setProperty("--w", `${a.offsetWidth}px`);
    if (el.dataset.deslizar === undefined) {
      el.dataset.deslizar = "";
      // só anima depois da primeira medida: abrir o painel não faz o fundo vir deslizando do canto
      quadro = requestAnimationFrame(() => { el.dataset.deslizarPronto = ""; });
    }
  };
  medir();
  const mo = new MutationObserver(medir);
  mo.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(medir);
  ro?.observe(el);
  return () => { mo.disconnect(); ro?.disconnect(); cancelAnimationFrame(quadro); };
}
