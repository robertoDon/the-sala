import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useAuth } from "../App";
import { sb, type ItemFila, type Mensagem, type Sala } from "../supabase";
import { prefs, tocarPlim } from "../preferencias";
import { chamaTodos, handle } from "./Texto";
import { gravado, idioma, locale, t } from "../i18n";
import { publicarFila } from "../fila";
import { IconeAgente, IconeBusca, IconeCasa, IconeMais, Marcador, IconePlugue, IconeProposta, IconeSino, IconeVoltar, Marca } from "./Icones";
import { Conectar } from "./Conectar";
import { Conta } from "./Conta";
import { NovaSala } from "./NovaSala";
import { Guia } from "./Guia";
import { Comandos, abrirComandos, atalhoComandos } from "./Comandos";

// Lista de salas com não lidas e prévia, ao vivo. Também mantém o contador na aba do navegador.
export function useSalas() {
  const { sessao, perfil } = useAuth();
  const [salas, setSalas] = useState<Sala[] | null>(null);
  const quemSou = useRef({ id: "", h: "" });
  quemSou.current = { id: sessao?.user.id ?? "", h: handle((perfil?.nome ?? "").split(" ")[0]) };
  const [fila, setFila] = useState<ItemFila[]>([]);
  const espera = useRef<number | undefined>(undefined);

  const carregar = async () => {
    const [{ data }, f] = await Promise.all([sb.rpc("minhas_salas"), sb.rpc("minha_fila")]);
    setSalas((data as Sala[]) ?? []);
    setFila((f.data as ItemFila[]) ?? []);
  };

  useEffect(() => {
    carregar();
    const depois = () => { window.clearTimeout(espera.current); espera.current = window.setTimeout(carregar, 250); };
    const canal = sb.channel("minhas-salas")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensagens" }, (p) => {
        depois();
        // som opcional (Conta › Som): alguém chamou você, ou chegou proposta de outra pessoa para decidir
        const m = p.new as Mensagem, eu = quemSou.current;
        if (prefs().som !== "comigo" || !eu.id || (m.user_id === eu.id && !m.agente)) return;
        const chamou = [...m.texto.matchAll(/@([\p{L}\p{N}_]+)/gu)].some((x) => { const h = handle(x[1]); return chamaTodos(h) || (!!eu.h && h === eu.h); });
        if (chamou || (m.tipo === "proposta" && m.user_id !== eu.id)) tocarPlim();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "membros" }, depois)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "membros" }, depois)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "votos" }, depois)
      .on("postgres_changes", { event: "*", schema: "public", table: "tarefas" }, depois)
      .subscribe();
    return () => { sb.removeChannel(canal); window.clearTimeout(espera.current); };
  }, []);

  // a mesma fila no ícone do app e no widget (só depois da primeira leitura: lista vazia de início não zera o número)
  useEffect(() => { if (salas !== null) publicarFila(fila); }, [fila, salas]);

  useEffect(() => {
    const total = (salas ?? []).reduce((n, s) => n + Number(s.nao_lidas), 0);
    document.title = total ? `(${total}) The Sala` : "The Sala";
  }, [salas]);

  return { salas, fila, recarregar: carregar };
}

// O que espera por você em todas as salas: propostas que você pode decidir e tarefas suas vencendo
function Fila({ fila }: { fila: ItemFila[] }) {
  const [aberta, setAberta] = useState(false);
  if (!fila.length) return null;
  const vencida = (f: ItemFila) => !!f.prazo && new Date(f.prazo).getTime() < Date.now();
  return (
    <>
      <button type="button" className="lateral-item" aria-expanded={aberta} onClick={() => setAberta((v) => !v)}>
        <IconeSino tamanho={16} /><span>{t("Esperando você", "Waiting for you")}</span>
        <span className="lateral-num" aria-label={t(`${fila.length} itens`, `${fila.length} items`)}>{fila.length}</span>
      </button>
      {aberta && (
        <ul className="fila-lista">
          {fila.map((f) => (
            <li key={`${f.tipo}${f.ref}`}>
              <Link to={f.tipo === "proposta" ? `/s/${f.sala_id}?ir=${f.ref}` : `/s/${f.sala_id}?tarefas=1`}>
                {f.tipo === "proposta" ? <IconeProposta tamanho={12} /> : <Marcador tamanho={11} />}
                <span className="fila-texto"><strong>{f.titulo || t("Proposta", "Proposal")}</strong>
                  <span className="nota">{f.sala}{f.tipo === "tarefa" && f.prazo ? ` · ${vencida(f) ? t("atrasada", "overdue") : t("vence logo", "due soon")}` : ` · ${t("para decidir", "awaiting decision")}`}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// cor fixa por sala (pelo id): ajuda a achar a sala de olho, sem usar o acento, que é só de ação
const CORES = ["#5B5BD6", "#0D9488", "#D97706", "#DB2777", "#2563EB", "#7C3AED", "#65A30D", "#0891B2"];
export const corDaSala = (id: string) => CORES[[...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % CORES.length];

export async function novaSala(nome: string) {
  const { data, error } = await sb.rpc("criar_sala", { nome });
  if (error) throw error;
  return data as string;
}

const quando = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
  const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return t("ontem", "yesterday");
  return d.toLocaleDateString(locale(), { day: "2-digit", month: "short" }).replace(".", "");
};

export function Layout({ children, salas, recarregar, foco, fila = [] }: {
  children: React.ReactNode;
  salas: Sala[] | null;
  recarregar: () => void;
  foco?: boolean; // no celular, mostra só o conteúdo (a sala aberta)
  fila?: ItemFila[];
}) {
  const { perfil } = useAuth();
  const { id } = useParams();
  const noInicio = useLocation().pathname === "/";
  const [criando, setCriando] = useState(false);
  const [conectar, setConectar] = useState(false);
  const [conta, setConta] = useState(false);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const digitando = (e.target as HTMLElement)?.closest("input, textarea, [contenteditable]");
      if (digitando || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n") { e.preventDefault(); setCriando(true); }
      if (e.key === "a") { e.preventDefault(); setConectar(true); }
    };
    const abrir = () => setConectar(true);
    window.addEventListener("keydown", tecla);
    window.addEventListener("sala:conectar", abrir);
    return () => { window.removeEventListener("keydown", tecla); window.removeEventListener("sala:conectar", abrir); };
  }, []);

  return (
    <div className={`app ${foco ? "app-foco" : ""}`}>
      <nav className="lateral" aria-label={t("Salas", "Rooms")}>
        <div className="lateral-topo"><Link to="/" aria-label={t("Início", "Home")}><Marca /></Link></div>
        <Link to="/" className={`lateral-item ${noInicio ? "ativa" : ""}`} aria-current={noInicio ? "page" : undefined}>
          <IconeCasa tamanho={16} /><span>{t("Início", "Home")}</span>
        </Link>
        <button type="button" className="lateral-item" onClick={abrirComandos} aria-label={t("Ir para uma sala ou fazer algo", "Go to a room or do something")}>
          <IconeBusca tamanho={16} /><span>{t("Buscar e ir para…", "Search and go to…")}</span><kbd>{atalhoComandos()}</kbd>
        </button>
        <Fila fila={fila} />

        <div className="lateral-titulo" data-guia="salas">
          <span>{t("Salas", "Rooms")}</span>
          <button className="btn-icone" onClick={() => setCriando(true)} title={t("Nova sala (N)", "New room (N)")} aria-label={t("Nova sala", "New room")}>
            <IconeMais tamanho={16} />
          </button>
        </div>

        <ul className="lista-salas">
          {salas === null && [0, 1, 2].map((i) => <li key={i} className="esqueleto" aria-hidden />)}
          {salas?.map((s) => {
            const novas = Number(s.nao_lidas);
            const ativa = s.id === id;
            return (
              <li key={s.id}>
                <Link to={`/s/${s.id}`} className={`${ativa ? "ativa" : ""} ${novas && !ativa ? "tem-novas" : ""}`} aria-current={ativa ? "page" : undefined}>
                  <span className="sala-inicial" style={{ "--cor": corDaSala(s.id) } as React.CSSProperties} aria-hidden>{s.nome.slice(0, 1).toUpperCase()}</span>
                  <span className="sala-info">
                    <span className="sala-linha">
                      <span className="sala-nome">{s.nome}</span>
                      <time className="sala-quando">{quando(s.ultima_em)}</time>
                    </span>
                    <span className="sala-linha">
                      <span className="sala-previa">
                        {s.ultima_texto ? (
                          <>{s.ultima_agente && <IconeAgente tamanho={11} />}{s.ultima_agente ?? s.ultima_nome?.split(" ")[0]}
                            {s.ultima_tipo === "proposta" ? t(" propôs", " proposed") : s.ultima_tipo === "decisao" ? t(" decidiu", " decided") : ""}: {gravado(s.ultima_texto, s.idioma ?? idioma()).replace(/\*\*|__|`|^#+\s/gm, "")}</>
                        ) : t("Sem mensagens ainda", "No messages yet")}
                      </span>
                      {Number(s.minhas_tarefas) > 0 && (
                        <span className="sala-pendentes" title={`${s.minhas_tarefas} ${Number(s.minhas_tarefas) === 1 ? t("tarefa sua aberta", "open task assigned to you") : t("tarefas suas abertas", "open tasks assigned to you")}`} aria-label={`${s.minhas_tarefas} ${Number(s.minhas_tarefas) === 1 ? t("tarefa sua", "task assigned to you") : t("tarefas suas", "tasks assigned to you")}`}>
                          <Marcador tamanho={11} />{s.minhas_tarefas}
                        </span>
                      )}
                      {Number(s.pendentes) > 0 && (
                        <span className="sala-pendentes" title={`${s.pendentes} ${Number(s.pendentes) === 1 ? t("proposta aguardando decisão", "proposal awaiting a decision") : t("propostas aguardando decisão", "proposals awaiting a decision")}`} aria-label={`${s.pendentes} ${t("para decidir", "awaiting decision")}`}>
                          <IconeProposta tamanho={11} />{s.pendentes}
                        </span>
                      )}
                      {novas > 0 && !ativa && <span className="sala-novas" aria-label={`${novas} ${novas === 1 ? t("não lida", "unread") : t("não lidas", "unread")}`}>{novas > 99 ? "99+" : novas}</span>}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="lateral-base">
          <button type="button" className="lateral-item" data-guia="conectar" onClick={() => setConectar(true)} title={t("Conectar agente (A)", "Connect agent (A)")}>
            <IconePlugue tamanho={16} /><span>{t("Conectar agente", "Connect agent")}</span><kbd>A</kbd>
          </button>
          <button className="eu" data-guia="conta" onClick={() => setConta(true)} title={t("Sua conta, avisos e sair", "Account, notifications and sign out")}>
            {perfil?.avatar ? <img src={perfil.avatar} alt="" className="avatar" referrerPolicy="no-referrer" /> : <span className="avatar">{perfil?.nome?.[0]}</span>}
            <span className="eu-nome"><strong>{perfil?.nome}</strong><span>{t("Conta, avisos e tema", "Account, notifications, theme")}</span></span>
            <IconeVoltar tamanho={14} />
          </button>
        </div>
      </nav>

      <div className="conteudo">{children}</div>

      {conectar && <Conectar fechar={() => setConectar(false)} />}
      {conta && <Conta fechar={() => setConta(false)} />}
      <Guia pronto={salas !== null} emSala={!!id} />
      <Comandos salas={salas} salaAberta={id} novaSala={() => setCriando(true)} conectar={() => setConectar(true)} conta={() => setConta(true)} />
      {criando && <NovaSala fechar={() => setCriando(false)} aoCriar={recarregar} />}
    </div>
  );
}
