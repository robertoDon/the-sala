import { useEffect, useRef, useState, type ReactNode } from "react";
import { sb, type Mensagem } from "../supabase";
import { IconeAgente, IconeBusca, IconeFechar, IconeProposta } from "./Icones";
import { naConversa, locale, t as tr } from "../i18n";
import { indicador } from "./indicador";

type Props = { salaId: string; autor: (m: Mensagem) => string; irPara: (id: number) => void; fechar: () => void };

const escapar = (t: string) => t.replace(/[\\%_]/g, (c) => `\\${c}`);

// trecho em volta da primeira ocorrência, com todas as ocorrências marcadas
function trecho(bruto: string, termo: string) {
  const texto = bruto.replace(/\*\*|`|^#+\s|^>\s?/gm, "").replace(/\s+/g, " ").trim();
  const baixo = texto.toLowerCase(), alvo = termo.toLowerCase();
  const i = baixo.indexOf(alvo);
  const ini = i < 0 ? 0 : Math.max(0, i - 50);
  const fim = Math.min(texto.length, (i < 0 ? 0 : i) + termo.length + 140);
  const pedaco = texto.slice(ini, fim);
  const partes: ReactNode[] = [];
  let k = 0, j: number;
  const pb = pedaco.toLowerCase();
  while (alvo && (j = pb.indexOf(alvo, k)) >= 0) {
    partes.push(pedaco.slice(k, j), <mark key={j}>{pedaco.slice(j, j + alvo.length)}</mark>);
    k = j + alvo.length;
  }
  partes.push(pedaco.slice(k));
  return <>{ini > 0 && "…"}{partes}{fim < texto.length && "…"}</>;
}

type Filtro = "tudo" | "pessoas" | "agentes" | "propostas";

// Busca em toda a conversa da sala, não só no que está carregado na tela. Setas e Enter navegam.
export function Busca({ salaId, autor, irPara, fechar }: Props) {
  const [termo, setTermo] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [res, setRes] = useState<Mensagem[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const espera = useRef<number | undefined>(undefined);
  const campo = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);

  useEffect(() => {
    window.clearTimeout(espera.current);
    const t = termo.trim();
    if (t.length < 2) { setRes(null); setBuscando(false); return; }
    setBuscando(true);
    espera.current = window.setTimeout(async () => {
      let q = sb.from("mensagens").select("*").eq("sala_id", salaId).eq("apagada", false).ilike("texto", `%${escapar(t)}%`);
      if (filtro === "pessoas") q = q.is("agente", null);
      if (filtro === "agentes") q = q.not("agente", "is", null);
      if (filtro === "propostas") q = q.eq("tipo", "proposta");
      const { data } = await q.order("id", { ascending: false }).limit(50);
      setRes((data as Mensagem[]) ?? []); setAtivo(0); setBuscando(false);
    }, 200);
  }, [termo, filtro, salaId]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [fechar]);

  useEffect(() => { lista.current?.querySelector(".ativo")?.scrollIntoView({ block: "nearest" }); }, [ativo]);

  const teclas = (e: React.KeyboardEvent) => {
    if (!res?.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setAtivo((a) => Math.min(a + 1, res.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); irPara(res[ativo].id); }
  };

  const FILTROS: [Filtro, string][] = [["tudo", tr("Tudo", "All")], ["pessoas", tr("Pessoas", "People")], ["agentes", tr("Agentes", "Agents")], ["propostas", tr("Propostas", "Proposals")]];
  const quando = (iso: string) => {
    const d = new Date(iso);
    return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString(locale(), { day: "numeric", month: "short" }).replace(".", "");
  };

  return (
    <aside className="painel" aria-label={tr("Buscar na sala", "Search the room")}>
      <header className="painel-topo">
        <h2>{tr("Buscar", "Search")}</h2>
        <button className="btn-icone" onClick={fechar} aria-label={tr("Fechar busca", "Close search")}><IconeFechar /></button>
      </header>
      <div className="busca-topo">
        <label className="sr" htmlFor="busca">{tr("Buscar nas mensagens", "Search messages")}</label>
        <div className="campo-icone campo-busca">
          <IconeBusca tamanho={18} />
          <input id="busca" ref={campo} type="search" autoFocus autoComplete="off" placeholder={tr("Palavra, número, nome…", "Word, number, name…")} value={termo}
            onChange={(e) => setTermo(e.target.value)} onKeyDown={teclas}
            role="combobox" aria-expanded={!!res?.length} aria-controls="busca-res" aria-activedescendant={res?.length ? `br${res[ativo]?.id}` : undefined} />
          {buscando ? <span className="girando" aria-hidden /> : termo && (
            <button className="btn-mais campo-limpar" onClick={() => { setTermo(""); campo.current?.focus(); }} aria-label={tr("Limpar", "Clear")}><IconeFechar tamanho={14} /></button>
          )}
        </div>
        <div className="abas abas-mini filtros" ref={indicador} role="radiogroup" aria-label={tr("Onde buscar", "Where to search")}>
          {FILTROS.map(([id, rot]) => (
            <button key={id} role="radio" aria-checked={filtro === id} className={filtro === id ? "aba ativa" : "aba"} onClick={() => { setFiltro(id); campo.current?.focus(); }}>{rot}</button>
          ))}
        </div>
      </div>

      {res === null && (
        <section className="painel-secao painel-vazio">
          <span className="vazio-icone"><IconeBusca tamanho={20} /></span>
          <p><strong>{tr("Procure em toda a conversa", "Search the whole conversation")}</strong></p>
          <p className="nota">{tr("Inclusive o que os agentes escreveram e as propostas. Use ↑ ↓ e Enter para ir até a mensagem.", "Includes agent messages and proposals. Use ↑ ↓ and Enter to jump to a message.")}</p>
        </section>
      )}
      {res && !res.length && (
        <section className="painel-secao painel-vazio">
          <span className="vazio-icone"><IconeBusca tamanho={20} /></span>
          <p><strong>{tr(`Nada com “${termo.trim()}”`, `Nothing matching “${termo.trim()}”`)}</strong></p>
          <p className="nota">{filtro !== "tudo" ? <button className="link nota" onClick={() => setFiltro("tudo")}>{tr("Buscar em tudo", "Search everything")}</button> : tr("Tente outra palavra ou parte dela.", "Try another word, or part of one.")}</p>
        </section>
      )}
      {res && res.length > 0 && (
        <section className="painel-lista painel-fim">
          <h3 className="secao-rotulo">{res.length === 50 ? tr("50 mais recentes", "50 most recent") : res.length === 1 ? tr("1 resultado", "1 result") : tr(`${res.length} resultados`, `${res.length} results`)}</h3>
          <ul className="resultados" id="busca-res" role="listbox" ref={lista}>
            {res.map((m, i) => (
              <li key={m.id} id={`br${m.id}`} role="option" aria-selected={i === ativo}>
                <button className={i === ativo ? "ativo" : ""} onClick={() => irPara(m.id)} onMouseEnter={() => setAtivo(i)} tabIndex={-1}>
                  <span className={`avatar avatar-mini ${m.agente ? "avatar-agente" : ""}`} aria-hidden>{m.agente ? <IconeAgente tamanho={12} /> : autor(m)[0]?.toUpperCase()}</span>
                  <span className="resultado-corpo">
                    <span className="resultado-meta">
                      <strong>{autor(m)}</strong>
                      {m.tipo === "proposta" && <span className="pilula pilula-acento"><IconeProposta tamanho={11} /> {tr("Proposta", "Proposal")}</span>}
                      <time>{quando(m.criada_em)}</time>
                    </span>
                    <span className="resultado-texto">{trecho(naConversa(m.texto), termo.trim())}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
