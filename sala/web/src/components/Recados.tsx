import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconeFechar } from "./Icones";
import { t } from "../i18n";

// Recado curto no alto da tela (erro ou aviso), no lugar do alert() do navegador. Some sozinho.
let ouvir: ((texto: string) => void) | null = null;

export function recado(texto: string) {
  if (ouvir) ouvir(texto);
  else console.warn(texto);
}

export function Recados() {
  const [lista, setLista] = useState<{ id: number; texto: string }[]>([]);
  useEffect(() => {
    let n = 0;
    ouvir = (texto) => {
      const id = ++n;
      setLista((l) => [...l.filter((r) => r.texto !== texto).slice(-2), { id, texto }]);
      window.setTimeout(() => setLista((l) => l.filter((r) => r.id !== id)), 7000);
    };
    return () => { ouvir = null; };
  }, []);
  return createPortal(
    <div className="recados" aria-live="assertive">
      {lista.map((r) => (
        <div key={r.id} className="recado" role="alert">
          <span>{r.texto}</span>
          <button type="button" className="btn-acao" aria-label={t("Fechar", "Close")} onClick={() => setLista((l) => l.filter((x) => x.id !== r.id))}><IconeFechar tamanho={14} /></button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
