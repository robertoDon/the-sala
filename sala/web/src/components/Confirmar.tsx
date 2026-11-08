import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { t } from "../i18n";

// Confirmação dentro do app, no lugar das janelas do navegador.
// Botão: o primeiro clique arma (ele vira "Confirmar" em vermelho e um balão diz o que vai acontecer); o segundo faz.
// Clicar fora, Esc ou esperar uns segundos desarma.

type Ref = React.RefObject<HTMLElement | null>;

/** Desarma quando a pessoa clica fora ou aperta Esc. Rolar não desarma: a conversa rola sozinha quando chega mensagem. */
function useDesarmar(armado: boolean, desarmar: () => void, dentro: Ref[], ms = 8000) {
  const fn = useRef(desarmar);
  fn.current = desarmar;
  useEffect(() => {
    if (!armado) return;
    const fora = (e: PointerEvent) => { if (!dentro.some((r) => r.current?.contains(e.target as Node))) fn.current(); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); fn.current(); } };
    const tempo = window.setTimeout(() => fn.current(), ms);
    document.addEventListener("pointerdown", fora, true);
    document.addEventListener("keydown", tecla, true);
    return () => {
      window.clearTimeout(tempo);
      document.removeEventListener("pointerdown", fora, true);
      document.removeEventListener("keydown", tecla, true);
    };
  }, [armado, ms]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Balão preso ao botão, sem sair da tela: em cima quando há espaço, embaixo quando não; acompanha a rolagem. */
function Balao({ ancora, children }: { ancora: Ref; children: ReactNode }) {
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  useLayoutEffect(() => {
    const posicionar = () => {
      const r = ancora.current?.getBoundingClientRect();
      if (!r) return;
      const largura = Math.min(280, window.innerWidth - 16);
      // botão na metade esquerda: o balão começa nele; na direita: termina nele
      const desejado = r.left < window.innerWidth / 2 ? r.left : r.right - largura;
      const left = Math.min(Math.max(desejado, 8), window.innerWidth - largura - 8);
      setPos(r.top > 120
        ? { left, width: largura, bottom: window.innerHeight - r.top + 8 }
        : { left, width: largura, top: r.bottom + 8 });
    };
    posicionar();
    document.addEventListener("scroll", posicionar, true);
    window.addEventListener("resize", posicionar);
    return () => { document.removeEventListener("scroll", posicionar, true); window.removeEventListener("resize", posicionar); };
  }, [ancora]);
  if (!pos) return null;
  return createPortal(<div className="confirmar-balao" role="status" style={pos}>{children}</div>, document.body);
}

export function BotaoConfirmar({ className = "btn btn-pequeno btn-texto btn-perigo", rotulo, confirmar, aviso, onConfirmar, disabled, titulo, children }: {
  className?: string;
  /** Texto do botão (ou use children, por exemplo um ícone). */
  rotulo?: ReactNode;
  /** Texto do botão armado. Padrão: "Confirmar". */
  confirmar?: string;
  /** O que vai acontecer, numa frase. */
  aviso: ReactNode;
  onConfirmar: () => void;
  disabled?: boolean;
  titulo?: string;
  children?: ReactNode;
}) {
  const [armado, setArmado] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  useDesarmar(armado, () => setArmado(false), [botao]);
  return (
    <>
      <button ref={botao} type="button" disabled={disabled} title={armado ? undefined : titulo} aria-label={armado ? undefined : titulo}
        className={armado ? "btn btn-pequeno btn-perigo-cheio confirmar-armado" : className}
        onClick={() => { if (!armado) { setArmado(true); return; } setArmado(false); onConfirmar(); }}>
        {armado ? (confirmar ?? t("Confirmar", "Confirm")) : (children ?? rotulo)}
      </button>
      {armado && <Balao ancora={botao}>{aviso}</Balao>}
    </>
  );
}

/**
 * Linha de "sair e apagar": o clique abre, ali mesmo, o que vai acontecer com Cancelar e o botão vermelho.
 * Com `palavra`, a pessoa digita a palavra (ou o nome da sala) para liberar o botão.
 */
export function LinhaConfirmar({ icone, titulo, nota, aviso, botao, palavra, perigo, onConfirmar }: {
  icone?: ReactNode; titulo: string; nota: string; aviso: ReactNode; botao: string;
  palavra?: string; perigo?: boolean; onConfirmar: () => Promise<unknown> | void;
}) {
  const [aberta, setAberta] = useState(false);
  const [digitado, setDigitado] = useState("");
  const [indo, setIndo] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => { if (aberta) caixa.current?.querySelector<HTMLElement>("input, .btn-perigo-cheio")?.focus(); }, [aberta]);
  const confere = !palavra || digitado.trim().toLocaleLowerCase() === palavra.trim().toLocaleLowerCase();
  if (!aberta) return (
    <button type="button" className={`perigo-linha ${perigo ? "perigo" : ""}`} onClick={() => { setDigitado(""); setAberta(true); }}>
      {icone}<span><strong>{titulo}</strong><span className="nota">{nota}</span></span>
    </button>
  );
  return (
    <div className="perigo-confirmar" ref={caixa} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setAberta(false); } }}>
      <p><strong>{titulo}</strong></p>
      <p className="nota">{aviso}</p>
      {palavra && (
        <label className="campo">
          <span className="rotulo">{t(`Para confirmar, digite: ${palavra}`, `To confirm, type: ${palavra}`)}</span>
          <input value={digitado} onChange={(e) => setDigitado(e.target.value)} autoComplete="off" spellCheck={false}
            onKeyDown={(e) => { if (e.key === "Enter" && confere && !indo) { e.preventDefault(); (e.currentTarget.closest(".perigo-confirmar")?.querySelector(".btn-perigo-cheio") as HTMLButtonElement | null)?.click(); } }} />
        </label>
      )}
      <div className="perigo-confirmar-acoes">
        <button type="button" className="btn btn-pequeno" onClick={() => setAberta(false)}>{t("Cancelar", "Cancel")}</button>
        <button type="button" className="btn btn-pequeno btn-perigo-cheio" disabled={!confere || indo}
          onClick={async () => { setIndo(true); try { await onConfirmar(); } finally { setIndo(false); setAberta(false); } }}>{botao}</button>
      </div>
    </div>
  );
}
