import { useEffect, useRef, useState } from "react";

// Puxar para atualizar. No app instalado (tela inicial do celular) não há barra do navegador nem o gesto dele:
// arrastar para baixo com tudo no topo mostra o anel girando e, soltando depois do ponto, recarrega a página.
const LIMITE = 64; // px puxados (já com a resistência) para valer
const MAX = 96;

const instalado = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

// tudo o que rola entre o toque e a página está no topo?
function noTopo(el: Element | null) {
  for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
    if (e.scrollTop > 0) return false;
  }
  return (document.scrollingElement?.scrollTop ?? 0) <= 0;
}

const ignorar = (el: Element | null) =>
  !!el?.closest("input, textarea, select, [contenteditable=true], .modal-fundo, .cmd-fundo, .guia, .painel, [data-sem-puxar]");

export function Puxar() {
  const [puxado, setPuxado] = useState(0);
  const [indo, setIndo] = useState(false);
  const ini = useRef<{ x: number; y: number } | null>(null);
  const atual = useRef(0);

  useEffect(() => {
    if (!instalado()) return;
    const comeca = (ev: TouchEvent) => {
      ini.current = null;
      if (ev.touches.length !== 1 || indo) return;
      const alvo = ev.target as Element;
      if (ignorar(alvo) || !noTopo(alvo)) return;
      ini.current = { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
    };
    const move = (ev: TouchEvent) => {
      if (!ini.current) return;
      const dy = ev.touches[0].clientY - ini.current.y, dx = ev.touches[0].clientX - ini.current.x;
      if (dy <= 0 || (atual.current === 0 && Math.abs(dx) > dy)) { ini.current = null; atual.current = 0; setPuxado(0); return; }
      atual.current = Math.min(MAX, dy * 0.5);
      setPuxado(atual.current);
    };
    const solta = () => {
      if (!ini.current) return;
      ini.current = null;
      if (atual.current >= LIMITE) { setIndo(true); setPuxado(LIMITE); window.location.reload(); }
      else setPuxado(0);
      atual.current = 0;
    };
    document.addEventListener("touchstart", comeca, { passive: true });
    document.addEventListener("touchmove", move, { passive: true });
    document.addEventListener("touchend", solta);
    document.addEventListener("touchcancel", solta);
    return () => {
      document.removeEventListener("touchstart", comeca);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", solta);
      document.removeEventListener("touchcancel", solta);
    };
  }, [indo]);

  if (!puxado && !indo) return null;
  const pronto = puxado >= LIMITE;
  return (
    <div className="puxar" style={{ transform: `translate(-50%, ${puxado - 44}px)`, opacity: Math.min(1, puxado / LIMITE) }} aria-hidden="true">
      <svg className={`puxar-anel${indo ? " girando" : ""}${pronto ? " pronto" : ""}`} viewBox="0 0 24 24" width="20" height="20"
        style={indo ? undefined : { transform: `rotate(${(puxado / LIMITE) * 270}deg)` }}>
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          strokeDasharray="50.3" strokeDashoffset={indo ? 12 : 50.3 * (1 - Math.min(1, puxado / LIMITE) * 0.8)} />
      </svg>
    </div>
  );
}
