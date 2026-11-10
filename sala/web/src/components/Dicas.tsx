import { useEffect, useRef, useState } from "react";

// Dica no lugar do "title" do navegador: aparece rápido, no estilo do app, com o atalho em destaque.
// "Decisões (D)" vira "Decisões" + tecla D. Lê o title de qualquer elemento; não precisa mudar os botões.
type Dica = { texto: string; tecla?: string; x: number; y: number; embaixo: boolean };

export function Dicas() {
  const [d, setD] = useState<Dica | null>(null);
  const espera = useRef<number | undefined>(undefined);
  const alvo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (window.matchMedia("(hover: none)").matches) return; // celular: sem hover, sem dica
    const esconder = () => { window.clearTimeout(espera.current); alvo.current = null; setD(null); };
    const sobre = (e: PointerEvent) => {
      const el = (e.target as HTMLElement)?.closest?.("[title], [data-dica]") as HTMLElement | null;
      if (el === alvo.current) return;
      esconder();
      if (!el || el.closest(".lp, .cmd")) return;
      const titulo = el.getAttribute("title");
      if (titulo) {
        el.dataset.dica = titulo;
        el.removeAttribute("title");
        if (!el.getAttribute("aria-label") && !el.textContent?.trim()) el.setAttribute("aria-label", titulo);
      }
      const bruto = el.dataset.dica;
      if (!bruto) return;
      alvo.current = el;
      espera.current = window.setTimeout(() => {
        if (alvo.current !== el || !el.isConnected) return;
        const m = bruto.match(/^(.*?)\s*\(([^()]{1,6})\)$/);
        const r = el.getBoundingClientRect();
        const embaixo = r.top < 56;
        setD({ texto: m ? m[1] : bruto, tecla: m?.[2], x: r.left + r.width / 2, y: embaixo ? r.bottom + 8 : r.top - 8, embaixo });
      }, 350);
    };
    window.addEventListener("pointerover", sobre);
    window.addEventListener("pointerdown", esconder, true);
    window.addEventListener("scroll", esconder, true);
    window.addEventListener("keydown", esconder, true);
    return () => {
      window.removeEventListener("pointerover", sobre);
      window.removeEventListener("pointerdown", esconder, true);
      window.removeEventListener("scroll", esconder, true);
      window.removeEventListener("keydown", esconder, true);
    };
  }, []);

  if (!d) return null;
  const x = Math.min(Math.max(d.x, 120), window.innerWidth - 120);
  return (
    <div className={`dica ${d.embaixo ? "dica-embaixo" : ""}`} role="tooltip" style={{ left: x, top: d.y }}>
      <span>{d.texto}</span>{d.tecla && <kbd>{d.tecla}</kbd>}
    </div>
  );
}
