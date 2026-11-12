import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Sala } from "../supabase";
import { trocarIdioma } from "../supabase";
import { idioma, t } from "../i18n";
import { definirTema, useTema } from "../tema";
import {
  IconeAjuda, IconeAjustes, IconeBiblioteca, IconeBusca, IconeConvite, IconeDecisao, IconeMais, IconeMemoria,
  IconePainel, IconePlugue, IconeProposta,
} from "./Icones";
import { IconeCasa } from "./Icones";
import { corDaSala } from "./Layout";

// ⌘K: ir para uma sala ou fazer qualquer ação sem tirar a mão do teclado.
// Ações da sala aberta viajam por evento ("sala:painel", "sala:convidar"); a Sala escuta.
type Item = { id: string; grupo: string; rotulo: string; dica?: string; tecla?: string; icone: React.ReactNode; fazer: () => void };

const sem = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export const abrirComandos = () => window.dispatchEvent(new Event("sala:comandos"));
export const atalhoComandos = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K");

export function Comandos({ salas, salaAberta, novaSala, conectar, conta }: {
  salas: Sala[] | null;
  salaAberta?: string;
  novaSala: () => void;
  conectar: () => void;
  conta: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const nav = useNavigate();
  const tema = useTema();
  const lista = useRef<HTMLUListElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const antes = useRef<Element | null>(null);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setAberto((v) => !v); }
    };
    const abrir = () => setAberto(true);
    window.addEventListener("keydown", tecla);
    window.addEventListener("sala:comandos", abrir);
    return () => { window.removeEventListener("keydown", tecla); window.removeEventListener("sala:comandos", abrir); };
  }, []);

  useEffect(() => {
    if (aberto) { antes.current = document.activeElement; setQ(""); setSel(0); window.setTimeout(() => campo.current?.focus(), 0); }
    else if (antes.current instanceof HTMLElement) antes.current.focus();
  }, [aberto]);

  const painel = (p: string) => () => window.dispatchEvent(new CustomEvent("sala:painel", { detail: p }));
  const itens = useMemo<Item[]>(() => {
    const r: Item[] = [];
    if (salaAberta) {
      const g = t("Nesta sala", "In this room");
      r.push(
        { id: "decisoes", grupo: g, rotulo: t("Decisões", "Decisions"), dica: t("propostas e registro", "proposals and log"), tecla: "D", icone: <IconeProposta tamanho={16} />, fazer: painel("decisoes") },
        { id: "tarefas", grupo: g, rotulo: t("Tarefas", "Tasks"), tecla: "T", icone: <IconeDecisao tamanho={16} />, fazer: painel("tarefas") },
        { id: "painel", grupo: g, rotulo: t("Painel", "Dashboard"), dica: t("andamento por frente", "progress by workstream"), tecla: "P", icone: <IconePainel tamanho={16} />, fazer: painel("painel") },
        { id: "biblioteca", grupo: g, rotulo: t("Biblioteca", "Library"), dica: t("arquivos e links", "files and links"), tecla: "B", icone: <IconeBiblioteca tamanho={16} />, fazer: painel("biblioteca") },
        { id: "memoria", grupo: g, rotulo: t("Memória da sala", "Room memory"), tecla: "M", icone: <IconeMemoria tamanho={16} />, fazer: painel("memoria") },
        { id: "busca", grupo: g, rotulo: t("Buscar na conversa", "Search the conversation"), tecla: "/", icone: <IconeBusca tamanho={16} />, fazer: painel("busca") },
        // quem só acompanha não tem link de convite para mandar
        ...(salas?.find((s) => s.id === salaAberta)?.papel === "leitor" ? [] : [{ id: "convidar", grupo: g, rotulo: t("Convidar pessoas", "Invite people"), icone: <IconeConvite tamanho={16} />, fazer: () => window.dispatchEvent(new Event("sala:convidar")) }]),
        { id: "ajustes", grupo: g, rotulo: t("Ajustes da sala", "Room settings"), dica: t("instruções, pessoas, aprovações", "instructions, people, approvals"), icone: <IconeAjustes tamanho={16} />, fazer: painel("ajustes") },
      );
    }
    const gs = t("Salas", "Rooms");
    for (const s of salas ?? []) {
      if (s.id === salaAberta) continue;
      const n = Number(s.nao_lidas);
      r.push({ id: `s${s.id}`, grupo: gs, rotulo: s.nome, dica: n ? t(`${n} não lida${n > 1 ? "s" : ""}`, `${n} unread`) : undefined,
        icone: <span className="cmd-inicial cmd-sala" style={{ "--cor": corDaSala(s.id) } as React.CSSProperties} aria-hidden>{s.nome.slice(0, 1).toUpperCase()}</span>, fazer: () => nav(`/s/${s.id}`) });
    }
    const ga = t("Geral", "General");
    const proximo = tema === "escuro" ? "claro" : tema === "claro" ? "sistema" : "escuro";
    r.push(
      { id: "inicio", grupo: ga, rotulo: t("Início", "Home"), dica: t("o que espera por você", "what's waiting for you"), icone: <IconeCasa tamanho={16} />, fazer: () => nav("/") },
      { id: "nova", grupo: ga, rotulo: t("Nova sala", "New room"), tecla: "N", icone: <IconeMais tamanho={16} />, fazer: novaSala },
      { id: "conectar", grupo: ga, rotulo: t("Conectar agente", "Connect agent"), tecla: "A", icone: <IconePlugue tamanho={16} />, fazer: conectar },
      { id: "conta", grupo: ga, rotulo: t("Sua conta e avisos", "Your account and notifications"), icone: <IconeAjustes tamanho={16} />, fazer: conta },
      { id: "tema", grupo: ga, rotulo: proximo === "escuro" ? t("Usar tema escuro", "Use dark theme") : proximo === "claro" ? t("Usar tema claro", "Use light theme") : t("Tema igual ao do sistema", "Match system theme"),
        icone: <span className="cmd-tema" aria-hidden />, fazer: () => definirTema(proximo) },
      { id: "idioma", grupo: ga, rotulo: idioma() === "en" ? "Mudar para português" : "Switch to English", icone: <span className="cmd-inicial" aria-hidden>{idioma() === "en" ? "Pt" : "En"}</span>, fazer: () => void trocarIdioma(idioma() === "en" ? "pt" : "en") },
      { id: "ajuda", grupo: ga, rotulo: t("Ajuda", "Help"), icone: <IconeAjuda tamanho={16} />, fazer: () => nav("/ajuda") },
    );
    return r;
  }, [salas, salaAberta, tema]); // eslint-disable-line react-hooks/exhaustive-deps

  const achados = useMemo(() => {
    const termo = sem(q.trim());
    if (!termo) return itens;
    return itens.filter((i) => sem(`${i.rotulo} ${i.dica ?? ""} ${i.grupo}`).includes(termo));
  }, [itens, q]);

  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => { lista.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" }); }, [sel]);

  if (!aberto) return null;

  const fazer = (i: Item) => { setAberto(false); window.setTimeout(i.fazer, 0); };
  const tecla = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(achados.length - 1, s + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    if (e.key === "Enter" && achados[sel]) { e.preventDefault(); fazer(achados[sel]); }
    if (e.key === "Escape") { e.preventDefault(); setAberto(false); }
  };

  let grupo = "";
  return (
    <div className="cmd-fundo" onMouseDown={(e) => e.target === e.currentTarget && setAberto(false)}>
      <div className="cmd" role="dialog" aria-modal="true" aria-label={t("Comandos", "Commands")} onKeyDown={tecla}>
        <div className="cmd-campo">
          <IconeBusca tamanho={18} />
          <input ref={campo} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Ir para uma sala ou fazer algo…", "Go to a room or do something…")}
            role="combobox" aria-expanded="true" aria-controls="cmd-lista" aria-activedescendant={achados[sel] ? `cmd-${achados[sel].id}` : undefined} aria-autocomplete="list" />
          <kbd>esc</kbd>
        </div>
        <ul className="cmd-lista" id="cmd-lista" role="listbox" ref={lista}>
          {achados.map((i, n) => {
            const cab = i.grupo !== grupo ? (grupo = i.grupo) : null;
            return (
              <li key={i.id} role="presentation">
                {cab && <p className="cmd-grupo" role="presentation">{cab}</p>}
                <button type="button" id={`cmd-${i.id}`} role="option" aria-selected={n === sel} data-i={n} className={n === sel ? "sel" : ""}
                  onMouseMove={() => n !== sel && setSel(n)} onClick={() => fazer(i)}>
                  <span className="cmd-icone">{i.icone}</span>
                  <span className="cmd-rotulo">{i.rotulo}</span>
                  {i.dica && <span className="cmd-dica">{i.dica}</span>}
                  {i.tecla && <kbd>{i.tecla}</kbd>}
                </button>
              </li>
            );
          })}
          {!achados.length && <li className="cmd-nada">{t(`Nada com “${q}”. Tente o nome de uma sala ou de um painel.`, `Nothing matches “${q}”. Try the name of a room or panel.`)}</li>}
        </ul>
        <p className="cmd-pe"><span><kbd>↑</kbd><kbd>↓</kbd> {t("escolher", "move")}</span><span><kbd>↵</kbd> {t("abrir", "open")}</span><span><kbd>{atalhoComandos()}</kbd> {t("abre e fecha", "toggle")}</span></p>
      </div>
    </div>
  );
}
