import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconeMais3 } from "./Icones";
import { t } from "../i18n";

/** `confirmar`: o que vai acontecer. O primeiro clique arma o item (vira "Confirmar" com o aviso embaixo), o segundo faz. */
export type ItemMenu = { rotulo: string; acao: () => void; perigo?: boolean; icone?: ReactNode; confirmar?: string } | null | false;

// Menu "⋯": guarda as ações secundárias de um item. Fecha com Esc, clique fora ou ao escolher.
export function Menu({ itens, rotulo }: { itens: ItemMenu[]; rotulo: string }) {
  const [aberto, setAberto] = useState(false);
  const [armado, setArmado] = useState<string | null>(null);
  useEffect(() => { if (!aberto) setArmado(null); }, [aberto]);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    caixa.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    const fora = (e: PointerEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); setAberto(false); caixa.current?.querySelector<HTMLButtonElement>("button")?.focus(); }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const bs = [...(caixa.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
        const i = bs.indexOf(document.activeElement as HTMLButtonElement);
        bs[(i + (e.key === "ArrowDown" ? 1 : -1) + bs.length) % bs.length]?.focus();
      }
    };
    document.addEventListener("pointerdown", fora, true);
    document.addEventListener("keydown", tecla, true);
    return () => { document.removeEventListener("pointerdown", fora, true); document.removeEventListener("keydown", tecla, true); };
  }, [aberto]);
  return (
    <div className={`menu-ancora ${aberto ? "aberto" : ""}`} ref={caixa}>
      <button type="button" className="btn-mais" onClick={() => setAberto((v) => !v)} aria-haspopup="menu" aria-expanded={aberto} aria-label={rotulo} title={t("Mais ações", "More actions")}>
        <IconeMais3 tamanho={18} />
      </button>
      {aberto && (
        <div className="menu" role="menu">
          {itens.filter(Boolean).map((it) => it && (armado === it.rotulo ? (
            <div key={it.rotulo} className="menu-confirmar">
              <button type="button" role="menuitem" className="armado" autoFocus onClick={() => { setAberto(false); it.acao(); }}>
                {it.icone}{t("Confirmar", "Confirm")}: {it.rotulo.toLocaleLowerCase()}
              </button>
              <p className="menu-aviso">{it.confirmar}</p>
            </div>
          ) : (
            <button key={it.rotulo} type="button" role="menuitem" className={it.perigo ? "perigo" : ""}
              onClick={() => { if (it.confirmar) { setArmado(it.rotulo); return; } setAberto(false); it.acao(); }}>
              {it.icone}{it.rotulo}
            </button>
          )))}
        </div>
      )}
    </div>
  );
}
