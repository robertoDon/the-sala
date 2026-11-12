import { useSyncExternalStore } from "react";

// Tema da interface: segue o sistema, ou fica claro ou escuro por escolha da pessoa (guardado neste aparelho).
export type Tema = "sistema" | "claro" | "escuro";
const CHAVE = "sala.tema";
const ouvintes = new Set<() => void>();

const lido = (): Tema => {
  try { const v = localStorage.getItem(CHAVE); return v === "claro" || v === "escuro" ? v : "sistema"; } catch { return "sistema"; }
};
let atual: Tema = lido();

const escuroAgora = () => atual === "escuro" || (atual === "sistema" && matchMedia("(prefers-color-scheme: dark)").matches);

export function aplicarTema() {
  const raiz = document.documentElement;
  if (atual === "sistema") delete raiz.dataset.tema; else raiz.dataset.tema = atual;
  // a barra do navegador e do iPhone acompanha o tema: a mesma cor do topo da tela (--fundo em styles.css)
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = escuroAgora() ? "#111214" : "#FFFFFF";
  document.head.appendChild(meta);
}

export function definirTema(t: Tema) {
  atual = t;
  try { if (t === "sistema") localStorage.removeItem(CHAVE); else localStorage.setItem(CHAVE, t); } catch { /* sem storage */ }
  aplicarTema();
  ouvintes.forEach((f) => f());
}

export function useTema(): Tema {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => atual, () => atual);
}

matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { if (atual === "sistema") aplicarTema(); });
