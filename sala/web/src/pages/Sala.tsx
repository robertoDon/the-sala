import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../App";
import { Layout, corDaSala, useSalas } from "../components/Layout";
import { type Aprovacao, Bolha, Evento, type Citacao, type GrupoReacao } from "../components/Bolha";
import { Ajustes } from "../components/Ajustes";
import { Compor, type ComporApi, type Sugestao } from "../components/Compor";
import { Decisoes } from "../components/Decisoes";
import { Comparar, porAgente, type Esperando } from "../components/Comparar";
import { Busca } from "../components/Busca";
import { Biblioteca } from "../components/Biblioteca";
import { Memoria } from "../components/Memoria";
import { Avisos } from "../components/Avisos";
import { Tarefas, prazoCurto, valorResp, type RascunhoTarefa } from "../components/Tarefas";
import { Ata } from "../components/Ata";
import { PainelSala } from "../components/PainelSala";
import { Minimapa } from "../components/Minimapa";
import { abrirComandos } from "../components/Comandos";
import { MENCAO_COLETIVA, chamaAgentes, chamaTodos, handle } from "../components/Texto";
import { definirIdiomaConversa, erro, idioma, locale, naConversa, t, tc } from "../i18n";
import {
  IconeAbrir, IconeAjustes, IconeAgente, IconeBusca, IconeCheck, IconeClipe, IconeCopiar, IconeTarefa, IconeColunas, IconeConvite, IconeDecisao, IconePlugue, IconeProposta, IconeVoltar, Marcador, IconeBiblioteca, IconePainel, IconeMais3,
} from "../components/Icones";
import {
  abrirConectar, atrasada, copiarTexto, pedidoPara, presenca, sb, subirArquivo, ultimaSala,
  type Agente, type Anexo, type Membro, type Mensagem, type Reacao, type Tarefa,
} from "../supabase";
import { recado } from "../components/Recados";

const hora = (iso: string) => new Date(iso).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
const completo = (iso: string) => new Date(iso).toLocaleString(locale(), { dateStyle: "long", timeStyle: "short" });
const dia = (iso: string) => {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return t("Hoje", "Today");
  if (d.toDateString() === ontem.toDateString()) return t("Ontem", "Yesterday");
  return d.toLocaleDateString(locale(), { day: "numeric", month: "long", year: d.getFullYear() === hoje.getFullYear() ? undefined : "numeric" });
};
const umaLinha = (t: string, n = 90) => { const l = t.replace(/\s+/g, " ").trim(); return l.length > n ? `${l.slice(0, n - 1)}…` : l; };
// pessoa ou agente chamando @agentes/@todos: as respostas viram uma comparação lado a lado
const perguntaATodos = (m: Mensagem) => m.tipo === "mensagem" && !m.apagada && MENCAO_COLETIVA.test(m.texto);
const tr = t; // onde "t" já é uma tarefa
// junta reações sem repetir (a mesma pode chegar pela leitura e pelo tempo real); as provisórias (id < 0) saem quando chega a de verdade
const juntarReacoes = (atual: Reacao[], novas: Reacao[]) => {
  const mapa = new Map(atual.map((r) => [r.id, r]));
  for (const r of novas) {
    for (const [k, x] of mapa) if (k < 0 && x.mensagem_id === r.mensagem_id && x.user_id === r.user_id && x.agente === r.agente && x.emoji === r.emoji) mapa.delete(k);
    mapa.set(r.id, r);
  }
  return [...mapa.values()];
};
// "Claude de Ana" / "Ana's Claude"
const deQuem = (agente: string, pessoa: string) => t(`${agente} de ${pessoa}`, `${pessoa}'s ${agente}`);
// presença "ouvindo agora" em qualquer idioma
const ouvindoAgora = (texto?: string) => texto === "ouvindo agora" || texto === "listening now";
const PAGINA = 200;

export type AgenteSala = { nome: string; uid: string; presenca: { ativo: boolean; texto: string } | null; sozinho?: boolean };
type Painel = null | "ajustes" | "contexto" | "decisoes" | "busca" | "tarefas" | "biblioteca" | "memoria" | "painel";

export default function SalaPage() {
  const { id = "" } = useParams();
  const [busca, setBusca] = useSearchParams();
  const { sessao, perfil } = useAuth();
  const eu = sessao!.user.id;
  const { salas, fila, recarregar } = useSalas();
  const sala = salas?.find((s) => s.id === id);
  definirIdiomaConversa(sala?.idioma ?? null); // o que está gravado na conversa aparece no idioma da sala
  useEffect(() => () => definirIdiomaConversa(null), []);
  const dono = sala?.papel === "dono";
  const leitor = sala?.papel === "leitor"; // convidado: lê tudo, não escreve

  const [membros, setMembros] = useState<Membro[]>([]);
  const [presencas, setPresencas] = useState<Agente[]>([]);
  const [msgs, setMsgs] = useState<Mensagem[] | null>(null);
  const [temAnteriores, setTemAnteriores] = useState(false);
  const [temPosteriores, setTemPosteriores] = useState(false); // depois de pular para uma mensagem antiga
  const [convite, setConvite] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [painel, setPainel] = useState<Painel>(null);
  const [respondendo, setRespondendo] = useState<Citacao>(null);
  const [comparar, setComparar] = useState<number | null>(null);
  const [destaque, setDestaque] = useState<number | null>(null);
  const [abertos, setAbertos] = useState<Set<number>>(new Set());
  const [versaoDecisoes, setVersaoDecisoes] = useState(0);
  const [tarefas, setTarefas] = useState<Tarefa[] | null>(null);
  const [reacoes, setReacoes] = useState<Reacao[]>([]);
  const [votos, setVotos] = useState<{ proposta_id: number; user_id: string }[]>([]);
  const [precisaSala, setPrecisa] = useState(1); // aprovações que uma proposta precisa nesta sala
  const [longeDoFim, setLongeDoFim] = useState(false); // subiu na conversa: mostra a seta para voltar
  const [novasAbaixo, setNovasAbaixo] = useState(0);
  const [rascunho, setRascunho] = useState<RascunhoTarefa>(null);
  const [ata, setAta] = useState(false);
  const [pedido, setPedido] = useState<number | null>(null); // veio do aviso "chamaram seu agente"
  const [copiouPedido, setCopiouPedido] = useState<string | null>(null);
  const [relogio, setRelogio] = useState(0); // refaz "visto há…" de tempos em tempos
  const feed = useRef<HTMLDivElement>(null);
  const compor = useRef<ComporApi>(null);
  const noFim = useRef(true);
  const lido = useRef(0);
  const manterRolagem = useRef<number | null>(null);
  const rolarPara = useRef<number | null>(null);
  const salaAtual = useRef(id); // respostas atrasadas de outra sala são ignoradas
  const longe = useRef(false);  // vendo uma janela antiga: o que chega ao vivo não entra no meio
  const marco = useRef<{ sala: string; ate: number } | null>(null); // até onde você tinha lido ao abrir a sala
  const [arrastando, setArrastando] = useState(false);
  // sala que não está na lista (ex.: acabou de ser criada): recarrega a lista uma vez antes de dizer que não existe
  const [conferida, setConferida] = useState<string | null>(null);
  useEffect(() => {
    if (!salas || sala || conferida === id) return;
    let vivo = true;
    recarregar().finally(() => vivo && setConferida(id));
    return () => { vivo = false; };
  }, [salas, sala, id, conferida]); // eslint-disable-line react-hooks/exhaustive-deps
  if (sala && marco.current?.sala !== id) marco.current = { sala: id, ate: Number(sala.lido_ate ?? 0) };

  const nomes = useMemo(() => new Map(membros.map((m) => [m.user_id, m.perfis?.nome ?? t("Alguém", "Someone")])), [membros]);
  const nome = useCallback((uid: string | null) => (uid && nomes.get(uid)) || t("Alguém", "Someone"), [nomes]);
  const primeiro = useCallback((uid: string) => nome(uid).split(" ")[0], [nome]);
  const autor = useCallback((m: Mensagem) => (m.agente ? deQuem(m.agente, primeiro(m.user_id)) : nome(m.user_id)), [nome, primeiro]);

  // agentes da sala: os conectados de quem está aqui (com presença) e os que já falaram
  const agentes = useMemo<AgenteSala[]>(() => {
    const mapa = new Map<string, AgenteSala>();
    const ids = new Set(membros.map((m) => m.user_id));
    presencas.filter((a) => ids.has(a.user_id) && Date.now() - new Date(a.visto_em).getTime() < 30 * 864e5)
      .forEach((a) => mapa.set(`${a.nome}|${a.user_id}`, { nome: a.nome, uid: a.user_id, presenca: presenca(a), sozinho: !!a.desperta }));
    msgs?.forEach((m) => m.agente && ids.has(m.user_id) && !mapa.has(`${m.agente}|${m.user_id}`) &&
      mapa.set(`${m.agente}|${m.user_id}`, { nome: m.agente, uid: m.user_id, presenca: null }));
    return [...mapa.values()];
  }, [presencas, msgs, membros]);

  const meuPrimeiro = handle((perfil?.nome ?? "").split(" ")[0]);
  const chamaMim = useCallback((mencao: string) => {
    const h = handle(mencao.slice(1).split("-")[0]);
    return chamaTodos(h) || (!!meuPrimeiro && h === meuPrimeiro);
  }, [meuPrimeiro]);

  const sugestoes = useMemo<Sugestao[]>(() => [
    { handle: tc("agentes", "agents"), rotulo: t("Todos os agentes da sala respondem", "All agents in the room reply"), agente: true },
    ...agentes.map((a) => ({ handle: `${a.nome.replace(/\s/g, "")}-${primeiro(a.uid)}`, rotulo: deQuem(a.nome, nome(a.uid)), agente: true })),
    ...membros.filter((m) => m.user_id !== eu).map((m) => ({ handle: (m.perfis?.nome ?? "").split(" ")[0], rotulo: m.perfis?.nome ?? "" })),
    { handle: tc("todos", "everyone"), rotulo: t("Todo mundo, pessoas e agentes", "Everyone: people and agents"), apelidos: idioma() === "en" ? ["all"] : undefined },
  ], [agentes, membros, eu, nome, primeiro]);

  const porId = useMemo(() => new Map((msgs ?? []).map((m) => [m.id, m])), [msgs]);
  const respostas = useMemo(() => {
    const r = new Map<number, Mensagem[]>();
    msgs?.forEach((m) => { if (m.agente && m.responde_a && !m.apagada) r.set(m.responde_a, [...(r.get(m.responde_a) ?? []), m]); });
    return r;
  }, [msgs]);

  // ---------------------------------------------------------------- carregar e ouvir

  const carregarRecentes = useCallback(async (sid: string, buffer: Mensagem[] = []) => {
    const { data } = await sb.from("mensagens").select("*").eq("sala_id", sid).order("id", { ascending: false }).limit(PAGINA);
    if (salaAtual.current !== sid) return;
    const d = (data as Mensagem[]) ?? [];
    const mapa = new Map<number, Mensagem>();
    [...d, ...buffer].forEach((m) => mapa.set(m.id, { ...mapa.get(m.id), ...m }));
    setTemAnteriores(d.length === PAGINA);
    setTemPosteriores(false); longe.current = false;
    noFim.current = true;
    const todas = [...mapa.values()].sort((a, b) => a.id - b.id);
    // muitas novas: abre no começo delas, não no fim
    const ate = marco.current?.sala === sid ? marco.current.ate : 0;
    const novas = ate ? todas.filter((m) => m.id > ate && !(m.user_id === eu && !m.agente)) : [];
    if (novas.length > 6) { rolarPara.current = -1; noFim.current = false; }
    setMsgs(todas);
  }, []);

  useEffect(() => {
    if (!id) return;
    salaAtual.current = id;
    ultimaSala.set(id);
    setMsgs(null); setPainel(null); setConvite(false); setRespondendo(null); setComparar(null);
    setTemAnteriores(false); setTemPosteriores(false); longe.current = false; setLongeDoFim(false); setNovasAbaixo(0);
    noFim.current = true; lido.current = 0;
    let carregado = false;
    const buffer: Mensagem[] = []; // o que chega ao vivo antes da primeira leitura terminar

    const carregarMembros = () =>
      sb.from("membros").select("user_id, papel, perfis(id, nome, avatar)").eq("sala_id", id).order("entrou_em")
        .then(({ data }) => { if (salaAtual.current === id) setMembros((data as unknown as Membro[]) ?? []); });
    sb.from("agentes").select("*").then(({ data }) => setPresencas((data as Agente[]) ?? []));
    carregarMembros();
    setTarefas(null);
    const bufferTarefas: Tarefa[] = []; // o que muda ao vivo antes da leitura terminar
    const carregarTarefas = () => sb.from("tarefas").select("*").eq("sala_id", id).order("id", { ascending: false }).limit(300)
      .then(({ data }) => {
        if (salaAtual.current !== id) return;
        const mapa = new Map(((data as Tarefa[]) ?? []).map((t) => [t.id, t]));
        bufferTarefas.forEach((t) => mapa.set(t.id, t));
        setTarefas([...mapa.values()].sort((a, b) => b.id - a.id));
      });
    const mudouTarefa = (t: Tarefa) => setTarefas((ts) => {
      if (!ts) { bufferTarefas.push(t); return ts; }
      return [t, ...ts.filter((x) => x.id !== t.id)];
    });

    setReacoes([]);
    setVotos([]);
    const carregarVotos = () => {
      sb.from("votos").select("proposta_id, user_id").eq("sala_id", id).limit(5000)
        .then(({ data }) => { if (salaAtual.current === id) setVotos((data as { proposta_id: number; user_id: string }[]) ?? []); });
      sb.rpc("aprovacoes_necessarias", { sala: id }).then(({ data }) => { if (salaAtual.current === id && typeof data === "number") setPrecisa(data); });
    };
    const carregarReacoes = () => sb.from("reacoes").select("id, mensagem_id, user_id, agente, emoji").eq("sala_id", id).order("id").limit(5000)
      .then(({ data }) => { if (salaAtual.current === id) setReacoes((atual) => juntarReacoes(atual, (data as Reacao[]) ?? [])); });

    const chegou = (m: Mensagem) => {
      if (m.tipo !== "mensagem") setVersaoDecisoes((v) => v + 1);
      if (m.tipo === "decisao") recarregar(); // a aprovação pode ter trocado o contexto da sala
      if (!noFim.current && !(m.user_id === eu && !m.agente)) setNovasAbaixo((n) => n + 1);
      if (longe.current) { setTemPosteriores(true); return; }
      setMsgs((atual) => {
        if (!atual) { buffer.push(m); return atual; }
        if (atual.some((x) => x.id === m.id)) return atual;
        const i = atual.findIndex((x) => x.pendente && x.texto === m.texto && x.user_id === m.user_id && !m.agente && x.tipo === m.tipo);
        if (i >= 0) { const c = [...atual]; c[i] = m; return c; }
        return [...atual, m];
      });
    };
    const primeira = () => { if (!carregado) { carregado = true; carregarRecentes(id, buffer); carregarTarefas(); carregarReacoes(); carregarVotos(); } };

    const canal = sb.channel(`sala:${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensagens", filter: `sala_id=eq.${id}` }, (p) => chegou(p.new as Mensagem))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "mensagens", filter: `sala_id=eq.${id}` }, (p) => {
        const m = p.new as Mensagem;
        if (m.tipo === "proposta") setVersaoDecisoes((v) => v + 1);
        setMsgs((atual) => atual?.map((x) => (x.id === m.id ? { ...x, ...m } : x)) ?? atual);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "membros", filter: `sala_id=eq.${id}` }, carregarMembros)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "membros" }, carregarMembros)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tarefas", filter: `sala_id=eq.${id}` }, (p) => { mudouTarefa(p.new as Tarefa); recarregar(); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tarefas", filter: `sala_id=eq.${id}` }, (p) => { mudouTarefa(p.new as Tarefa); recarregar(); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "votos", filter: `sala_id=eq.${id}` }, carregarVotos)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reacoes", filter: `sala_id=eq.${id}` }, (p) => setReacoes((atual) => juntarReacoes(atual, [p.new as Reacao])))
      // apagar não aceita filtro no tempo real e chega só com o id: tira pelo id
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "reacoes" }, (p) => setReacoes((atual) => atual.filter((r) => r.id !== (p.old as Reacao).id)))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agentes" }, (p) => atualizarPresenca(p.new as Agente))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "agentes" }, (p) => atualizarPresenca(p.new as Agente))
      // assina antes de ler: nada que chegue no meio se perde
      .subscribe((status) => { if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") primeira(); });
    const reserva = window.setTimeout(primeira, 4000);
    const t = window.setInterval(() => setRelogio((n) => n + 1), 30_000);
    return () => { sb.removeChannel(canal); window.clearInterval(t); window.clearTimeout(reserva); };
  }, [id, carregarRecentes]); // eslint-disable-line react-hooks/exhaustive-deps

  const atualizarPresenca = (a: Agente) =>
    setPresencas((ps) => [...ps.filter((x) => !(x.user_id === a.user_id && x.nome === a.nome)), a]);

  // rolagem: grudada no fim; mantém o lugar ao carregar anteriores; vai até a mensagem pedida
  useLayoutEffect(() => {
    const f = feed.current;
    if (!f) return;
    if (manterRolagem.current !== null) { f.scrollTop = f.scrollHeight - manterRolagem.current; manterRolagem.current = null; return; }
    if (rolarPara.current === -1) {
      rolarPara.current = null;
      const alvo = document.getElementById("novas");
      if (alvo) { alvo.scrollIntoView({ block: "start" }); return; }
    }
    if (rolarPara.current !== null) {
      const alvo = document.getElementById(`m${rolarPara.current}`);
      rolarPara.current = null;
      if (alvo) { alvo.scrollIntoView({ block: "center" }); return; }
    }
    if (noFim.current) f.scrollTop = f.scrollHeight;
  }, [msgs]);

  // marca como lida o que está na tela
  useEffect(() => {
    const marcar = () => {
      const ultimo = msgs?.reduce((n, m) => (m.id > n ? m.id : n), 0) ?? 0;
      if (document.hidden || !ultimo || ultimo <= lido.current || marco.current?.sala !== id) return;
      lido.current = ultimo;
      sb.rpc("marcar_lida", { sala: id, ate: ultimo }).then(() => recarregar());
    };
    marcar();
    document.addEventListener("visibilitychange", marcar);
    return () => document.removeEventListener("visibilitychange", marcar);
  }, [msgs, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // sala recém-criada de um modelo: abre o contexto para completar
  useEffect(() => {
    if (busca.get("contexto") && sala) { setPainel("contexto"); setBusca({}, { replace: true }); }
    if (busca.get("tarefas") && sala) { setPainel("tarefas"); setBusca({}, { replace: true }); }
    const ir = Number(busca.get("ir")); // veio de "Esperando você"
    if (ir && msgs) { irPara(ir); setBusca({}, { replace: true }); }
    const pedir = Number(busca.get("pedir"));
    if (pedir && msgs) { setPedido(pedir); irPara(pedir); setBusca({}, { replace: true }); }
  }, [busca, sala, msgs !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  // atalhos: / busca, D decisões
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const digitando = (e.target as HTMLElement)?.closest("input, textarea, [contenteditable]");
      if (digitando || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); setPainel("busca"); }
      if (e.key === "d") { e.preventDefault(); setPainel((p) => (p === "decisoes" ? null : "decisoes")); }
      if (e.key === "t") { e.preventDefault(); setPainel((p) => (p === "tarefas" ? null : "tarefas")); }
      if (e.key === "b") { e.preventDefault(); setPainel((p) => (p === "biblioteca" ? null : "biblioteca")); }
      if (e.key === "m") { e.preventDefault(); setPainel((p) => (p === "memoria" ? null : "memoria")); }
      if (e.key === "p") { e.preventDefault(); setPainel((p) => (p === "painel" ? null : "painel")); }
    };
    // vindos da paleta de comandos (⌘K)
    const doPainel = (e: Event) => setPainel((e as CustomEvent<Painel>).detail);
    const doConvite = () => setConvite(true);
    window.addEventListener("keydown", tecla);
    window.addEventListener("sala:painel", doPainel);
    window.addEventListener("sala:convidar", doConvite);
    return () => { window.removeEventListener("keydown", tecla); window.removeEventListener("sala:painel", doPainel); window.removeEventListener("sala:convidar", doConvite); };
  }, []);

  const carregarAnteriores = async () => {
    if (!msgs?.length) return;
    const sid = id;
    const { data } = await sb.from("mensagens").select("*").eq("sala_id", sid).lt("id", msgs[0].id).order("id", { ascending: false }).limit(PAGINA);
    if (salaAtual.current !== sid) return;
    const d = ((data as Mensagem[]) ?? []).reverse();
    setTemAnteriores(d.length === PAGINA);
    const f = feed.current;
    if (f) manterRolagem.current = f.scrollHeight - f.scrollTop;
    setMsgs((a) => [...d, ...(a ?? [])]);
  };

  const irPara = useCallback(async (alvo: number) => {
    if (window.matchMedia("(max-width: 720px), (max-height: 500px) and (pointer: coarse)").matches) setPainel(null);
    setDestaque(alvo); window.setTimeout(() => setDestaque((d) => (d === alvo ? null : d)), 1600);
    const el = document.getElementById(`m${alvo}`);
    if (el) { noFim.current = false; el.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
    // fora do que está carregado: abre uma janela em volta dela
    const sid = id;
    const [antes, depois] = await Promise.all([
      sb.from("mensagens").select("*").eq("sala_id", sid).lt("id", alvo).order("id", { ascending: false }).limit(50),
      sb.from("mensagens").select("*").eq("sala_id", sid).gte("id", alvo).order("id").limit(PAGINA),
    ]);
    if (salaAtual.current !== sid) return;
    const a = ((antes.data as Mensagem[]) ?? []).reverse();
    const d = (depois.data as Mensagem[]) ?? [];
    noFim.current = false; rolarPara.current = alvo;
    setTemAnteriores(a.length === 50);
    const recortada = d.length === PAGINA;
    setTemPosteriores(recortada); longe.current = recortada;
    setMsgs([...a, ...d]);
  }, [id]);

  // ---------------------------------------------------------------- enviar e agir

  const mandar = async (temp: Mensagem) => {
    const { data, error } = await sb.from("mensagens")
      .insert({ sala_id: id, user_id: eu, texto: temp.texto, tipo: temp.tipo, estado: temp.estado, responde_a: temp.responde_a, anexos: temp.anexos,
        aprovadores: temp.aprovadores?.length ? temp.aprovadores : null })
      .select("*").single();
    setMsgs((a) => {
      if (!a) return a;
      if (error) return a.map((x) => (x.id === temp.id ? { ...x, pendente: false, falhou: true } : x));
      if (a.some((x) => x.id === data.id)) return a.filter((x) => x.id !== temp.id);
      return a.map((x) => (x.id === temp.id ? (data as Mensagem) : x));
    });
  };

  const enviar = (texto: string, proposta: boolean, anexos: Anexo[], aprovadores?: string[], respondeA?: number) => {
    if (longe.current) carregarRecentes(id);
    noFim.current = true;
    // um agente está lendo a sala: a mensagem espera ele terminar (ou "Mandar agora"), para não atravessar a resposta
    const segura = !proposta && pensando.length > 0;
    const temp: Mensagem = {
      id: -Date.now(), sala_id: id, user_id: eu, agente: null, texto, criada_em: new Date().toISOString(),
      tipo: proposta ? "proposta" : "mensagem", estado: proposta ? "pendente" : null, responde_a: respondeA ?? respondendo?.id ?? null,
      decidida_por: null, decidida_em: null, editada_em: null, apagada: false, anexos, pendente: !segura, fila: segura,
      aprovadores: proposta && aprovadores?.length ? aprovadores : null,
    };
    if (respondeA === undefined) setRespondendo(null);
    setMsgs((a) => [...(a ?? []), temp]);
    if (!segura) mandar(temp);
  };
  const soltar = (m: Mensagem) => {
    setMsgs((a) => a?.map((x) => (x.id === m.id ? { ...x, fila: false, pendente: true } : x)) ?? a);
    mandar({ ...m, fila: false, pendente: true });
  };
  // 👎 com nota: vira uma resposta à mensagem do agente que chama ele pelo nome ("@Claude-Ana faltou o preço")
  const pedirCorrecao = (m: Mensagem, nota: string) =>
    enviar(`@${(m.agente ?? "").replace(/\s/g, "")}-${primeiro(m.user_id)} ${nota}`, false, [], undefined, m.id);

  const tentarDeNovo = (m: Mensagem) => {
    setMsgs((a) => a?.map((x) => (x.id === m.id ? { ...x, pendente: true, falhou: false } : x)) ?? a);
    mandar(m);
  };

  const decidir = async (pid: number, aprovar: boolean | "ajuste", nota?: string) => {
    if (aprovar === "ajuste") {
      const { error } = await sb.rpc("pedir_ajuste", { proposta: pid, nota: nota ?? "" });
      if (error) return erro(error);
      setVotos((v) => v.filter((x) => x.proposta_id !== pid));
      setMsgs((a) => a?.map((x) => (x.id === pid ? { ...x, estado: "ajuste", decidida_por: eu, decidida_em: new Date().toISOString() } : x)) ?? a);
      recarregar();
      return null;
    }
    const { data, error } = await sb.rpc("decidir", { proposta: pid, aprovar, nota: nota ?? null });
    if (error) return erro(error);
    // aprovou, mas a sala pede mais aprovações: a proposta continua pendente com o seu voto
    if (aprovar && data == null) { setVotos((v) => [...v.filter((x) => !(x.proposta_id === pid && x.user_id === eu)), { proposta_id: pid, user_id: eu }]); return null; }
    setMsgs((a) => a?.map((x) => (x.id === pid ? { ...x, estado: aprovar ? "aprovada" : "recusada", decidida_por: eu, decidida_em: new Date().toISOString() } : x)) ?? a);
    recarregar();
    return null;
  };

  const editar = async (mid: number, texto: string) => {
    const { error } = await sb.rpc("editar_mensagem", { mensagem: mid, texto });
    if (error) return erro(error);
    setMsgs((a) => a?.map((x) => (x.id === mid ? { ...x, texto, editada_em: new Date().toISOString() } : x)) ?? a);
    return null;
  };

  const apagar = async (m: Mensagem) => {
    const { error } = await sb.rpc("apagar_mensagem", { mensagem: m.id });
    if (error) return recado(erro(error));
    const meus = (m.anexos ?? []).map((a) => a.path).filter((p) => p.split("/")[1] === eu);
    if (meus.length) sb.storage.from("arquivos").remove(meus);
    setMsgs((a) => a?.map((x) => (x.id === m.id ? { ...x, apagada: true, texto: "Mensagem apagada.", anexos: [] } : x)) ?? a);
  };

  const responder = (m: Mensagem) => {
    setRespondendo({ id: m.id, autor: autor(m), texto: umaLinha(naConversa(m.texto)) });
    compor.current?.focar();
  };

  // ---------------------------------------------------------------- tela

  const link = sala ? `${window.location.origin}/c/${sala.convite}` : "";
  const copiarConvite = async () => { if (await copiarTexto(link)) { setCopiado(true); setTimeout(() => setCopiado(false), 1500); } };


  // quem já aprovou e quem falta, quando a sala pede mais de uma aprovação
  const aprovacaoDe = (m: Mensagem): Aprovacao | null => {
    if (m.tipo !== "proposta" || m.estado !== "pendente") return null;
    const escrevem = membros.filter((x) => x.papel !== "leitor").map((x) => x.user_id);
    const indicados = m.aprovadores?.length ? m.aprovadores : null; // a proposta disse quem decide
    // troca de contexto: todas as pessoas que escrevem, seja qual for a regra da sala
    const precisa = m.novo_contexto ? Math.max(1, escrevem.length) : indicados ? Math.min(indicados.length, precisaSala) : precisaSala; // indicados dizem quem; a sala diz quantos
    if (precisa < 2 && !indicados) return null;
    const curto = (u: string) => (u === eu ? t("você", "you") : nome(u).split(" ")[0]);
    const quem = votos.filter((v) => v.proposta_id === m.id).map((v) => v.user_id);
    const faltam = (indicados ?? escrevem).filter((u) => !quem.includes(u)).map(curto);
    return { precisa, quem: quem.map(curto), euAprovei: quem.includes(eu), faltam, indicados: indicados?.map(curto) ?? null, posso: !indicados || indicados.includes(eu) };
  };

  const passos = [
    { feito: membros.length > 1, titulo: t("Chame as pessoas", "Invite people"), texto: t("Mande o link do convite.", "Send them the invite link."), acao: () => setConvite(true), botao: t("Copiar convite", "Copy invite"), icone: <IconeConvite tamanho={18} /> },
    { feito: agentes.some((a) => a.uid === eu), titulo: t("Conecte o seu agente", "Connect your agent"), texto: t("Claude, ChatGPT, Claude Code ou outro.", "Claude, ChatGPT, Claude Code or any other."), acao: abrirConectar, botao: t("Conectar agente", "Connect agent"), icone: <IconePlugue tamanho={18} /> },
    { feito: !!sala?.contexto, titulo: t("Escreva as instruções", "Write the instructions"), texto: t("Curtas: o objetivo, quem decide o quê e o tom. Todo agente lê antes de responder.", "Keep them short: the goal, who decides what, and the tone. Every agent reads them before replying."), acao: () => setPainel("contexto"), botao: t("Escrever instruções", "Write instructions"), icone: <IconeAjustes tamanho={18} /> },
  ];
  const pendentes = Number(sala?.pendentes ?? 0);
  const ouvindo = agentes.filter((a) => ouvindoAgora(a.presenca?.texto));

  const esperandoDe = (q: Mensagem): Esperando[] => {
    const ja = new Set((respostas.get(q.id) ?? []).map((r) => `${r.agente}|${r.user_id}`));
    // agente que só reagiu (👍) também respondeu: não aparece como "sem resposta"
    reacoes.filter((r) => r.mensagem_id === q.id && r.agente).forEach((r) => ja.add(`${r.agente}|${r.user_id}`));
    return agentes.filter((a) => !ja.has(`${a.nome}|${a.uid}`) && a.presenca && !(q.agente === a.nome && q.user_id === a.uid))
      .map((a) => ({ nome: a.nome, dono: nome(a.uid), status: a.presenca!.texto }));
  };
  const comparando = comparar !== null ? porId.get(comparar) : undefined;

  // reações agrupadas por mensagem e emoji, na ordem em que apareceram
  const reacoesDe = new Map<number, GrupoReacao[]>();
  for (const r of reacoes) {
    const grupos = reacoesDe.get(r.mensagem_id) ?? [];
    let g = grupos.find((x) => x.emoji === r.emoji);
    if (!g) { g = { emoji: r.emoji, quem: [], minha: false }; grupos.push(g); reacoesDe.set(r.mensagem_id, grupos); }
    const minhaR = r.user_id === eu && !r.agente;
    g.quem.push(r.agente ? deQuem(r.agente, primeiro(r.user_id)) : minhaR ? tr("você", "you") : nome(r.user_id));
    if (minhaR) g.minha = true;
  }
  const reagir = async (mensagem: number, emoji: string) => {
    const ja = reacoes.find((r) => r.mensagem_id === mensagem && r.user_id === eu && !r.agente && r.emoji === emoji);
    // na hora, sem esperar o servidor; se falhar, volta como estava
    const antes = reacoes;
    setReacoes(ja ? reacoes.filter((r) => r !== ja) : [...reacoes, { id: -Date.now(), mensagem_id: mensagem, user_id: eu!, agente: null, emoji }]);
    const { error } = await sb.rpc("reagir", { mensagem, emoji });
    if (error) setReacoes(antes);
  };

  // tarefas que nasceram de cada mensagem
  const tarefasDe = new Map<number, Tarefa[]>();
  (tarefas ?? []).forEach((t) => { if (t.origem && t.estado !== "cancelada") tarefasDe.set(t.origem, [...(tarefasDe.get(t.origem) ?? []), t]); });
  const abertasSala = (tarefas ?? []).filter((t) => t.estado === "aberta").length;
  const quemFaz = (t: Tarefa) => (t.responsavel_agente ? deQuem(t.responsavel_agente, primeiro(t.responsavel ?? "")) : t.responsavel === eu ? tr("você", "you") : t.responsavel ? nome(t.responsavel) : tr("sem responsável", "unassigned"));

  // meus agentes que não ficam ouvindo: quando alguém chama, ofereço o pedido pronto
  const meusAgentes = agentes.filter((a) => a.uid === eu && !ouvindoAgora(a.presenca?.texto));
  // os que respondem sozinhos não precisam do botão: a Sala acorda o agente
  const chamadosEm = (m: Mensagem) => chamadosTodos(m).filter((a) => !a.sozinho);
  const acordadosEm = (m: Mensagem) => (m.agente ? [] : chamadosTodos(m).filter((a) => a.sozinho));
  const chamadosTodos = (m: Mensagem) => {
    // vale quando outra pessoa chama o meu agente e também quando eu mesmo chamo; não quando um agente meu escreveu
    if (m.apagada || m.tipo === "decisao" || (m.user_id === eu && m.agente) || m.id < 0) return [];
    const ditas = [...m.texto.matchAll(/@([\p{L}\p{N}_]+)(?:-([\p{L}\p{N}_]+))?/gu)].map((x) => [handle(x[1]), x[2] ? handle(x[2]) : ""]);
    const ja = new Set((respostas.get(m.id) ?? []).filter((r) => r.user_id === eu).map((r) => r.agente));
    reacoes.filter((r) => r.mensagem_id === m.id && r.user_id === eu && r.agente).forEach((r) => ja.add(r.agente));
    return meusAgentes.filter((a) => !ja.has(a.nome) && ditas.some(([h, p]) =>
      chamaAgentes(h) || chamaTodos(h) || (h === handle(a.nome) && (!p || p === meuPrimeiro))));
  };
  const copiarPedido = async (texto: string, chave: string) => {
    if (await copiarTexto(texto)) { setCopiouPedido(chave); setTimeout(() => setCopiouPedido(null), 1500); }
  };

  // "enquanto você esteve fora": onde começam as novas e o que pede a sua atenção
  const ateMarco = marco.current?.sala === id ? marco.current.ate : 0;
  const novas = ateMarco && msgs ? msgs.filter((m) => m.id > ateMarco && !(m.user_id === eu && !m.agente) && m.id > 0) : [];
  const primeiraNova = novas[0]?.id;
  const chamaram = novas.filter((m) => !m.apagada && [...m.texto.matchAll(/@[\p{L}\p{N}_]+(?:-[\p{L}\p{N}_]+)?/gu)].some((x) => chamaMim(x[0]))).length;
  const paraDecidir = novas.filter((m) => m.tipo === "proposta" && m.estado === "pendente").length;
  const decididas = novas.filter((m) => m.tipo === "decisao").length;
  const resumo = novas.length ? [
    novas.length === 1 ? t("1 nova desde a sua última visita", "1 new message since your last visit") : t(`${novas.length} novas desde a sua última visita`, `${novas.length} new messages since your last visit`),
    chamaram && t(`chamaram você ${chamaram}×`, `mentioned you ${chamaram}×`),
    paraDecidir && (paraDecidir === 1 ? t("1 proposta para decidir", "1 proposal to decide") : t(`${paraDecidir} propostas para decidir`, `${paraDecidir} proposals to decide`)),
    decididas && (decididas === 1 ? t("1 decisão", "1 decision") : t(`${decididas} decisões`, `${decididas} decisions`)),
  ].filter(Boolean).join(" · ") : "";

  // conversa longa entre agentes: mostra o começo e o fim de cada sequência e recolhe o meio.
  // Nunca recolhe proposta, mensagem com anexo, mensagem que chama você, a que tem tarefa nem a destacada.
  const recolhidas = useMemo(() => {
    const oculta = new Map<number, { inicio: number; n: number; quem: string[] } | null>();
    if (!msgs) return oculta;
    const fixa = (m: Mensagem) => m.tipo !== "mensagem" || (m.anexos?.length ?? 0) > 0 || m.id === destaque || m.id === primeiraNova || m.id <= 0 ||
      [...m.texto.matchAll(/@[\p{L}\p{N}_]+(?:-[\p{L}\p{N}_]+)?/gu)].some((x) => chamaMim(x[0])) || tarefasDe.has(m.id);
    let i = 0;
    while (i < msgs.length) {
      if (!msgs[i].agente) { i++; continue; }
      let j = i;
      while (j < msgs.length && msgs[j].agente && msgs[j].tipo !== "decisao") j++;
      // sequência i..j-1 só de agentes: fica a primeira e as duas últimas
      if (j - i >= 6) {
        let bloco: Mensagem[] = [];
        const fecha = () => {
          if (bloco.length >= 3 && !abertos.has(bloco[0].id)) {
            const quem = [...new Set(bloco.map((x) => autor(x)))];
            bloco.forEach((x, k) => oculta.set(x.id, k === 0 ? { inicio: x.id, n: bloco.length, quem } : null));
          }
          bloco = [];
        };
        for (let k = i + 1; k < j - 2; k++) { if (fixa(msgs[k])) fecha(); else bloco.push(msgs[k]); }
        fecha();
      }
      i = j;
    }
    return oculta;
  }, [msgs, abertos, destaque, primeiraNova, chamaMim, tarefasDe, autor]);

  // quanto o agente levou para responder à pergunta citada ("40 s"); só para respostas do mesmo dia
  const tempoDe = (m: Mensagem) => {
    if (!m.agente || !m.responde_a || m.tipo === "decisao") return undefined;
    const q = porId.get(m.responde_a);
    if (!q) return undefined;
    const seg = (new Date(m.criada_em).getTime() - new Date(q.criada_em).getTime()) / 1000;
    if (seg < 0 || seg > 86400) return undefined;
    return seg < 60 ? `${Math.max(1, Math.round(seg))} s` : seg < 3600 ? `${Math.round(seg / 60)} min` : `${Math.round(seg / 3600)} h`;
  };
  const avatarDe = (uid: string) => membros.find((x) => x.user_id === uid)?.perfis?.avatar ?? null;

  // agentes que estão ouvindo, foram chamados há pouco e ainda não responderam: "Claude de Ana está lendo a sala…"
  const pensando = useMemo(() => {
    if (!msgs?.length) return [];
    const res = new Map<string, AgenteSala>();
    const recentes = msgs.slice(-5).filter((q) => q.tipo !== "decisao" && !q.apagada && q.id > 0 && Date.now() - new Date(q.criada_em).getTime() < 4 * 60_000);
    for (const q of recentes) {
      const ditas = [...q.texto.matchAll(/@([\p{L}\p{N}_]+)(?:-([\p{L}\p{N}_]+))?/gu)].map((x) => [handle(x[1]), x[2] ? handle(x[2]) : ""]);
      if (!ditas.length) continue;
      const ja = new Set(msgs.filter((x) => x.id > q.id && x.agente).map((x) => `${x.agente}|${x.user_id}`));
      reacoes.filter((r) => r.mensagem_id === q.id && r.agente).forEach((r) => ja.add(`${r.agente}|${r.user_id}`));
      for (const a of agentes) {
        if (!ouvindoAgora(a.presenca?.texto) || ja.has(`${a.nome}|${a.uid}`) || (q.agente === a.nome && q.user_id === a.uid)) continue;
        if (ditas.some(([h, d]) => chamaAgentes(h) || chamaTodos(h) || (h === handle(a.nome) && (!d || d === handle(primeiro(a.uid)))))) res.set(`${a.nome}|${a.uid}`, a);
      }
    }
    return [...res.values()];
  }, [msgs, agentes, reacoes, relogio, primeiro]); // eslint-disable-line react-hooks/exhaustive-deps

  // mensagens na fila saem quando ninguém mais está lendo a sala, ou depois de 90 s
  useEffect(() => {
    const presas = (msgs ?? []).filter((m) => m.fila);
    if (!presas.length) return;
    if (!pensando.length) { presas.forEach(soltar); return; }
    const primeira = Math.min(...presas.map((m) => new Date(m.criada_em).getTime()));
    const t = window.setTimeout(() => presas.forEach(soltar), Math.max(0, primeira + 90_000 - Date.now()));
    return () => window.clearTimeout(t);
  }, [msgs, pensando]); // eslint-disable-line react-hooks/exhaustive-deps
  // ao trocar de sala, o que estava na fila sai na hora
  const presasRef = useRef<Mensagem[]>([]);
  presasRef.current = (msgs ?? []).filter((m) => m.fila);
  useEffect(() => () => { presasRef.current.forEach((m) => mandar({ ...m, fila: false, pendente: true })); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // sala sem mensagens: a caixa vai para o centro, com uma saudação e os próximos passos embaixo
  const vazia = msgs !== null && msgs.length === 0 && !leitor;
  const primeiroNome = (perfil?.nome ?? "").split(" ")[0];
  const saudacoes = [
    t(`No que vamos trabalhar, ${primeiroNome}?`, `What are we working on, ${primeiroNome}?`),
    t(`Por onde começamos, ${primeiroNome}?`, `Where do we start, ${primeiroNome}?`),
    t(`O que esta sala precisa resolver?`, `What does this room need to solve?`),
  ];
  const saudacao = saudacoes[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % saudacoes.length];

  // "não encontrada" só depois de recarregar a lista: sala recém-criada ainda não estava nela
  if (salas && !sala && conferida === id) {
    return (
      <Layout salas={salas} recarregar={recarregar} fila={fila} foco>
        <section className="vazio">
          <h1 className="display">{t("Sala não encontrada.", "Room not found.")}</h1>
          <p className="sub">{t("Ela pode ter sido apagada, ou você saiu dela. Para entrar, peça um convite a quem está lá.", "It may have been deleted, or you left it. To get back in, ask someone in the room for an invite.")}</p>
          <Link to="/" className="btn">{t("Ver minhas salas", "See my rooms")}</Link>
        </section>
      </Layout>
    );
  }

  return (
    <Layout salas={salas} recarregar={recarregar} fila={fila} foco>
      <div className="sala">
        <div className={`sala-principal ${arrastando ? "arrastando" : ""} ${vazia ? "sala-vazia" : ""}`}
          onDragOver={(e) => { if (!leitor && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setArrastando(true); } }}
          onDragLeave={(e) => { if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setArrastando(false); }}
          onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); compor.current?.anexar([...e.dataTransfer.files]); } setArrastando(false); }}>
          {arrastando && <div className="solte" aria-hidden><IconeClipe /> {t("Solte para anexar", "Drop to attach")}</div>}
          <header className="sala-topo">
            <Link to="/" className="btn-icone so-celular" aria-label={t("Voltar para as salas", "Back to rooms")}><IconeVoltar /></Link>
            <div className="sala-titulo">
              <h1>{sala?.nome ?? " "}</h1>
              <p className="quem">
                {membros.map((m) => m.perfis?.nome?.split(" ")[0]).filter(Boolean).join(", ")}
                {agentes.length > 0 && <> · <IconeAgente tamanho={12} /> {agentes.length} {agentes.length === 1 ? t("agente", "agent") : t("agentes", "agents")}</>}
                {ouvindo.length > 0 && <> · <span className="ponto ponto-mini" aria-hidden /> {ouvindo.length === 1 ? deQuem(ouvindo[0].nome, primeiro(ouvindo[0].uid)) : ouvindo.length} {t("ouvindo", "listening")}</>}
              </p>
            </div>
            <button data-guia="decisoes" className={`btn-icone ${painel === "decisoes" ? "ativo" : ""}`} onClick={() => setPainel((p) => (p === "decisoes" ? null : "decisoes"))}
              aria-expanded={painel === "decisoes"} aria-label={pendentes ? t(`Decisões, ${pendentes} aguardando`, `Decisions, ${pendentes} pending`) : t("Decisões", "Decisions")} title={t("Decisões (D)", "Decisions (D)")}>
              <IconeProposta />
              {pendentes > 0 && <span className="selo-num" aria-hidden>{pendentes}</span>}
            </button>
            <button data-guia="tarefas" className={`btn-icone ${painel === "tarefas" ? "ativo" : ""}`} onClick={() => setPainel((p) => (p === "tarefas" ? null : "tarefas"))}
              aria-expanded={painel === "tarefas"} aria-label={abertasSala ? t(`Tarefas, ${abertasSala} abertas`, `Tasks, ${abertasSala} open`) : t("Tarefas", "Tasks")} title={t("Tarefas (T)", "Tasks (T)")}>
              <IconeDecisao />
              {abertasSala > 0 && <span className="selo-num" aria-hidden>{abertasSala}</span>}
            </button>
            <button className={`btn-icone some-celular ${painel === "painel" ? "ativo" : ""}`} onClick={() => setPainel((p) => (p === "painel" ? null : "painel"))}
              aria-expanded={painel === "painel"} aria-label={t("Painel da sala", "Room dashboard")} title={t("Painel (P)", "Dashboard (P)")}>
              <IconePainel />
            </button>
            <button data-guia="biblioteca" className={`btn-icone some-celular ${painel === "biblioteca" || painel === "memoria" ? "ativo" : ""}`} onClick={() => setPainel((p) => (p === "biblioteca" || p === "memoria" ? null : "biblioteca"))}
              aria-expanded={painel === "biblioteca"} aria-label={t("Biblioteca da sala", "Room library")} title={t("Biblioteca (B)", "Library (B)")}>
              <IconeBiblioteca />
            </button>
            <button className={`btn-icone some-celular ${painel === "busca" ? "ativo" : ""}`} onClick={() => setPainel((p) => (p === "busca" ? null : "busca"))}
              aria-expanded={painel === "busca"} aria-label={t("Buscar na sala", "Search the room")} title={t("Buscar (/)", "Search (/)")}>
              <IconeBusca />
            </button>
            {!leitor && <button className="btn btn-convidar" data-guia="convidar" onClick={() => setConvite((v) => !v)} aria-expanded={convite} aria-label={t("Convidar pessoas", "Invite people")} title={t("Convidar pessoas", "Invite people")}>
              <IconeConvite tamanho={18} /> <span className="some-celular">{t("Convidar", "Invite")}</span>
            </button>}
            <button className="btn-icone so-celular" onClick={abrirComandos} aria-label={t("Mais: painel, biblioteca, busca, ajustes", "More: dashboard, library, search, settings")}>
              <IconeMais3 />
            </button>
            <button className={`btn-icone some-celular ${painel === "ajustes" || painel === "contexto" ? "ativo" : ""}`} onClick={() => setPainel((p) => (p === "ajustes" || p === "contexto" ? null : "ajustes"))}
              aria-expanded={painel === "ajustes"} aria-label={t("Ajustes da sala", "Room settings")} title={t("Ajustes da sala", "Room settings")}>
              <IconeAjustes />
            </button>
          </header>

          {convite && sala && (
            <div className="convite" role="region" aria-label={t("Convite", "Invite")}>
              <p>{t("Quem abrir este link entra na sala e pode conectar os próprios agentes. Serve para gente de qualquer empresa.", "Anyone with this link can join the room and connect their own agents. Works for people at any company.")}</p>
              <div className="copiar-campo">
                <input readOnly value={link.replace(/^https?:\/\//, "")} onFocus={(e) => e.target.select()} aria-label={t("Link do convite", "Invite link")} />
                <button className={`btn btn-pequeno ${copiado ? "" : "btn-cheio"}`} onClick={copiarConvite}>{copiado ? <><IconeCheck tamanho={14} /> {t("Copiado", "Copied")}</> : t("Copiar", "Copy")}</button>
              </div>
            </div>
          )}

          <div className="feed-caixa">
          <div className="feed" ref={feed} role="log" aria-live="polite" aria-label={t(`Conversa em ${sala?.nome ?? "sala"}`, `Conversation in ${sala?.nome ?? "room"}`)}
            onScroll={(e) => {
              const f = e.currentTarget, falta = f.scrollHeight - f.scrollTop - f.clientHeight;
              noFim.current = falta < 80;
              setLongeDoFim(falta > 600 || longe.current);
              if (noFim.current) setNovasAbaixo(0);
            }}>
            {msgs === null && <div className="feed-esqueleto" aria-hidden><span /><span /><span /></div>}

            {temAnteriores && msgs && (
              <div className="anteriores"><button className="btn btn-pequeno" onClick={carregarAnteriores}>{t("Mostrar mensagens anteriores", "Show earlier messages")}</button></div>
            )}

            {vazia && (
              <section className="sala-abertura">
                <span className="sala-abertura-inicial" style={{ "--cor": corDaSala(id) } as React.CSSProperties} aria-hidden>{(sala?.nome ?? " ").slice(0, 1).toUpperCase()}</span>
                <h2>{saudacao}</h2>
                <p className="sub">{t("Escreva para a sala, chame um agente com @ ou pergunte a todos de uma vez.", "Write to the room, mention an agent with @, or ask all of them at once.")}</p>
              </section>
            )}

            {msgs !== null && !leitor && !vazia && passos.some((p) => !p.feito) && msgs.length < 4 && (
              <section className="passos-sala" aria-label={t("Próximos passos", "Next steps")}>
                <h2>{msgs.length ? t("Para a sala render mais", "Get more out of your room") : t("Sala pronta. Três passos e ela ganha vida.", "Your room is ready. Three steps to get it going.")}</h2>
                <ol>
                  {passos.map((p) => (
                    <li key={p.titulo} className={p.feito ? "feito" : ""}>
                      <span className="passo-icone" aria-hidden>{p.feito ? <IconeCheck tamanho={18} /> : p.icone}</span>
                      <span className="passo-texto"><strong>{p.titulo}</strong><span>{p.feito ? t("Feito.", "Done.") : p.texto}</span></span>
                      {!p.feito && <button className="btn btn-pequeno" onClick={p.acao}>{p.botao}</button>}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {msgs !== null && msgs.length === 0 && leitor && (
              <section className="feed-vazio">
                <span className="vazio-icone"><IconeAgente tamanho={20} /></span>
                <p><strong>{t("Ninguém falou ainda.", "No one has said anything yet.")}</strong></p>
                <p className="nota">{leitor ? t("Quando a conversa começar, ela aparece aqui.", "The conversation will show up here once it starts.")
                  : t(`Escreva a primeira mensagem, ou pergunte a todos os agentes com @${tc("agentes", "agents")}.`, `Write the first message, or ask all agents with @${tc("agentes", "agents")}.`)}</p>
              </section>
            )}

            {msgs !== null && msgs.length > 0 && msgs.length < 12 && !msgs.some((m) => m.tipo !== "mensagem") && agentes.length > 0 && (
              <p className="dica-sala"><IconeProposta tamanho={16} /><span>{t("Peça uma decisão com ", "Ask for a decision with ")}<strong>{t("Propor", "Propose")}</strong>{t(", ou pergunte a todos os agentes com ", ", or ask all agents with ")}<strong>@{tc("agentes", "agents")}</strong>{t(" e compare as respostas.", " and compare their answers.")}</span></p>
            )}

            {msgs?.map((m, i) => {
              // mensagem de agente apagada (quase sempre um envio por engano que ele mesmo corrigiu) some da conversa
              if (m.apagada && m.agente) return null;
              if (recolhidas.has(m.id)) {
                const r = recolhidas.get(m.id);
                return r ? (
                  <button key={m.id} type="button" className="recolhidas" onClick={() => setAbertos((a) => new Set(a).add(r.inicio))}>
                    <IconeAgente tamanho={15} />
                    <span>{t(`${r.n} mensagens entre agentes`, `${r.n} messages between agents`)} · {r.quem.join(", ")}</span>
                    <span className="recolhidas-ver">{t("Mostrar", "Show")}</span>
                  </button>
                ) : null;
              }
              const ant = msgs[i - 1];
              const novoDia = !ant || new Date(ant.criada_em).toDateString() !== new Date(m.criada_em).toDateString();
              const marcoAqui = m.id === primeiraNova && resumo ? (
                <div className="novas" id="novas" role="separator" aria-label={t("Novas desde a sua última visita", "New since your last visit")}><span>{resumo}</span></div>
              ) : null;
              if (m.tipo === "decisao") {
                const p = m.responde_a ? porId.get(m.responde_a) : undefined;
                return (
                  <div key={m.id} className="msg-bloco">
                    {novoDia && <div className="dia" role="separator"><span>{dia(m.criada_em)}</span></div>}
                    {marcoAqui}
                    <Evento m={m} quem={m.user_id === eu ? t("Você", "You") : nome(m.user_id)} de={p ? autor(p) : ""} quando={hora(m.criada_em)} irPara={irPara} />
                  </div>
                );
              }
              const continua = !novoDia && !!ant && ant.user_id === m.user_id && ant.agente === m.agente && !ant.falhou &&
                ant.tipo === "mensagem" && !m.responde_a && new Date(m.criada_em).getTime() - new Date(ant.criada_em).getTime() < 5 * 60_000;
              const citada = m.responde_a ? porId.get(m.responde_a) : undefined;
              // respostas seguidas à mesma pergunta não repetem a citação: a pergunta está logo acima
              const emSequencia = !!m.responde_a && msgs.slice(msgs.findIndex((x) => x.id === m.responde_a) + 1, i)
                .every((x) => x.responde_a === m.responde_a) && porId.has(m.responde_a);
              const minhaPessoa = m.user_id === eu && !m.agente;
              const rs = perguntaATodos(m) ? respostas.get(m.id) ?? [] : null;
              const esperando = rs ? esperandoDe(m) : [];
              return (
                <div key={m.id} className="msg-bloco">
                  {novoDia && <div className="dia" role="separator"><span>{dia(m.criada_em)}</span></div>}
                  {marcoAqui}
                  <Bolha m={m} nome={nome(m.user_id)} quando={hora(m.criada_em)} quandoCompleto={completo(m.criada_em)} avatar={m.agente ? null : avatarDe(m.user_id)} tempo={tempoDe(m)}
                    avaliar={m.agente && m.id > 0 && !leitor && m.tipo === "mensagem" ? { dono: primeiro(m.user_id), corrigir: (nota) => pedirCorrecao(m, nota) } : undefined}
                    fila={m.fila ? { ate: pensando.length === 1 ? deQuem(pensando[0].nome, primeiro(pensando[0].uid)) : t("os agentes", "the agents"), agora: () => soltar(m) } : undefined}
                    minha={minhaPessoa} continua={continua} chamaMim={chamaMim} destaque={destaque === m.id}
                    autorDe={(id) => { const x = porId.get(id); return x ? autor(x) : null; }}
                    tarefaDe={(id) => tarefas?.find((x) => x.id === id)?.titulo ?? null} abrirTarefas={() => setPainel("tarefas")}
                    aprovacao={aprovacaoDe(m)} nomeDe={nome}
                    decisor={m.decidida_por ? (m.decidida_por === eu ? t("você", "you") : nome(m.decidida_por)) : undefined}
                    citacao={m.responde_a && !emSequencia ? { id: m.responde_a, autor: citada ? autor(citada) : t("Mensagem anterior", "Earlier message"), texto: citada ? (citada.apagada ? t("Mensagem apagada.", "Message deleted.") : umaLinha(naConversa(citada.texto), 120)) : "" } : null}
                    responder={m.id > 0 && !leitor ? () => responder(m) : undefined}
                    copiar={() => copiarTexto(m.texto)}
                    editar={minhaPessoa && m.tipo === "mensagem" && m.id > 0 ? (t) => editar(m.id, t) : undefined}
                    apagar={(m.user_id === eu || dono) && m.id > 0 ? () => apagar(m) : undefined}
                    decidir={m.tipo === "proposta" && m.id > 0 && !leitor ? (a, n) => decidir(m.id, a, n) : undefined}
                    virarTarefa={m.id > 0 && !m.apagada && !leitor ? () => {
                      const t = m.texto.replace(/[*_`#>]/g, "").replace(/@[\p{L}\p{N}_-]+/gu, "").split("\n").map((x) => x.trim()).find(Boolean) ?? "";
                      setRascunho({ titulo: t.slice(0, 120), origem: m.id, responsavel: valorResp(m.user_id, m.agente) });
                      setPainel("tarefas");
                    } : undefined}
                    reacoes={reacoesDe.get(m.id)} reagir={m.id > 0 && !m.apagada ? (e) => reagir(m.id, e) : undefined}
                    tentarDeNovo={() => tentarDeNovo(m)} irPara={irPara} />
                  {(tarefasDe.get(m.id) ?? []).map((t) => (
                    <button key={t.id} className={`tarefa-chip ${minhaPessoa ? "tarefa-chip-minha" : ""} ${t.estado === "feita" ? "feita" : atrasada(t) ? "atrasada" : ""}`}
                      onClick={() => setPainel("tarefas")} title={tr("Ver nas tarefas", "View in tasks")}>
                      <Marcador feito={t.estado === "feita"} tamanho={15} />
                      <span>{t.estado === "feita" ? tr("Feita", "Done") : atrasada(t) ? tr("Atrasada", "Overdue") : tr("Tarefa", "Task")}: <strong>{t.titulo}</strong> · {quemFaz(t)}{t.estado === "aberta" && t.prazo ? ` · ${atrasada(t) ? tr("era ", "was due ") : tr("até ", "due ")}${prazoCurto(t.prazo)}` : ""}</span>
                    </button>
                  ))}
                  {chamadosEm(m).length > 0 && sala && (
                    <div className={`pedir ${pedido === m.id ? "pedir-destaque" : ""} ${minhaPessoa ? "respostas-minha" : ""}`}>
                      <span className="nota">{m.user_id === eu
                        ? t("O seu agente só lê a sala quando você pede:", "Your agent only reads the room when you ask:")
                        : chamadosEm(m).length === 1 ? t(`Chamaram o seu ${chamadosEm(m)[0].nome}.`, `Someone mentioned your ${chamadosEm(m)[0].nome}.`) : t("Chamaram os seus agentes.", "Someone mentioned your agents.")}</span>
                      {chamadosEm(m).map((a) => {
                        const { texto, url } = pedidoPara(a.nome, sala.nome, m, autor(m));
                        const chave = `${m.id}${a.nome}`;
                        return url ? (
                          <a key={a.nome} className="btn btn-pequeno btn-cheio" href={url} target="_blank" rel="noopener noreferrer"
                            onClick={() => { copiarTexto(texto); setPedido(null); }} title={t("Abre numa aba nova com o pedido já escrito", "Opens in a new tab with the request already filled in")}>
                            <IconeAbrir tamanho={16} /> {t(`Pedir ao ${a.nome}`, `Ask ${a.nome}`)}
                          </a>
                        ) : (
                          <button key={a.nome} className="btn btn-pequeno" onClick={() => copiarPedido(texto, chave)}>
                            <IconeCopiar tamanho={16} /> {copiouPedido === chave ? t("Copiado. Cole no " + a.nome, `Copied. Paste it into ${a.nome}`) : t(`Copiar pedido para o ${a.nome}`, `Copy request for ${a.nome}`)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {acordadosEm(m).length > 0 && Date.now() - new Date(m.criada_em).getTime() < 10 * 60_000 && (
                    <p className={`pedir nota ${minhaPessoa ? "respostas-minha" : ""}`}>
                      {acordadosEm(m).map((a) => a.nome).join(", ")}{" "}
                      {t("foi chamado e responde sozinho em cerca de 1 minuto.", "was mentioned and will reply on its own in about a minute.")}
                    </p>
                  )}
                  {rs && (rs.length > 0 || esperando.length > 0) && (
                    <div className={`respostas ${minhaPessoa ? "respostas-minha" : ""}`} aria-label={t("Respostas dos agentes", "Agent answers")}>
                      {porAgente(rs).map(({ final: r }) => (
                        <button key={r.id} className="resp-chip" onClick={() => irPara(r.id)}>
                          <IconeCheck tamanho={14} /> {deQuem(r.agente ?? "", primeiro(r.user_id))}
                        </button>
                      ))}
                      {esperando.map((e) => (
                        <span key={`${e.nome}${e.dono}`} className="resp-chip resp-esperando" title={e.status}>
                          <span className="resp-anel" aria-hidden /> {deQuem(e.nome, e.dono.split(" ")[0])} · {/^(ouvindo|listening)/.test(e.status) ? t("pensando", "thinking") : t("sem resposta", "no answer")}
                        </span>
                      ))}
                      {rs.length > 0 && (
                        <button className="btn btn-pequeno btn-comparar" onClick={() => setComparar(m.id)}>
                          <IconeColunas tamanho={16} /> {porAgente(rs).length > 1 ? t("Comparar lado a lado", "Compare side by side") : t("Ver resposta", "View answer")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {pensando.length > 0 && !longe.current && (
              <div className="pensando" role="status">
                <span className="msg-avatar msg-avatar-agente" aria-hidden><IconeAgente tamanho={13} /></span>
                <span className="pensando-texto">
                  {pensando.length === 1
                    ? t(`${deQuem(pensando[0].nome, primeiro(pensando[0].uid))} está lendo a sala…`, `${deQuem(pensando[0].nome, primeiro(pensando[0].uid))} is reading the room…`)
                    : t(`${pensando.map((a) => deQuem(a.nome, primeiro(a.uid))).join(", ")} estão lendo a sala…`, `${pensando.map((a) => deQuem(a.nome, primeiro(a.uid))).join(", ")} are reading the room…`)}
                </span>
              </div>
            )}
          </div>

          {(msgs?.length ?? 0) >= 25 && <Minimapa feed={feed} versao={msgs} irPara={irPara} />}

          {(longeDoFim || temPosteriores) && (
            <button className="ir-fim" onClick={() => {
              setNovasAbaixo(0); setLongeDoFim(false);
              if (longe.current || temPosteriores) { carregarRecentes(id); return; }
              noFim.current = true;
              feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
            }} aria-label={novasAbaixo ? t(`Ir para o fim da conversa, ${novasAbaixo} novas`, `Jump to latest, ${novasAbaixo} new`) : t("Ir para o fim da conversa", "Jump to latest")}
              title={t("Ir para o fim", "Jump to latest")}>
              <IconeVoltar tamanho={20} />
              {(novasAbaixo > 0 || temPosteriores) && <span className="ir-fim-num">{novasAbaixo > 0 ? (novasAbaixo > 99 ? "99+" : novasAbaixo) : "•"}</span>}
            </button>
          )}
          </div>

          {!leitor && <Avisos />}
          {leitor ? (
            <p className="so-leitura" role="status">{t("Você acompanha esta sala no modo só leitura: vê a conversa, as decisões e as tarefas, mas não escreve. Para participar, peça a quem cuida da sala.", "You're a viewer in this room: you can see the conversation, decisions and tasks, but you can't write. To join in, ask the room owner.")}</p>
          ) : <Compor key={id} ref={compor} subir={(f) => subirArquivo(id, eu, f)} sugestoesBase={sugestoes} respondendo={respondendo} cancelarResposta={() => setRespondendo(null)} enviar={enviar}
            vazia={vazia} criarTarefa={(texto) => { setRascunho({ titulo: texto.slice(0, 120), origem: null, responsavel: valorResp(eu, null) }); setPainel("tarefas"); }}
            pessoas={membros.filter((x) => x.papel !== "leitor").map((x) => ({ id: x.user_id, nome: x.user_id === eu ? t("Você", "You") : (x.perfis?.nome ?? "").split(" ")[0] }))} />}
          {vazia && (
            <ul className="sala-sugestoes" aria-label={t("Para começar", "To get started")}>
              {passos.filter((p) => !p.feito).map((p) => (
                <li key={p.titulo}><button type="button" onClick={p.acao}>{p.icone}<span><strong>{p.titulo}</strong><span>{p.texto}</span></span></button></li>
              ))}
              <li><button type="button" onClick={() => { compor.current?.inserir(`@${tc("agentes", "agents")} `); }}>
                <IconeAgente tamanho={18} /><span><strong>{t("Perguntar a todos os agentes", "Ask every agent")}</strong><span>{t("Cada um responde e você compara lado a lado.", "Each one answers and you compare them side by side.")}</span></span>
              </button></li>
            </ul>
          )}
        </div>

        {(painel === "ajustes" || painel === "contexto") && sala && (
          <Ajustes sala={sala} membros={membros} agentes={agentes} eu={eu} fechar={() => setPainel(null)} recarregar={recarregar}
            foco={painel === "contexto" ? "contexto" : undefined} abrirMemoria={() => setPainel("memoria")} />
        )}
        {painel === "decisoes" && sala && (
          <Decisoes salaId={sala.id} salaNome={sala.nome} versao={versaoDecisoes} autor={autor} nome={nome}
            decidir={decidir} aprovacaoDe={aprovacaoDe} irPara={irPara} fechar={() => setPainel(null)} abrirAta={() => setAta(true)} />
        )}
        {painel === "tarefas" && sala && (
          <Tarefas salaId={sala.id} salaNome={sala.nome} tarefas={tarefas} membros={membros} agentes={agentes} eu={eu} nome={nome}
            rascunho={rascunho} limparRascunho={() => setRascunho(null)} irPara={irPara} fechar={() => { setPainel(null); setRascunho(null); }} />
        )}
        {painel === "painel" && sala && (
          <PainelSala salaId={sala.id} eu={eu} versao={versaoDecisoes + votos.length} tarefas={tarefas} irPara={irPara}
            abrirTarefas={() => setPainel("tarefas")} abrirDecisoes={() => setPainel("decisoes")} fechar={() => setPainel(null)} />
        )}
        {painel === "busca" && sala && <Busca salaId={sala.id} autor={autor} irPara={irPara} fechar={() => setPainel(null)} />}
        {painel === "biblioteca" && sala && <Biblioteca salaId={sala.id} eu={eu} podeEscrever={!leitor} nome={nome} fechar={() => setPainel(null)} abrirMemoria={() => setPainel("memoria")} irPara={irPara} />}
        {painel === "memoria" && sala && <Memoria salaId={sala.id} eu={eu} podeEscrever={!leitor} nome={nome} fechar={() => setPainel(null)} voltar={() => setPainel("biblioteca")} />}
      </div>

      {ata && sala && <Ata salaId={sala.id} salaNome={sala.nome} autor={autor} nome={nome} fechar={() => setAta(false)} />}
      {comparando && (
        <Comparar pergunta={comparando} autorPergunta={comparando.user_id === eu ? t("Você", "You") : nome(comparando.user_id)}
          respostas={respostas.get(comparando.id) ?? []} autor={autor} esperando={esperandoDe(comparando)} fechar={() => setComparar(null)} />
      )}
    </Layout>
  );
}
