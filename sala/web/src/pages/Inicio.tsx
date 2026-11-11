import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../App";
import { Layout, corDaSala, useSalas } from "../components/Layout";
import { modelos, NovaSala } from "../components/NovaSala";
import { abrirComandos, atalhoComandos } from "../components/Comandos";
import { gravado, idioma, locale, t } from "../i18n";
import { IconeAgente, IconeBusca, IconeCheck, IconeMais, IconePlugue, IconeProposta, IconeSeta, Marcador, SimboloVivo } from "../components/Icones";
import { abrirConectar, type ItemFila, type Sala } from "../supabase";

const quando = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
  const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return t("ontem", "yesterday");
  return d.toLocaleDateString(locale(), { day: "numeric", month: "short" }).replace(".", "");
};

const prazoFila = (f: ItemFila) => {
  if (f.tipo === "proposta") return t("para decidir", "awaiting your decision");
  if (!f.prazo) return t("tarefa sua", "your task");
  const d = new Date(f.prazo);
  if (d.getTime() < Date.now()) return t(`atrasada · era ${quando(f.prazo)}`, `overdue · was due ${quando(f.prazo)}`);
  return d.toDateString() === new Date().toDateString() ? t("vence hoje", "due today") : t(`vence ${quando(f.prazo)}`, `due ${quando(f.prazo)}`);
};

// Início: o que espera por você em todas as salas, as salas mais recentes e os atalhos.
// No celular, a lista de salas da lateral já faz esse papel.
export default function Inicio() {
  const { salas, fila, recarregar } = useSalas();
  const { perfil } = useAuth();
  const [criar, setCriar] = useState<string | null>(null);
  const nome = (perfil?.nome ?? "").split(" ")[0];

  const recentes = [...(salas ?? [])].sort((a, b) => (b.ultima_em ?? "").localeCompare(a.ultima_em ?? "")).slice(0, 6);
  const novas = (salas ?? []).reduce((n, s) => n + Number(s.nao_lidas), 0);
  const comNovas = (salas ?? []).filter((s) => Number(s.nao_lidas) > 0).length;
  const atrasadas = fila.filter((f) => f.tipo === "tarefa" && !!f.prazo && new Date(f.prazo).getTime() < Date.now()).length;
  const decidir = fila.filter((f) => f.tipo === "proposta").length;

  // A manchete é o estado, com o número na frente; o detalhe vem embaixo, em cinza.
  const manchete = fila.length
    ? (fila.length === 1 ? t("1 coisa espera por você.", "1 thing is waiting for you.") : t(`${fila.length} coisas esperam por você.`, `${fila.length} things are waiting for you.`))
    : novas
      ? t(`${novas} ${novas === 1 ? "mensagem nova" : "mensagens novas"} desde a sua última visita.`, `${novas} new ${novas === 1 ? "message" : "messages"} since your last visit.`)
      : t(`Tudo em dia, ${nome}.`, `All caught up, ${nome}.`);
  const resumo = [
    decidir ? t(`${decidir} ${decidir === 1 ? "decisão" : "decisões"} para tomar`, `${decidir} ${decidir === 1 ? "decision" : "decisions"} to make`) : "",
    atrasadas ? t(`${atrasadas} ${atrasadas === 1 ? "tarefa atrasada" : "tarefas atrasadas"}`, `${atrasadas} overdue ${atrasadas === 1 ? "task" : "tasks"}`) : "",
    fila.length && novas ? t(`${novas} ${novas === 1 ? "mensagem nova" : "mensagens novas"} em ${comNovas} ${comNovas === 1 ? "sala" : "salas"}`, `${novas} new ${novas === 1 ? "message" : "messages"} in ${comNovas} ${comNovas === 1 ? "room" : "rooms"}`) : "",
    !fila.length && novas ? t(`Em ${comNovas} ${comNovas === 1 ? "sala" : "salas"}. Nada pede a sua decisão.`, `In ${comNovas} ${comNovas === 1 ? "room" : "rooms"}. Nothing needs your decision.`) : "",
    !fila.length && !novas ? t("Quando alguém pedir a sua decisão, aparece aqui.", "When someone needs your decision, it shows up here.") : "",
  ].filter(Boolean).join(" · ");
  const hoje = new Date().toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "short" }).replace(".", "");

  return (
    <Layout salas={salas} recarregar={recarregar} fila={fila}>
      <div className="inicio">
        {salas && !salas.length && (
          <section className="inicio-primeira">
            <span className="vazio-icone vazio-vivo" aria-hidden><SimboloVivo /></span>
            <h1>{t(`Boas-vindas, ${nome}. Crie a sua primeira sala.`, `Welcome, ${nome}. Create your first room.`)}</h1>
            <p className="sub">{t("Uma sala por assunto. Depois é só chamar quem trabalha com você e cada pessoa conecta o próprio agente.", "One room per topic. Then invite the people you work with, and everyone connects their own agent.")}</p>
            <div className="modelos-inicio">
              {modelos().map((m) => (
                <button key={m.id} className="modelo" onClick={() => setCriar(m.id)}>
                  <strong>{m.titulo}</strong><span className="nota">{m.texto}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {salas === null && <div className="inicio-esqueleto" aria-hidden><span className="esqueleto" /><span className="esqueleto" /><span className="esqueleto" /></div>}

        {salas && salas.length > 0 && (
          <>
            <header className="inicio-topo">
              <span className="rotulo-vivo">{hoje.charAt(0).toUpperCase() + hoje.slice(1)}</span>
              <h1>{manchete}</h1>
              {resumo && <p className="sub">{resumo.endsWith(".") ? resumo : `${resumo}.`}</p>}
            </header>

            <section className="inicio-secao" aria-labelledby="inicio-espera">
              <h2 className="secao-rotulo" id="inicio-espera">{t("Esperando você", "Waiting for you")} {fila.length > 0 && <span>{fila.length}</span>}</h2>
              {fila.length ? (
                <ul className="inicio-fila">
                  {fila.slice(0, 8).map((f) => {
                    const atrasada = f.tipo === "tarefa" && !!f.prazo && new Date(f.prazo).getTime() < Date.now();
                    return (
                      <li key={`${f.tipo}${f.ref}`}>
                        <Link to={f.tipo === "proposta" ? `/s/${f.sala_id}?ir=${f.ref}` : `/s/${f.sala_id}?tarefas=1`} className={atrasada ? "atrasada-item" : ""}>
                          <span className={`inicio-fila-icone ${f.tipo === "proposta" ? "e-proposta" : ""}`} aria-hidden>{f.tipo === "proposta" ? <IconeProposta tamanho={15} /> : <Marcador tamanho={15} />}</span>
                          <span className="inicio-fila-texto">
                            <strong>{f.titulo || t("Proposta", "Proposal")}</strong>
                            <span><i style={{ "--cor": corDaSala(f.sala_id) } as React.CSSProperties} aria-hidden />{f.sala} · <em>{prazoFila(f)}</em></span>
                          </span>
                          <IconeSeta tamanho={15} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="inicio-ok"><IconeCheck tamanho={16} /> {t("Tudo em dia. Quando alguém pedir a sua decisão ou uma tarefa sua vencer, aparece aqui.", "All caught up. When someone needs your decision or one of your tasks is due, it shows up here.")}</p>
              )}
            </section>

            <section className="inicio-secao" aria-labelledby="inicio-salas">
              <h2 className="secao-rotulo" id="inicio-salas">{t("Salas recentes", "Recent rooms")}</h2>
              <ul className="inicio-salas">
                {recentes.map((s) => <CartaoSala key={s.id} s={s} />)}
                <li><button type="button" className="inicio-sala inicio-sala-nova" onClick={() => setCriar("branco")}>
                  <span className="vazio-icone" aria-hidden><IconeMais tamanho={18} /></span>
                  <strong>{t("Nova sala", "New room")}</strong><span className="nota">{t("De um modelo ou em branco", "From a template or blank")}</span>
                </button></li>
              </ul>
            </section>

            <section className="inicio-atalhos" aria-label={t("Atalhos", "Shortcuts")}>
              <button type="button" onClick={abrirConectar}><IconePlugue tamanho={18} /><span><strong>{t("Conectar um agente", "Connect an agent")}</strong><span>{t("Claude, ChatGPT, Gemini ou o que você usa", "Claude, ChatGPT, Gemini or whatever you use")}</span></span><kbd>A</kbd></button>
              <button type="button" onClick={abrirComandos}><IconeBusca tamanho={18} /><span><strong>{t("Buscar e ir para", "Search and go to")}</strong><span>{t("Salas, painéis e ações", "Rooms, panels and actions")}</span></span><kbd>{atalhoComandos()}</kbd></button>
            </section>
          </>
        )}
      </div>
      {criar && <NovaSala modeloInicial={criar} fechar={() => setCriar(null)} aoCriar={recarregar} />}
    </Layout>
  );
}

function CartaoSala({ s }: { s: Sala }) {
  const novas = Number(s.nao_lidas);
  return (
    <li>
      <Link to={`/s/${s.id}`} className={`inicio-sala ${novas ? "tem-novas" : ""}`}>
        <span className="inicio-sala-topo">
          <span className="sala-inicial" style={{ "--cor": corDaSala(s.id) } as React.CSSProperties} aria-hidden>{s.nome.slice(0, 1).toUpperCase()}</span>
          <strong>{s.nome}</strong>
          {novas > 0 && <span className="sala-novas" aria-label={`${novas} ${novas === 1 ? t("não lida", "unread") : t("não lidas", "unread")}`}>{novas > 99 ? "99+" : novas}</span>}
        </span>
        <span className="inicio-sala-previa">
          {s.ultima_texto ? (
            <>{s.ultima_agente && <IconeAgente tamanho={11} />}<b>{s.ultima_agente ?? s.ultima_nome?.split(" ")[0]}</b>{s.ultima_tipo === "proposta" ? t(" propôs", " proposed") : s.ultima_tipo === "decisao" ? t(" decidiu", " decided") : ""}: {gravado(s.ultima_texto, s.idioma ?? idioma()).replace(/\*\*|__|`|^#+\s/gm, "")}</>
          ) : t("Sem mensagens ainda", "No messages yet")}
        </span>
        <span className="inicio-sala-pe">
          <time>{quando(s.ultima_em)}</time>
          {Number(s.pendentes) > 0 && <span className="pilula pilula-acento"><IconeProposta tamanho={11} /> {s.pendentes} {Number(s.pendentes) === 1 ? t("para decidir", "to decide") : t("para decidir", "to decide")}</span>}
          {Number(s.minhas_tarefas) > 0 && <span className="pilula"><Marcador tamanho={11} /> {s.minhas_tarefas} {Number(s.minhas_tarefas) === 1 ? t("tarefa sua", "your task") : t("tarefas suas", "your tasks")}</span>}
        </span>
      </Link>
    </li>
  );
}
