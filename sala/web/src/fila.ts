import type { ItemFila } from "./supabase";
import { idioma, locale, t } from "./i18n";

// "Esperando você" fora do app: o mesmo retrato que o servidor manda no push (avisar → filaDe).
// Vai para o número no ícone do app e para o widget, pelo service worker. Mantenha os dois iguais.
export type RetratoFila = {
  lingua: "pt" | "en"; espera: number; manchete: string;
  itens: { titulo: string; detalhe: string; alerta: boolean; url: string }[];
};

export function retratoDaFila(fila: ItemFila[]): RetratoFila {
  const n = fila.length;
  const dia = (iso: string) => new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short" }).replace(".", "");
  const hoje = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
  return {
    lingua: idioma() === "en" ? "en" : "pt",
    espera: n,
    manchete: !n ? t("Tudo em dia.", "All caught up.") : n === 1 ? t("1 coisa espera por você.", "1 thing is waiting for you.") : t(`${n} coisas esperam por você.`, `${n} things are waiting for you.`),
    itens: fila.slice(0, 3).map((f) => {
      const atrasada = !!f.prazo && new Date(f.prazo).getTime() < Date.now();
      const quando = f.tipo === "proposta" ? t("para decidir", "to decide")
        : !f.prazo ? t("tarefa sua", "your task")
        : atrasada ? t("atrasada", "overdue")
        : hoje(f.prazo) ? t("vence hoje", "due today") : t(`vence ${dia(f.prazo)}`, `due ${dia(f.prazo)}`);
      const titulo = (f.titulo || t("Proposta", "Proposal")).replace(/\s+/g, " ").trim();
      return { titulo: titulo.length > 80 ? `${titulo.slice(0, 79)}…` : titulo, detalhe: `${f.sala} · ${quando}`, alerta: atrasada,
        url: f.tipo === "proposta" ? `/s/${f.sala_id}?ir=${f.ref}` : `/s/${f.sala_id}?tarefas=1` };
    }),
  };
}

// número no ícone do app instalado + retrato para o widget (o service worker guarda e atualiza o widget)
export function publicarFila(fila: ItemFila[]) {
  const n = fila.length;
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try { (n ? nav.setAppBadge?.(n) : nav.clearAppBadge?.())?.catch(() => {}); } catch { /* sem número no ícone */ }
  try { navigator.serviceWorker?.controller?.postMessage({ tipo: "fila", fila: retratoDaFila(fila) }); } catch { /* sem service worker */ }
}

// saiu da conta: some o número do ícone e o widget volta a "abra o The Sala" (nada da conta fica à vista)
export function esquecerFila() {
  const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
  try { nav.clearAppBadge?.()?.catch(() => {}); } catch { /* */ }
  try { navigator.serviceWorker?.controller?.postMessage({ tipo: "esquecer" }); } catch { /* */ }
}
