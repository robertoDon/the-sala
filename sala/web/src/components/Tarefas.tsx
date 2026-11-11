import { useEffect, useState } from "react";
import { atrasada, copiarTexto, pedidoTarefa, sb, type Membro, type Tarefa } from "../supabase";
import type { AgenteSala } from "../pages/Sala";
import { IconeAgente, IconeFechar, IconeMais, IconeRelogio, IconeVoltar, Marcador } from "./Icones";
import { Menu } from "./Menu";
import { erro as msgErro, locale, t } from "../i18n";
import { recado } from "./Recados";
import { indicador } from "./indicador";

export type RascunhoTarefa = { titulo: string; origem: number | null; responsavel: string; prazo?: string } | null;

type Props = {
  salaId: string;
  salaNome: string;
  tarefas: Tarefa[] | null;
  membros: Membro[];
  agentes: AgenteSala[];
  eu: string;
  nome: (uid: string | null) => string;
  rascunho: RascunhoTarefa;
  limparRascunho: () => void;
  irPara: (id: number) => void;
  fechar: () => void;
};

// valor do seletor de responsável: "p:<pessoa>" ou "a:<pessoa>:<agente>"
export const valorResp = (uid: string | null, agente: string | null) => (uid ? (agente ? `a:${uid}:${agente}` : `p:${uid}`) : "");
const lerResp = (v: string) => {
  if (!v) return { responsavel: null, responsavel_agente: null };
  const [tf, uid, ...ag] = v.split(":");
  return { responsavel: uid, responsavel_agente: tf === "a" ? ag.join(":") : null };
};
const paraInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10) : "");
// prazo só com data: vale até as 18h no fuso de quem escolheu (fim do dia útil)
const doInput = (d: string) => {
  const [a, m, dia] = d.split("-").map(Number);
  return a && m && dia ? new Date(a, m - 1, dia, 18, 0, 0).toISOString() : null;
};
export const prazoCurto = (iso: string) => {
  const d = new Date(iso);
  const hoje = new Date(); const amanha = new Date(); amanha.setDate(hoje.getDate() + 1);
  if (d.toDateString() === hoje.toDateString()) return t("hoje", "today");
  if (d.toDateString() === amanha.toDateString()) return t("amanhã", "tomorrow");
  return d.toLocaleDateString(locale(), { day: "numeric", month: "short" }).replace(".", "");
};

function Formulario({ inicial, membros, agentes, nome, salvar, cancelar, botao, frentes }: {
  inicial: { titulo: string; responsavel: string; prazo: string; frente: string };
  membros: Membro[]; agentes: AgenteSala[]; nome: (uid: string | null) => string; frentes: string[];
  salvar: (titulo: string, resp: string, prazo: string, frente: string) => Promise<string | null>; cancelar: () => void; botao: string;
}) {
  const [titulo, setTitulo] = useState(inicial.titulo);
  const [resp, setResp] = useState(inicial.responsavel);
  const [prazo, setPrazo] = useState(inicial.prazo);
  const [frente, setFrente] = useState(inicial.frente);
  const [erro, setErro] = useState("");
  const [indo, setIndo] = useState(false);
  return (
    <form className="tarefa-form" onSubmit={async (e) => {
      e.preventDefault();
      if (!titulo.trim()) return;
      setIndo(true);
      const r = await salvar(titulo.trim(), resp, prazo, frente.trim());
      setIndo(false);
      if (r) setErro(r);
    }} onKeyDown={(e) => e.key === "Escape" && cancelar()}>
      <label className="sr" htmlFor="tf-titulo">{t("O que precisa ser feito", "What needs to be done")}</label>
      <input id="tf-titulo" autoFocus value={titulo} maxLength={200} placeholder={t("O que precisa ser feito", "What needs to be done")} onChange={(e) => setTitulo(e.target.value)} />
      <div className="tarefa-campos">
        <label><span className="rotulo">{t("Quem faz", "Owner")}</span>
          <select value={resp} onChange={(e) => setResp(e.target.value)}>
            <option value="">{t("Ninguém ainda", "No one yet")}</option>
            <optgroup label={t("Pessoas", "People")}>
              {membros.map((m) => <option key={m.user_id} value={valorResp(m.user_id, null)}>{m.perfis?.nome}</option>)}
            </optgroup>
            {agentes.length > 0 && (
              <optgroup label={t("Agentes", "Agents")}>
                {agentes.map((a) => <option key={`${a.nome}${a.uid}`} value={valorResp(a.uid, a.nome)}>{t(`${a.nome} de ${nome(a.uid).split(" ")[0]}`, `${nome(a.uid).split(" ")[0]}'s ${a.nome}`)}</option>)}
              </optgroup>
            )}
          </select>
        </label>
        <label><span className="rotulo">{t("Prazo", "Due date")}</span>
          <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} title={t("vale até as 18h", "due by 6 PM")} />
          {prazo && <span className="nota">{t("vale até as 18h", "due by 6 PM")}</span>}
        </label>
        <label><span className="rotulo">{t("Frente", "Workstream")}</span>
          <input value={frente} maxLength={40} list="tf-frentes" placeholder={t("Opcional", "Optional")} onChange={(e) => setFrente(e.target.value)} />
          <datalist id="tf-frentes">{frentes.map((f) => <option key={f} value={f} />)}</datalist>
        </label>
      </div>
      {erro && <p className="nota erro" role="alert">{erro}</p>}
      <div className="linha">
        <button className="btn btn-pequeno btn-cheio" disabled={!titulo.trim() || indo}>{botao}</button>
        <button type="button" className="btn btn-pequeno btn-texto" onClick={cancelar}>{t("Cancelar", "Cancel")}</button>
      </div>
    </form>
  );
}

// pessoa ou agente responsável, com a inicial (ou o ícone do agente) num círculo
function Resp({ nome, agente, eu }: { nome: string; agente: boolean; eu: boolean }) {
  return (
    <span className={`resp ${eu ? "resp-eu" : ""} ${agente ? "resp-agente" : ""}`}>
      <span className="resp-avatar" aria-hidden>{agente ? <IconeAgente tamanho={11} /> : (nome.trim()[0] ?? "?").toUpperCase()}</span>
      {nome}
    </span>
  );
}

// prazo como pílula: atrasada em vermelho, hoje/amanhã em destaque, o resto neutro
export function Prazo({ tf }: { tf: Tarefa }) {
  if (!tf.prazo || tf.estado !== "aberta") return null;
  const atr = atrasada(tf);
  const perto = !atr && new Date(tf.prazo).getTime() - Date.now() < 2 * 864e5;
  return (
    <span className={`pilula ${atr ? "pilula-erro" : perto ? "pilula-acento" : ""}`} title={t("vale até as 18h", "due by 6 PM")}>
      <IconeRelogio tamanho={12} />{atr ? t(`Atrasada · ${prazoCurto(tf.prazo)}`, `Overdue · ${prazoCurto(tf.prazo)}`) : prazoCurto(tf.prazo)}
    </span>
  );
}

// Tarefas da sala: o que está aberto, com quem e até quando; o que já foi entregue.
// Um toque no círculo conclui (com Desfazer); o resto das ações fica no menu ⋯.
export function Tarefas({ salaId, salaNome, tarefas, membros, agentes, eu, nome, rascunho, limparRascunho, irPara, fechar }: Props) {
  const [rapida, setRapida] = useState("");
  const [copiouPedido, setCopiouPedido] = useState<number | null>(null);
  const meusAgentes = agentes.filter((a) => a.uid === eu);
  const [nova, setNova] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  const [concluindo, setConcluindo] = useState<number | null>(null);
  const [resultado, setResultado] = useState("");
  const [so, setSo] = useState<"todas" | "minhas">("todas");
  const [marcando, setMarcando] = useState<Set<number>>(new Set());
  const [desfazer, setDesfazer] = useState<Tarefa | null>(null);
  const [verFeitas, setVerFeitas] = useState(false);

  useEffect(() => { if (rascunho) { setNova(true); setEditando(null); } }, [rascunho]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !nova && editando === null && concluindo === null && fechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [fechar, nova, editando, concluindo]);
  useEffect(() => {
    if (!desfazer) return;
    const id = setTimeout(() => setDesfazer(null), 6000);
    return () => clearTimeout(id);
  }, [desfazer]);

  const primeiro = (uid: string | null) => nome(uid).split(" ")[0];
  const quemNome = (tf: Tarefa) => (tf.responsavel_agente ? t(`${tf.responsavel_agente} de ${primeiro(tf.responsavel)}`, `${primeiro(tf.responsavel)}'s ${tf.responsavel_agente}`)
    : tf.responsavel ? (tf.responsavel === eu ? t("Você", "You") : nome(tf.responsavel)) : t("Sem responsável", "Unassigned"));
  const minha = (tf: Tarefa) => tf.responsavel === eu;
  const vivas = (tarefas ?? []).filter((tf) => tf.estado !== "cancelada");
  const lista = vivas.filter((tf) => so === "todas" || minha(tf));
  const minhasAbertas = vivas.filter((tf) => tf.estado === "aberta" && minha(tf)).length;
  const abertas = lista.filter((tf) => tf.estado === "aberta" || marcando.has(tf.id))
    .sort((a, b) => Number(atrasada(b)) - Number(atrasada(a)) || (a.prazo ? new Date(a.prazo).getTime() : Infinity) - (b.prazo ? new Date(b.prazo).getTime() : Infinity) || b.id - a.id);
  const feitas = lista.filter((tf) => tf.estado === "feita" && !marcando.has(tf.id)).sort((a, b) => (b.concluida_em ?? "").localeCompare(a.concluida_em ?? "")).slice(0, 30);

  const frentes = [...new Set(vivas.map((tf) => tf.frente).filter((f): f is string => !!f))].sort();

  const criar = async (titulo: string, resp: string, prazo: string, frente: string) => {
    const r = lerResp(resp);
    const { error } = await sb.rpc("criar_tarefa", {
      sala: salaId, titulo, origem: rascunho?.origem ?? null, responsavel: r.responsavel, responsavel_agente: r.responsavel_agente, prazo: doInput(prazo), frente: frente || null,
    });
    if (error) return msgErro(error);
    setNova(false); limparRascunho();
    return null;
  };

  const salvar = (tf: Tarefa) => async (titulo: string, resp: string, prazo: string, frente: string) => {
    const r = lerResp(resp);
    const { error } = await sb.rpc("editar_tarefa", { tarefa: tf.id, titulo, responsavel: r.responsavel, responsavel_agente: r.responsavel_agente, prazo: doInput(prazo), estado: "aberta", frente });
    if (error) return msgErro(error);
    setEditando(null);
    return null;
  };

  // um toque: o círculo enche, a linha some com calma e aparece Desfazer
  const marcar = async (tf: Tarefa) => {
    setMarcando((s) => new Set(s).add(tf.id));
    const [{ error }] = await Promise.all([
      sb.rpc("concluir_tarefa", { tarefa: tf.id, resultado: null }),
      new Promise((r) => setTimeout(r, 520)),
    ]);
    setMarcando((s) => { const n = new Set(s); n.delete(tf.id); return n; });
    if (error) return recado(msgErro(error));
    setDesfazer(tf);
  };

  const concluir = async (tf: Tarefa) => {
    const { error } = await sb.rpc("concluir_tarefa", { tarefa: tf.id, resultado: resultado.trim() || null });
    if (error) return recado(msgErro(error));
    setConcluindo(null); setResultado(""); setDesfazer(tf);
  };

  const pedirAoAgente = async (tf: Tarefa, agente: string) => {
    const { texto, url } = pedidoTarefa(agente, salaNome, tf);
    await copiarTexto(texto);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else { setCopiouPedido(tf.id); setTimeout(() => setCopiouPedido(null), 2500); }
  };

  const cancelarTarefa = async (tf: Tarefa) => {
    const { error } = await sb.rpc("editar_tarefa", { tarefa: tf.id, titulo: tf.titulo, responsavel: tf.responsavel, responsavel_agente: tf.responsavel_agente, prazo: tf.prazo, estado: "cancelada" });
    if (error) recado(msgErro(error));
  };

  const reabrir = async (tf: Tarefa) => {
    setDesfazer(null);
    const { error } = await sb.rpc("editar_tarefa", { tarefa: tf.id, titulo: tf.titulo, responsavel: tf.responsavel, responsavel_agente: tf.responsavel_agente, prazo: tf.prazo, estado: "aberta", reabrir: true });
    if (error) recado(msgErro(error));
  };

  return (
    <aside className="painel" aria-label={t("Tarefas da sala", "Room tasks")}>
      <header className="painel-topo">
        <h2>{t("Tarefas", "Tasks")}</h2>
        <div className="painel-topo-acoes">
          {!nova && <button className="btn btn-pequeno" onClick={() => { setNova(true); setEditando(null); }}><IconeMais tamanho={16} /> {t("Nova", "New")}</button>}
          <button className="btn-icone" onClick={fechar} aria-label={t("Fechar tarefas", "Close tasks")}><IconeFechar /></button>
        </div>
      </header>

      <div className="painel-filtro">
        <form className="tarefa-rapida" onSubmit={async (e) => {
          e.preventDefault();
          const titulo = rapida.trim();
          if (!titulo) return;
          setRapida("");
          const r = await criar(titulo, valorResp(eu, null), "", "");
          if (r) { setRapida(titulo); recado(r); }
        }}>
          <IconeMais tamanho={16} />
          <label className="sr" htmlFor="tarefa-rapida">{t("Adicionar tarefa", "Add a task")}</label>
          <input id="tarefa-rapida" value={rapida} maxLength={200} onChange={(e) => setRapida(e.target.value)}
            placeholder={t("Adicionar tarefa para você… (Enter)", "Add a task for yourself… (Enter)")} />
        </form>
        <div className="abas abas-mini" ref={indicador} role="tablist" aria-label={t("Filtrar", "Filter")}>
          <button role="tab" aria-selected={so === "todas"} className={so === "todas" ? "aba ativa" : "aba"} onClick={() => setSo("todas")}>{t("Todas", "All")}</button>
          <button role="tab" aria-selected={so === "minhas"} className={so === "minhas" ? "aba ativa" : "aba"} onClick={() => setSo("minhas")}>
            {t("Comigo", "Mine")}{minhasAbertas > 0 && <span className="aba-num">{minhasAbertas}</span>}
          </button>
        </div>
      </div>

      {nova && (
        <section className="painel-secao">
          <Formulario key={rascunho?.origem ?? "nova"} membros={membros} agentes={agentes} nome={nome} botao={t("Criar tarefa", "Create task")} frentes={frentes}
            inicial={{ titulo: rascunho?.titulo ?? "", responsavel: rascunho?.responsavel ?? valorResp(eu, null), prazo: rascunho?.prazo ?? "", frente: "" }}
            salvar={criar} cancelar={() => { setNova(false); limparRascunho(); }} />
        </section>
      )}

      {tarefas === null && <div className="painel-secao"><div className="esqueleto" /><div className="esqueleto" /></div>}

      {tarefas && !abertas.length && !nova && (
        <section className="painel-secao painel-vazio">
          <span className="vazio-icone"><Marcador feito tamanho={22} /></span>
          <p><strong>{so === "minhas" ? t("Nada com você agora.", "Nothing assigned to you right now.") : feitas.length ? t("Tudo feito por aqui.", "All done here.") : t("Nenhuma tarefa ainda.", "No tasks yet.")}</strong></p>
          <p className="nota">{t("Proposta aprovada vira tarefa de quem propôs. Qualquer mensagem também vira tarefa, pelo botão na própria mensagem.", "An approved proposal becomes a task for the person who proposed it. You can also turn any message into a task with the button on the message.")}</p>
        </section>
      )}

      {abertas.length > 0 && (
        <section className="painel-lista">
          <h3 className="secao-rotulo">{t("A fazer", "To do")} <span>{abertas.length}</span></h3>
          <ul className="tarefas">
            {abertas.map((tf) => {
              const saindo = marcando.has(tf.id);
              return (
                <li key={tf.id} className={`tarefa ${atrasada(tf) ? "tarefa-atrasada" : ""} ${saindo ? "tarefa-saindo" : ""}`}>
                  {editando === tf.id ? (
                    <Formulario membros={membros} agentes={agentes} nome={nome} botao={t("Salvar", "Save")} frentes={frentes}
                      inicial={{ titulo: tf.titulo, responsavel: valorResp(tf.responsavel, tf.responsavel_agente), prazo: paraInput(tf.prazo), frente: tf.frente ?? "" }}
                      salvar={salvar(tf)} cancelar={() => setEditando(null)} />
                  ) : (
                    <>
                      <button className="tarefa-check" onClick={() => !saindo && marcar(tf)} disabled={saindo}
                        aria-label={t(`Marcar como feita: ${tf.titulo}`, `Mark as done: ${tf.titulo}`)} title={t("Marcar como feita", "Mark as done")}>
                        <Marcador feito={saindo} />
                      </button>
                      <div className="tarefa-corpo">
                        <p className="tarefa-titulo">{tf.titulo}</p>
                        <div className="tarefa-meta">
                          <Resp nome={quemNome(tf)} agente={!!tf.responsavel_agente} eu={minha(tf) && !tf.responsavel_agente} />
                          <Prazo tf={tf} />
                          {tf.frente && <span className="pilula">{tf.frente}</span>}
                          {copiouPedido === tf.id && <span className="nota">{t("Pedido copiado. Cole no seu agente.", "Request copied. Paste it into your agent.")}</span>}
                          {tf.prazo_previsto && tf.prazo && new Date(tf.prazo).toDateString() !== new Date(tf.prazo_previsto).toDateString() && (
                            <span className="nota" title={t("Prazo do plano aprovado", "Due date in the approved plan")}>{t(`previsto ${prazoCurto(tf.prazo_previsto)}`, `planned ${prazoCurto(tf.prazo_previsto)}`)}</span>
                          )}
                        </div>
                        {concluindo === tf.id && (
                          <form className="tarefa-form" onSubmit={(e) => { e.preventDefault(); concluir(tf); }}>
                            <label className="sr" htmlFor={`res${tf.id}`}>{t("Resultado", "Result")}</label>
                            <input id={`res${tf.id}`} autoFocus value={resultado} maxLength={4000} placeholder={t("O que foi entregue? Link, número…", "What was delivered? Link, number…")}
                              onChange={(e) => setResultado(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setConcluindo(null)} />
                            <div className="linha">
                              <button className="btn btn-pequeno btn-cheio">{t("Concluir", "Complete")}</button>
                              <button type="button" className="btn btn-pequeno btn-texto" onClick={() => setConcluindo(null)}>{t("Cancelar", "Cancel")}</button>
                            </div>
                          </form>
                        )}
                      </div>
                      <Menu rotulo={t(`Ações da tarefa ${tf.titulo}`, `Actions for task ${tf.titulo}`)} itens={[
                        tf.origem != null && { rotulo: t("Ver na conversa", "View in chat"), acao: () => irPara(tf.origem!) },
                        ...meusAgentes.map((a) => ({ rotulo: t(`Pedir ao ${a.nome}`, `Ask ${a.nome}`), acao: () => pedirAoAgente(tf, a.nome) })),
                        { rotulo: t("Concluir com resultado…", "Complete with result…"), acao: () => { setConcluindo(tf.id); setResultado(""); setEditando(null); } },
                        { rotulo: t("Editar", "Edit"), acao: () => { setEditando(tf.id); setNova(false); setConcluindo(null); } },
                        { rotulo: t("Cancelar tarefa", "Cancel task"), acao: () => cancelarTarefa(tf), perigo: true, confirmar: t("Ela sai da lista.", "It will be removed from the list.") },
                      ]} />
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {feitas.length > 0 && (
        <section className="painel-lista">
          <button className="secao-rotulo secao-dobra" aria-expanded={verFeitas} onClick={() => setVerFeitas((v) => !v)}>
            <IconeVoltar tamanho={14} /> {t("Feitas", "Done")} <span>{feitas.length}</span>
          </button>
          {verFeitas && (
            <ul className="tarefas">
              {feitas.map((tf) => (
                <li key={tf.id} className="tarefa tarefa-feita">
                  <span className="tarefa-check" aria-hidden><Marcador feito /></span>
                  <div className="tarefa-corpo">
                    <p className="tarefa-titulo">{tf.titulo}</p>
                    <div className="tarefa-meta">
                      <span className="nota">
                        {tf.concluida_por_agente ? t(`${tf.concluida_por_agente} de ${primeiro(tf.concluida_por)}`, `${primeiro(tf.concluida_por)}'s ${tf.concluida_por_agente}`) : tf.concluida_por === eu ? t("Você", "You") : nome(tf.concluida_por)}
                        {tf.concluida_em && ` · ${prazoCurto(tf.concluida_em)}`}
                      </span>
                    </div>
                    {tf.resultado && <span className="tarefa-resultado">{tf.resultado}</span>}
                  </div>
                  <Menu rotulo={t(`Ações da tarefa ${tf.titulo}`, `Actions for task ${tf.titulo}`)} itens={[
                    tf.origem != null && { rotulo: t("Ver na conversa", "View in chat"), acao: () => irPara(tf.origem!) },
                    { rotulo: t("Reabrir", "Reopen"), acao: () => reabrir(tf) },
                  ]} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {desfazer && (
        <div className="desfazer" role="status">
          <Marcador feito tamanho={16} />
          <span>{t("Tarefa feita", "Task completed")}</span>
          <button className="link" onClick={() => reabrir(desfazer)}>{t("Desfazer", "Undo")}</button>
        </div>
      )}
    </aside>
  );
}
