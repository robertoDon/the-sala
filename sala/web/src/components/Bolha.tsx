import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { fotoSegura, tomDoAgente, type Mensagem } from "../supabase";
import { IconeAgente, IconeJoinha, IconeReagir, IconeCopiar, IconeCheck, IconeDecisao, IconeFechar, IconeLapis, IconeLixo, IconeProposta, IconeRecusa, IconeResponder, IconeTarefa } from "./Icones";
import { Texto } from "./Texto";
import { Anexos } from "./Anexos";
import { naConversa, locale, t as tr } from "../i18n";
import { BotaoConfirmar } from "./Confirmar";

export type Citacao = { id: number; autor: string; texto: string } | null;
export type GrupoReacao = { emoji: string; quem: string[]; minha: boolean };
// indicados: a proposta disse quem decide; posso: eu estou entre quem pode decidir
export type Aprovacao = { precisa: number; quem: string[]; euAprovei: boolean; faltam: string[]; indicados?: string[] | null; posso?: boolean };

const ou = (xs: string[], palavra = "ou") => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${palavra} ${xs[xs.length - 1]}`);
const lista = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${tr("e", "and")} ${xs[xs.length - 1]}`);

// "1 de 2 aprovações · Roberto aprovou · falta David", com um marcador por aprovação
export function LinhaAprovacao({ a }: { a: Aprovacao }) {
  return (
    <p className="aprovacoes">
      <span className="aprovacoes-pontos" aria-hidden>{Array.from({ length: a.precisa }, (_, i) => <span key={i} className={i < a.quem.length ? "cheio" : ""} />)}</span>
      <span><strong>{a.indicados?.length
          ? a.precisa < a.indicados.length
            ? tr(`${a.precisa} de: ${ou(a.indicados)}`, `${a.precisa} of: ${ou(a.indicados, "or")}`)
            : tr(`${a.indicados.length > 1 ? "Decidem" : "Decide"}: ${lista(a.indicados)}`, `${a.indicados.length > 1 ? "Approvers" : "Approver"}: ${lista(a.indicados)}`)
          : tr(`${a.quem.length} de ${a.precisa} aprovações`, `${a.quem.length} of ${a.precisa} approvals`)}</strong>
        {a.quem.length > 0 && <> · {lista(a.quem)} {a.quem.length > 1 ? tr("aprovaram", "approved") : tr("aprovou", "approved")}</>}
        {a.faltam.length > 0 && a.quem.length < a.precisa && (a.faltam.length <= a.precisa - a.quem.length
          ? <> · {tr(`falta ${lista(a.faltam)}`, `waiting for ${lista(a.faltam)}`)}</>
          : <> · {tr(`falta mais ${a.precisa - a.quem.length}`, `${a.precisa - a.quem.length} more needed`)}</>)}
      </span>
    </p>
  );
}
export const EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "✅", "🙏", "🔥"];

type Props = {
  m: Pick<Mensagem, "id" | "agente" | "texto" | "tipo" | "estado" | "apagada" | "editada_em" | "decidida_em"> & Partial<Mensagem>;
  nome: string;
  quando: string;
  quandoCompleto?: string;
  minha?: boolean;
  continua?: boolean; // mesma autoria da anterior: esconde o cabeçalho
  citacao?: Citacao;
  decisor?: string;
  destaque?: boolean;
  chamaMim?: (mencao: string) => boolean;
  // ações (sem elas, a bolha é só vitrine)
  responder?: () => void;
  copiar?: () => Promise<boolean>;
  editar?: (texto: string) => Promise<string | null>; // devolve erro ou null
  apagar?: () => void;
  virarTarefa?: () => void;
  decidir?: (aprovar: boolean | "ajuste", nota?: string) => Promise<string | null>;
  tentarDeNovo?: () => void;
  irPara?: (id: number) => void;
  reacoes?: GrupoReacao[];
  reagir?: (emoji: string) => void;
  autorDe?: (id: number) => string | null; // para "#142" virar "mensagem de David"
  aprovacao?: Aprovacao | null; // sala que pede mais de uma aprovação
  tarefaDe?: (id: number) => string | null; // "#12" de uma tarefa desta sala vira o título dela
  nomeDe?: (uid: string | null) => string; // responsáveis dos itens de um plano
  abrirTarefas?: () => void;
  avatar?: string | null; // foto da pessoa (agente usa sempre o anel)
  papelAgente?: string | null; // o que o agente faz aqui, em uma linha (Quem é quem)
  tempo?: string; // quanto o agente levou para responder à pergunta ("40 s")
  // resposta de agente: 👍 / 👎 viram reação (o agente lê); "o que faltou" vira resposta que chama o agente
  avaliar?: { dono: string; corrigir: (nota: string) => void };
  fila?: { ate: string; agora: () => void }; // mensagem segurada enquanto um agente lê a sala
};

const areaDaConversa = (el: HTMLElement) => (el.closest(".feed") ?? document.documentElement).getBoundingClientRect();

// o que abre por cima da conversa (seletor de emoji, barra de ações no toque) fica dentro dela:
// se passar de um lado, desliza para dentro (senão some da tela ou a conversa rola para o lado)
function caberNaConversa(el: HTMLElement) {
  el.style.translate = "";
  const area = areaDaConversa(el);
  const r = el.getBoundingClientRect();
  const folga = 8;
  const dx = r.left < area.left + folga ? area.left + folga - r.left : r.right > area.right - folga ? area.right - folga - r.right : 0;
  if (dx) el.style.translate = `${Math.round(dx)}px 0`;
}

// seletor rápido de emojis: abre acima do botão (abaixo, se não couber), fecha com Esc ou clique fora
function Seletor({ escolher, fechar }: { escolher: (e: string) => void; fechar: () => void }) {
  const caixa = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    if (el.getBoundingClientRect().top < areaDaConversa(el).top + 8) el.classList.add("seletor-abaixo");
    caberNaConversa(el);
  }, []);
  useEffect(() => {
    caixa.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    // o próprio botão de reagir fica de fora: ele mesmo abre e fecha
    const fora = (e: PointerEvent) => { if (!caixa.current?.parentElement?.contains(e.target as Node)) fechar(); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); fechar(); } };
    document.addEventListener("pointerdown", fora, true);
    document.addEventListener("keydown", tecla, true);
    return () => { document.removeEventListener("pointerdown", fora, true); document.removeEventListener("keydown", tecla, true); };
  }, [fechar]);
  return (
    <div className="seletor-emoji" ref={caixa} role="menu" aria-label={tr("Reagir", "React")}>
      {EMOJIS.map((e) => (
        <button key={e} type="button" role="menuitem" onClick={() => { escolher(e); fechar(); }} aria-label={tr(`Reagir com ${e}`, `React with ${e}`)}>{e}</button>
      ))}
    </div>
  );
}

const hora = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }) : "");

// Pessoa: caixa suave (a minha à direita). Agente: sem caixa, como documento, com o anel + "Claude de Ana".
// Proposta: cartão com Aprovar e Recusar. Estado nunca só por cor: sempre ícone e texto.
export function Bolha(p: Props) {
  const { m, nome, minha, continua, citacao } = p;
  const proposta = m.tipo === "proposta" && !m.apagada;
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(m.texto);
  const [erro, setErro] = useState("");
  const [recusando, setRecusando] = useState(false);
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [escolhendo, setEscolhendo] = useState(false);
  const [faltou, setFaltou] = useState<string | null>(null); // nota do 👎 sendo escrita
  const fecharSeletor = useCallback(() => setEscolhendo(false), []);
  const caixa = useRef<HTMLTextAreaElement>(null);
  // proposta decidida enquanto a pessoa olha: o próprio cartão confirma (não um aviso solto em outro canto)
  const estadoAntes = useRef(m.estado);
  const [decidiuAgora, setDecidiuAgora] = useState(false);
  useEffect(() => {
    if (estadoAntes.current === "pendente" && (m.estado === "aprovada" || m.estado === "recusada")) setDecidiuAgora(true);
    estadoAntes.current = m.estado;
  }, [m.estado]);
  // no toque a barra de ações abre por cima do texto quando algo da mensagem ganha foco
  const barra = useRef<HTMLDivElement>(null);
  const ajustarBarra = () => { const b = barra.current; if (b && getComputedStyle(b).position === "absolute") caberNaConversa(b); };

  useEffect(() => {
    if (editando && caixa.current) {
      const c = caixa.current;
      c.focus(); c.setSelectionRange(c.value.length, c.value.length);
      c.style.height = "auto"; c.style.height = `${c.scrollHeight}px`;
    }
  }, [editando]);

  const temAcoes = !m.apagada && !m.pendente && !m.falhou && !m.fila && (p.responder || p.copiar || p.editar || p.apagar || p.virarTarefa || p.reagir);
  const avaliacao = p.avaliar && !proposta && !m.apagada && !!p.reagir;
  const minhaReacao = (e: string) => !!p.reacoes?.some((r) => r.emoji === e && r.minha);

  const salvar = async () => {
    const t = rascunho.trim();
    if (!t || t === m.texto) { setEditando(false); return; }
    setOcupado(true);
    const e = await p.editar!(t);
    setOcupado(false);
    if (e) setErro(e); else { setEditando(false); setErro(""); }
  };

  const decidir = async (aprovar: boolean | "ajuste") => {
    if (aprovar === "ajuste" && !nota.trim()) { setErro(tr("Diga o que precisa mudar.", "Describe what needs to change.")); return; }
    setOcupado(true);
    const e = await p.decidir!(aprovar, aprovar === true ? undefined : nota.trim() || undefined);
    setOcupado(false);
    if (e) setErro(e); else { setRecusando(false); setErro(""); }
  };

  // texto que o sistema gravou (decisão, tarefa concluída, mensagem apagada) aparece no idioma da sala; o que alguém escreveu fica como foi escrito
  const sistema = m.tipo === "decisao" || m.apagada || m.texto.startsWith("✓ ");
  const cls = ["msg", m.agente ? "msg-agente" : "msg-pessoa", minha ? "msg-minha" : "", m.pendente ? "msg-pendente" : "",
    m.falhou ? "msg-falhou" : "", m.fila ? "msg-na-fila" : "", continua && !proposta ? "msg-continua" : "", proposta ? "msg-proposta" : "",
    m.apagada ? "msg-apagada" : "", p.destaque ? "msg-destaque" : "", decidiuAgora ? "msg-decidiu" : ""].join(" ");

  return (
    <article className={cls} id={`m${m.id}`} tabIndex={-1} onFocus={ajustarBarra} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) barra.current?.style.removeProperty("translate"); }}>
      {(!continua || proposta) && (
        <header className="msg-meta">
          {m.agente ? (
            <>
              <span className={`msg-avatar msg-avatar-agente ${tomDoAgente(m.agente)}`} aria-hidden><IconeAgente tamanho={13} /></span>
              <strong className="msg-selo" title={p.papelAgente ?? undefined}>{m.agente}</strong>
              <span className="msg-de" title={tr(`Agente de ${nome}`, `${nome}'s agent`)}>· {nome}</span>
            </>
          ) : minha ? (
            <strong>{tr("Você", "You")}</strong>
          ) : (
            <>
              <span className="msg-avatar" aria-hidden>{fotoSegura(p.avatar) ? <img src={fotoSegura(p.avatar)!} alt="" referrerPolicy="no-referrer" /> : (nome.trim()[0] ?? "?").toUpperCase()}</span>
              <strong>{nome}</strong>
            </>
          )}
          {p.quando && <time title={p.quandoCompleto}>{p.quando}</time>}
          {p.tempo && <span className="msg-de msg-tempo" title={tr("Tempo entre a pergunta e a resposta", "Time between the question and the answer")}>· {tr(`respondeu em ${p.tempo}`, `answered in ${p.tempo}`)}</span>}
          {m.editada_em && !m.apagada && <span className="msg-de" title={tr(`Editada às ${hora(m.editada_em)}`, `Edited at ${hora(m.editada_em)}`)}>· {tr("editada", "edited")}</span>}
        </header>
      )}

      <div className="msg-linha">
        <div className="msg-corpo">
          {proposta && (
            <p className="proposta-rotulo">
              {m.estado === "pendente" ? <span className="pilula pilula-acento"><IconeProposta tamanho={12} /> {tr("Proposta", "Proposal")}</span>
                : m.estado === "ajuste" ? <span className="pilula pilula-ajuste"><IconeLapis tamanho={12} /> {tr("Em ajuste", "Changes requested")}</span>
                : m.estado === "substituida" ? <span className="pilula"><IconeProposta tamanho={12} /> {tr("Substituída", "Replaced")}</span>
                : <span className={`pilula ${m.estado === "aprovada" ? "pilula-ok" : "pilula-erro"}`}>{m.estado === "aprovada" ? <IconeCheck tamanho={12} /> : <IconeFechar tamanho={12} />}{m.estado === "aprovada" ? tr("Aprovada", "Approved") : tr("Recusada", "Declined")}</span>}
              {m.estado === "substituida" && m.substituida_por && <button type="button" className="link nota" onClick={() => p.irPara?.(m.substituida_por!)}>{tr("ver a versão nova", "view the new version")}</button>}
              {m.estado === "ajuste" && <span className="nota">· {tr("quem propôs vai corrigir e reenviar", "the proposer will revise and resend it")}</span>}
              {m.novo_contexto && <span className="nota">{tr("troca as instruções da sala", "replaces the room instructions")}</span>}
              {m.estado === "pendente" && <span className="nota">· {tr("aguardando decisão", "awaiting decision")}</span>}
            </p>
          )}
          {citacao && (
            <button type="button" className="citacao" onClick={() => p.irPara?.(citacao.id)} title={tr("Ir para a mensagem", "Go to message")}>
              <IconeResponder tamanho={14} /> <strong>{citacao.autor}</strong> <span>{citacao.texto}</span>
            </button>
          )}
          {editando ? (
            <div className="editar">
              <label className="sr" htmlFor={`ed${m.id}`}>{tr("Editar mensagem", "Edit message")}</label>
              <textarea id={`ed${m.id}`} ref={caixa} value={rascunho} maxLength={20000}
                onChange={(e) => { setRascunho(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px`; }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { e.preventDefault(); setEditando(false); setRascunho(m.texto); }
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); salvar(); }
                }} />
              <div className="linha">
                <button type="button" className="btn btn-pequeno btn-cheio" disabled={ocupado} onClick={salvar}>{tr("Salvar", "Save")}</button>
                <button type="button" className="btn btn-pequeno" onClick={() => { setEditando(false); setRascunho(m.texto); }}>{tr("Cancelar", "Cancel")}</button>
                <span className="nota">{tr("Enter salva · Esc cancela", "Enter to save · Esc to cancel")}</span>
              </div>
            </div>
          ) : m.apagada ? (
            <p className="apagada">{tr("Mensagem apagada.", "Message deleted.")}</p>
          ) : (
            <>
              {m.texto && <Texto texto={sistema ? naConversa(m.texto) : m.texto} chamaMim={p.chamaMim ?? (() => false)} refMsg={p.irPara && p.autorDe ? {
                ir: (id) => (p.autorDe?.(id) ? p.irPara!(id) : p.abrirTarefas?.()),
                rotulo: (id) => { const a = p.autorDe?.(id); if (a) return `↩ ${a}`; const tf = p.tarefaDe?.(id); return tf ? `☐ ${tf.length > 48 ? tf.slice(0, 47) + "…" : tf}` : null; },
              } : undefined} />}
              {!!m.anexos?.length && <Anexos anexos={m.anexos} />}
              {proposta && !!m.plano?.length && (
                <details className="plano" open={m.estado === "pendente"}>
                  <summary>{tr(`Plano: ${m.plano.length} ${m.plano.length === 1 ? "tarefa" : "tarefas"}`, `Plan: ${m.plano.length} ${m.plano.length === 1 ? "task" : "tasks"}`)}</summary>
                  <ol>
                    {m.plano.map((i, k) => (
                      <li key={k}>
                        {i.frente && <span className="pilula">{i.frente}</span>}
                        <span>{i.titulo}</span>
                        <span className="nota">
                          {i.responsavel ? (i.responsavel_agente ? tr(`${i.responsavel_agente} de ${(p.nomeDe?.(i.responsavel) ?? "?").split(" ")[0]}`, `${(p.nomeDe?.(i.responsavel) ?? "?").split(" ")[0]}'s ${i.responsavel_agente}`) : p.nomeDe?.(i.responsavel) ?? "?") : tr("sem responsável", "unassigned")}
                          {i.prazo && ` · ${new Date(i.prazo).toLocaleDateString(locale(), { day: "numeric", month: "short" }).replace(".", "")}`}
                          {i.tarefa ? tr(" · replaneja uma tarefa", " · replans a task") : ""}
                        </span>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
              {proposta && m.novo_contexto && (
                <details className="contexto-novo">
                  <summary>{m.estado === "aprovada" ? tr("Ver as instruções aplicadas", "View applied instructions") : tr("Ver as instruções propostas", "View proposed instructions")}</summary>
                  <pre>{m.novo_contexto}</pre>
                </details>
              )}
            </>
          )}

          {proposta && (m.estado !== "pendente" || p.decidir || p.aprovacao) && (
            <div className="proposta-pe">
              {m.estado === "pendente" ? (
                p.decidir && p.aprovacao?.posso !== false ? (
                  recusando ? (
                    <form className="recusar" onSubmit={(e) => { e.preventDefault(); decidir("ajuste"); }}>
                      <label className="sr" htmlFor={`nota${m.id}`}>{tr("O que precisa mudar", "What needs to change")}</label>
                      <input id={`nota${m.id}`} autoFocus placeholder={tr("O que precisa mudar? Quem propôs lê isto.", "What needs to change? The proposer will see this.")} value={nota} maxLength={2000}
                        onChange={(e) => { setNota(e.target.value); setErro(""); }} onKeyDown={(e) => e.key === "Escape" && setRecusando(false)} />
                      <div className="decidir">
                        <button type="button" className="btn" onClick={() => setRecusando(false)}>{tr("Voltar", "Back")}</button>
                        <button className="btn btn-cheio" disabled={ocupado}>{tr("Pedir ajuste", "Request changes")}</button>
                      </div>
                      <button type="button" className="link-texto recusar-de-vez" disabled={ocupado} onClick={() => decidir(false)}>{tr("Recusar de vez", "Decline for good")}</button>
                    </form>
                  ) : (
                    <>
                      {p.aprovacao && <LinhaAprovacao a={p.aprovacao} />}
                      <div className="decidir">
                        <button type="button" className="btn" disabled={ocupado} onClick={() => { setRecusando(true); setErro(""); }}>{tr("Ajustar ou recusar", "Request changes or decline")}</button>
                        {p.aprovacao?.euAprovei
                          ? <button type="button" className="btn btn-aprovei" disabled><IconeCheck tamanho={14} /> {tr("Você aprovou", "You approved")}</button>
                          : <button type="button" className="btn btn-cheio" disabled={ocupado} onClick={() => decidir(true)}>{tr("Aprovar", "Approve")}</button>}
                      </div>
                    </>
                  )
                ) : p.aprovacao ? <LinhaAprovacao a={p.aprovacao} /> : null
              ) : (
                <p className="nota">
                  {p.decisor ? tr(`Decidida por ${p.decisor}`, `Decided by ${p.decisor}`) : tr("Decidida", "Decided")}
                  {m.decidida_em && ` · ${hora(m.decidida_em)}`}
                  {decidiuAgora && ` · ${tr("os agentes da sala já sabem", "the room's agents have been told")}`}
                </p>
              )}
            </div>
          )}
        </div>

        {temAcoes && !editando && (
          <div className="msg-acoes" role="toolbar" aria-label={tr("Ações da mensagem", "Message actions")}>
            <div className="msg-acoes-barra" ref={barra}>
            {p.reagir && (
              <span className="reagir-ancora">
                <button type="button" className="btn-acao" onClick={() => setEscolhendo((v) => !v)} aria-expanded={escolhendo} aria-haspopup="menu"
                  title={tr("Reagir", "React")} aria-label={tr("Reagir", "React")}><IconeReagir tamanho={16} /></button>
                {escolhendo && <Seletor escolher={p.reagir} fechar={fecharSeletor} />}
              </span>
            )}
            {avaliacao && <>
              <button type="button" className={`btn-acao ${minhaReacao("👍") ? "btn-acao-ligado" : ""}`} aria-pressed={minhaReacao("👍")} onClick={() => p.reagir!("👍")}
                title={tr(`Boa resposta (${m.agente} e ${p.avaliar!.dono} veem)`, `Good answer (${m.agente} and ${p.avaliar!.dono} can see it)`)} aria-label={tr("Boa resposta", "Good answer")}><IconeJoinha tamanho={16} /></button>
              <button type="button" className={`btn-acao ${minhaReacao("👎") ? "btn-acao-ligado" : ""}`} aria-pressed={minhaReacao("👎")}
                onClick={() => { if (!minhaReacao("👎")) p.reagir!("👎"); setFaltou(""); }}
                title={tr("Não ajudou: diga o que faltou", "Not helpful: say what was missing")} aria-label={tr("Não ajudou", "Not helpful")}><IconeJoinha tamanho={16} baixo /></button>
            </>}
            {p.responder && <button type="button" className="btn-acao" onClick={p.responder} title={tr("Responder", "Reply")} aria-label={tr("Responder", "Reply")}><IconeResponder tamanho={16} /></button>}
            {p.copiar && (
              <button type="button" className="btn-acao" title={copiado ? tr("Copiado", "Copied") : tr("Copiar texto", "Copy text")} aria-label={tr("Copiar texto", "Copy text")}
                onClick={async () => { if (await p.copiar!()) { setCopiado(true); setTimeout(() => setCopiado(false), 1200); } }}>
                {copiado ? <IconeDecisao tamanho={16} /> : <IconeCopiar tamanho={16} />}
              </button>
            )}
            {p.virarTarefa && <button type="button" className="btn-acao" onClick={p.virarTarefa} title={tr("Virar tarefa", "Turn into a task")} aria-label={tr("Virar tarefa", "Turn into a task")}><IconeTarefa tamanho={16} /></button>}
            {p.editar && <button type="button" className="btn-acao" onClick={() => { setRascunho(m.texto); setEditando(true); }} title={tr("Editar", "Edit")} aria-label={tr("Editar", "Edit")}><IconeLapis tamanho={16} /></button>}
            {p.apagar && <BotaoConfirmar className="btn-acao" titulo={tr("Apagar", "Delete")} confirmar={tr("Apagar", "Delete")} aviso={tr("O texto some para todos, pessoas e agentes.", "It will be removed for everyone, people and agents alike.")} onConfirmar={p.apagar}><IconeLixo tamanho={16} /></BotaoConfirmar>}
            </div>
          </div>
        )}
      </div>

      {!!p.reacoes?.length && !m.apagada && (
        <div className="reacoes" aria-label={tr("Reações", "Reactions")}>
          {p.reacoes.map((r) => (
            <button key={r.emoji} type="button" className={`reacao ${r.minha ? "reacao-minha" : ""}`} disabled={!p.reagir}
              onClick={() => p.reagir?.(r.emoji)} aria-pressed={r.minha} title={r.quem.join(", ")}
              aria-label={`${r.emoji} ${r.quem.length}: ${r.quem.join(", ")}`}>
              <span aria-hidden>{r.emoji}</span> {r.quem.length}
            </button>
          ))}
        </div>
      )}
      {faltou !== null && p.avaliar && (
        <form className="faltou" onSubmit={(e) => { e.preventDefault(); if (faltou.trim()) { p.avaliar!.corrigir(faltou.trim()); setFaltou(null); } }}>
          <label className="sr" htmlFor={`faltou${m.id}`}>{tr("O que faltou", "What was missing")}</label>
          <input id={`faltou${m.id}`} autoFocus value={faltou} maxLength={2000} onChange={(e) => setFaltou(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setFaltou(null)}
            placeholder={tr(`O que faltou? O ${m.agente} lê e corrige.`, `What was missing? ${m.agente} will read it and fix it.`)} />
          <button className="btn btn-pequeno btn-cheio" disabled={!faltou.trim()}>{tr("Pedir correção", "Ask for a fix")}</button>
          <button type="button" className="btn btn-pequeno btn-texto" onClick={() => setFaltou(null)}>{tr("Só o 👎", "Just the 👎")}</button>
        </form>
      )}
      {m.fila && p.fila && (
        <p className="msg-fila" role="status">
          <span><span className="msg-fila-ponto" aria-hidden />{tr(`Na fila: sai quando ${p.fila.ate} terminar de ler a sala.`, `Queued: it goes out once ${p.fila.ate} finishes reading the room.`)}</span>
          <button type="button" className="link" onClick={p.fila.agora}>{tr("Mandar agora", "Send now")}</button>
        </p>
      )}
      {erro && <p className="msg-erro" role="alert">{erro}</p>}
      {m.falhou && (
        <p className="msg-erro" role="alert">
          {m.motivo ? tr(`Não enviou: ${m.motivo}`, `Couldn't send: ${m.motivo}`) : tr("Não enviou.", "Couldn't send.")} <button type="button" className="link" onClick={p.tentarDeNovo}>{tr("Tentar de novo", "Try again")}</button>
        </p>
      )}
    </article>
  );
}

// Decisão vira um acontecimento na linha do tempo: "Bruno aprovou a proposta de ChatGPT de Bruno".
export function Evento({ m, quem, de, quando, irPara }: { m: Mensagem; quem: string; de: string; quando: string; irPara?: (id: number) => void }) {
  const aprovou = m.estado === "aprovada";
  const ajuste = m.estado === "ajuste";
  const nota = m.texto !== "Aprovada." && m.texto !== "Recusada." ? naConversa(m.texto) : "";
  return (
    <div className={`evento evento-${m.estado}`} id={`m${m.id}`}>
      <span className="evento-icone" aria-hidden>{aprovou ? <IconeDecisao tamanho={16} /> : ajuste ? <IconeLapis tamanho={16} /> : <IconeRecusa tamanho={16} />}</span>
      <span className="evento-texto">
        <strong>{quem}</strong> {aprovou ? tr("aprovou", "approved") : ajuste ? tr("pediu ajuste", "asked for changes to") : tr("recusou", "declined")}{" "}
        <button type="button" className="link" onClick={() => m.responde_a && irPara?.(m.responde_a)}>{ajuste ? (de ? tr(`na proposta de ${de}`, `${de}'s proposal`) : tr("na proposta", "the proposal")) : de ? tr(`a proposta de ${de}`, `${de}'s proposal`) : tr("a proposta", "the proposal")}</button>
        {nota && <span className="evento-nota">“{nota}”</span>}
      </span>
      <time>{quando}</time>
    </div>
  );
}

// "✓ Concluí a tarefa: **Título**\n\nresultado" (texto que o servidor grava) vira uma linha na conversa, como uma decisão
export function tarefaFeita(texto: string): { titulo: string; resultado: string } | null {
  const m = texto.match(/^✓ (?:Concluí a tarefa|Completed the task): \*\*(.+?)\*\*\s*([\s\S]*)$/);
  if (!m) return null;
  return { titulo: m[1].trim(), resultado: m[2].replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim() };
}

export function EventoTarefa({ id, quem, titulo, resultado, quando, abrir }: { id: number; quem: string; titulo: string; resultado: string; quando: string; abrir?: () => void }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="evento evento-tarefa" id={`m${id}`}>
      <span className="evento-icone" aria-hidden><IconeTarefa tamanho={16} /></span>
      <span className="evento-texto">
        <strong>{quem}</strong> {tr("concluiu", "completed")}{" "}
        <button type="button" className="link" onClick={abrir}>{titulo}</button>
        {resultado && (
          <button type="button" className={`evento-nota evento-resultado ${aberto ? "aberto" : ""}`} onClick={() => setAberto((a) => !a)}
            aria-expanded={aberto} title={aberto ? tr("Mostrar menos", "Show less") : tr("Mostrar tudo", "Show all")}>{resultado}</button>
        )}
      </span>
      <time>{quando}</time>
    </div>
  );
}
