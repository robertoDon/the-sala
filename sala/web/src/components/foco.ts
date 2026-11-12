import { useEffect, useRef } from "react";

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Foco de janela (modal): entra na janela ao abrir, o Tab dá a volta dentro dela e, ao fechar,
 * o foco volta para o botão que abriu. Quem usa só o teclado ou leitor de tela não cai na página de trás.
 */
export function useFocoPreso<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const antes = document.activeElement as HTMLElement | null;
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true }); // um campo com autoFocus já ficou com o foco
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const itens = [...el.querySelectorAll<HTMLElement>(FOCAVEIS)].filter((x) => x.offsetParent !== null || x === document.activeElement);
      if (!itens.length) { e.preventDefault(); return; }
      const primeiro = itens[0], ultimo = itens[itens.length - 1], atual = document.activeElement;
      if (e.shiftKey && (atual === primeiro || atual === el || !el.contains(atual))) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && (atual === ultimo || !el.contains(atual))) { e.preventDefault(); primeiro.focus(); }
    };
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("keydown", tecla);
      if (antes && document.contains(antes)) antes.focus({ preventScroll: true });
    };
  }, []);
  return ref;
}
