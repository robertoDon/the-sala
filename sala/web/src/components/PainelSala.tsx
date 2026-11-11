import { useEffect, useState } from "react";
import { sb, type DadosPainel, type Tarefa } from "../supabase";
import { IconeFechar, SimboloVivo } from "./Icones";
import { locale, t } from "../i18n";

type Props = {
  salaId: string;
  eu: string;
  versao: number; // muda quando chega proposta, decisão ou voto
  tarefas: Tarefa[] | null; // muda quando uma tarefa muda
  irPara: (id: number) => void;
  abrirTarefas: () => void;
  abrirDecisoes: () => void;
  fechar: () => void;
};

const diasDesde = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 864e5));
const diaMes = (iso: string) => new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short" }).replace(".", "");
const semana = (dia: string) => new Date(`${dia}T12:00:00`).toLocaleDateString(locale(), { day: "numeric", month: "numeric" });
const lista = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${t("e", "and")} ${xs[xs.length - 1]}`);

// Painel da sala: só lê. Os números vêm do banco (painel_sala), os mesmos que os agentes leem em ver_painel.
export function PainelSala({ salaId, eu, versao, tarefas, irPara, abrirTarefas, abrirDecisoes, fechar }: Props) {
  const [d, setD] = useState<DadosPainel | null>(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let vivo = true;
    const id = window.setTimeout(() => {
      sb.rpc("painel_sala", { sala: salaId }).then(({ data, error }) => {
        if (!vivo) return;
        if (error) { setFalhou(true); return; }
        setFalhou(false); setD(data as DadosPainel);
      });
    }, d ? 300 : 0); // mudanças em sequência viram uma leitura só
    return () => { vivo = false; window.clearTimeout(id); };
  }, [salaId, versao, tarefas]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [fechar]);

  const nome = (u: string | null) => (u === eu ? t("você", "you") : (u && d?.nomes[u]?.split(" ")[0]) || "?");
  const quem = (r: string | null, ag: string | null) => (!r ? t("sem responsável", "unassigned")
    : ag ? (r === eu ? t(`seu ${ag}`, `your ${ag}`) : t(`${ag} de ${nome(r)}`, `${nome(r)}'s ${ag}`)) : nome(r));

  const vazio = d && !d.totais.abertas && !d.totais.feitas && !d.propostas.length;
  const qualquer = d?.propostas.filter((p) => !p.exato).length ?? 0;
  const maxRitmo = Math.max(1, ...(d?.ritmo.map((r) => r.feitas) ?? [0]));

  return (
    <aside className="painel painel-andamento" aria-label={t("Painel da sala", "Room dashboard")}>
      <header className="painel-topo">
        <h2>{t("Painel", "Dashboard")}</h2>
        <button className="btn-icone" onClick={fechar} aria-label={t("Fechar painel", "Close dashboard")}><IconeFechar /></button>
      </header>

      {!d && !falhou && <div className="painel-secao"><div className="esqueleto" /><div className="esqueleto" /></div>}
      {falhou && !d && <p className="painel-secao nota erro" role="alert">{t("Não deu para carregar o painel agora.", "Couldn't load the dashboard right now.")}</p>}

      {vazio && (
        <section className="painel-secao painel-vazio">
          <span className="vazio-icone vazio-vivo" aria-hidden><SimboloVivo /></span>
          <p><strong>{t("O painel se preenche sozinho.", "The dashboard fills in on its own.")}</strong></p>
          <p className="nota">{t("Ele mostra as tarefas e as propostas da sala. Para começar, peça ao seu agente um plano: \"quebra o descritivo em tarefas por módulo, com responsável e prazo\".",
            "It shows the room's tasks and proposals. To get started, ask your agent for a plan: \"break the spec into tasks by module, each with an owner and a due date\".")}</p>
        </section>
      )}

      {d && !vazio && (
        <>
          <section className="kpis" aria-label={t("Em números", "In numbers")}>
            <div className="kpi">
              <span className="kpi-rotulo">{t("Feitas", "Done")}</span>
              <span className="kpi-valor">{d.totais.feitas}<span className="kpi-unid">/{d.totais.feitas + d.totais.abertas}</span></span>
            </div>
            <div className="kpi">
              <span className="kpi-rotulo">{t("Para decidir", "To decide")}</span>
              <span className="kpi-valor">{d.propostas.length}</span>
            </div>
            <div className={`kpi ${d.totais.atrasadas ? "kpi-alerta" : ""}`}>
              <span className="kpi-rotulo">{t("Atrasadas", "Overdue")}</span>
              <span className="kpi-valor">{d.totais.atrasadas}</span>
            </div>
          </section>

          <section className="painel-lista" aria-labelledby="pn-espera">
            <h3 className="secao-rotulo" id="pn-espera">{t("Precisa de alguém", "Waiting on someone")}</h3>
            {!d.propostas.length && !d.totais.atrasadas && !d.totais.sem_responsavel ? (
              <p className="pn-ok">{t("Nada parado. Ninguém está esperando ninguém.", "Nothing's stuck. No one is waiting on anyone.")}</p>
            ) : (
              <ul className="pn-linhas">
                {d.esperando.map((e) => (
                  <li key={e.user_id} className={e.user_id === eu ? "pn-eu" : ""}>
                    <button className="pn-linha" onClick={abrirDecisoes}>
                      <span>{e.user_id === eu ? t("Esperando você", "Waiting for you") : t(`Esperando ${nome(e.user_id)}`, `Waiting for ${nome(e.user_id)}`)}</span>
                      <strong>{e.propostas} {e.propostas === 1 ? t("proposta", "proposal") : t("propostas", "proposals")}</strong>
                    </button>
                  </li>
                ))}
                {qualquer > 0 && (
                  <li><button className="pn-linha" onClick={abrirDecisoes}>
                    <span>{t("Qualquer pessoa decide", "Anyone can decide")}</span><strong>{qualquer} {qualquer === 1 ? t("proposta", "proposal") : t("propostas", "proposals")}</strong>
                  </button></li>
                )}
                {d.totais.atrasadas > 0 && (
                  <li><button className="pn-linha" onClick={abrirTarefas}>
                    <span>{t("Tarefas atrasadas", "Overdue tasks")}</span><strong className="pn-erro">{d.totais.atrasadas}</strong>
                  </button></li>
                )}
                {d.totais.sem_responsavel > 0 && (
                  <li><button className="pn-linha" onClick={abrirTarefas}>
                    <span>{t("Tarefas sem responsável", "Unassigned tasks")}</span><strong>{d.totais.sem_responsavel}</strong>
                  </button></li>
                )}
              </ul>
            )}
            {d.propostas.length > 0 && (
              <ul className="pn-itens">
                {d.propostas.map((p) => {
                  const dias = diasDesde(p.criada_em);
                  const falta = p.exato ? lista(p.faltam.map(nome)) : t(`${p.precisa - p.votos} de ${lista(p.faltam.map(nome))}`, `${p.precisa - p.votos} of ${lista(p.faltam.map(nome))}`);
                  return (
                    <li key={p.id}>
                      <button className="pn-item" onClick={() => irPara(p.id)}>
                        <span className="pn-item-titulo">{p.plano && <span className="pilula">{t("Plano", "Plan")}</span>} {p.titulo || t("Proposta", "Proposal")}</span>
                        <span className="nota">{t(`falta ${falta}`, `waiting for ${falta}`)} · <span className={dias > 2 ? "pn-aviso" : ""}>{dias === 0 ? t("hoje", "today") : t(`há ${dias} ${dias === 1 ? "dia" : "dias"}`, `${dias} ${dias === 1 ? "day" : "days"} ago`)}</span></span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {d.atrasadas.length > 0 && (
              <ul className="pn-itens">
                {d.atrasadas.map((a) => (
                  <li key={a.id}>
                    <button className="pn-item" onClick={abrirTarefas}>
                      <span className="pn-item-titulo">{a.frente && <span className="pilula">{a.frente}</span>} {a.titulo}</span>
                      <span className="nota">{quem(a.responsavel, a.responsavel_agente)} · <span className="pn-erro">{t(`${diasDesde(a.prazo)} ${diasDesde(a.prazo) === 1 ? "dia" : "dias"} de atraso`, `${diasDesde(a.prazo)} ${diasDesde(a.prazo) === 1 ? "day" : "days"} overdue`)}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {d.frentes.length > 0 && (
            <section className="painel-lista" aria-labelledby="pn-frentes">
              <h3 className="secao-rotulo" id="pn-frentes">{t("Avanço por frente", "Progress by workstream")}</h3>
              <ul className="pn-frentes">
                {d.frentes.map((f) => (
                  <li key={f.frente || "-"}>
                    <div className="pn-frente-topo">
                      <span className="pn-frente-nome">{f.frente || t("Sem frente", "No workstream")}</span>
                      <span className="pn-num">{f.feitas}/{f.total}</span>
                    </div>
                    <div className="pn-trilho" role="img" aria-label={t(`${f.feitas} de ${f.total} feitas`, `${f.feitas} of ${f.total} done`)}>
                      <i style={{ width: `${f.total ? (f.feitas / f.total) * 100 : 0}%` }} />
                    </div>
                    {(f.atrasadas > 0 || f.previsto) && (
                      <p className="nota">
                        {f.atrasadas > 0 && <span className="pn-erro">{f.atrasadas} {f.atrasadas === 1 ? t("atrasada", "overdue") : t("atrasadas", "overdue")}</span>}
                        {f.atrasadas > 0 && f.previsto && " · "}
                        {f.previsto && <>{t(`previsto ${diaMes(f.previsto)}`, `planned ${diaMes(f.previsto)}`)}
                          {f.desvio_dias && f.desvio_dias > 0
                            ? <> · <span className="pn-aviso">{t(`projeção ${diaMes(f.projecao!)}, +${f.desvio_dias} ${f.desvio_dias === 1 ? "dia" : "dias"}`, `projected ${diaMes(f.projecao!)}, +${f.desvio_dias} ${f.desvio_dias === 1 ? "day" : "days"}`)}</span></>
                            : <> · {t("no prazo", "on track")}</>}</>}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              {d.frentes.some((f) => f.previsto) && (
                <p className="nota pn-explica">{t("Projeção: a data de entrega da última tarefa, ou o prazo dela. Tarefa atrasada conta como hoje.",
                  "Projection: the last task's completion date, or its due date. Overdue tasks count as today.")}</p>
              )}
            </section>
          )}

          <section className="painel-lista" aria-labelledby="pn-ritmo">
            <h3 className="secao-rotulo" id="pn-ritmo">{t("Ritmo", "Pace")} <span>{t("tarefas feitas por semana", "tasks done per week")}</span></h3>
            <div className="pn-ritmo">
              {d.ritmo.map((r, i) => (
                <div key={r.semana} className={`pn-semana ${i === d.ritmo.length - 1 ? "pn-atual" : ""}`}
                  title={t(`Semana de ${diaMes(r.semana + "T12:00:00")}: ${r.feitas}`, `Week of ${diaMes(r.semana + "T12:00:00")}: ${r.feitas}`)}>
                  <span className="pn-num">{r.feitas || ""}</span>
                  <span className="pn-barra" style={{ height: `${(r.feitas / maxRitmo) * 100}%` }} />
                  <span className="pn-semana-rotulo">{i === d.ritmo.length - 1 ? t("esta", "now") : semana(r.semana)}</span>
                </div>
              ))}
            </div>
          </section>

        </>
      )}
    </aside>
  );
}
