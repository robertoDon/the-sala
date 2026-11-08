import { useEffect, useState } from "react";
import { sb } from "../supabase";
import { IconeCheck } from "./Icones";
import { Menu } from "./Menu";
import { erro as msgErro, idioma, t } from "../i18n";
import { recado } from "./Recados";

type Integracao = { id: number; url: string; eventos: string[]; criada_em: string };

const eventosDisponiveis = () => [
  { id: "decisao", rotulo: t("Decisões", "Decisions") },
  { id: "proposta", rotulo: t("Propostas novas", "New proposals") },
  { id: "tarefa_nova", rotulo: t("Tarefas novas", "New tasks") },
  { id: "tarefa_feita", rotulo: t("Tarefas concluídas", "Completed tasks") },
  { id: "mensagem", rotulo: t("Toda mensagem", "Every message") },
];

const servico = (url: string) => {
  const h = url.split("/")[2] ?? "";
  if (h.includes("slack.com")) return "Slack";
  if (h.includes("discord")) return "Discord";
  if (h.includes("chat.googleapis.com")) return "Google Chat";
  if (/office\.com|logic\.azure\.com|powerplatform\.com/.test(h)) return "Teams";
  return h;
};

// Leva decisões e tarefas da sala para onde o time já está (Slack, Teams, Discord, Google Chat ou um sistema seu).
export function Integracoes({ salaId }: { salaId: string }) {
  const [lista, setLista] = useState<Integracao[] | null>(null);
  const [url, setUrl] = useState("");
  const [eventos, setEventos] = useState<string[]>(["decisao", "tarefa_feita"]);
  const [erro, setErro] = useState("");
  const [testado, setTestado] = useState<number | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const EVENTOS = eventosDisponiveis();

  const carregar = () => sb.from("integracoes").select("id, url, eventos, criada_em").eq("sala_id", salaId).order("id")
    .then(({ data }) => setLista((data as Integracao[]) ?? []));
  useEffect(() => { carregar(); }, [salaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    const { error } = await sb.rpc("criar_integracao", { sala: salaId, url: url.trim(), eventos });
    if (error) return setErro(error.message.includes("check constraint") ? t("Confira o endereço: precisa começar com https://", "Check the address: it must start with https://") : msgErro(error));
    setUrl(""); setAbrindo(false); carregar();
  };

  const testar = async (i: Integracao) => {
    const { error } = await sb.rpc("testar_integracao", { integracao: i.id });
    if (error) return recado(msgErro(error));
    setTestado(i.id); setTimeout(() => setTestado(null), 2500);
  };

  const apagar = async (i: Integracao) => {
    const { error } = await sb.rpc("apagar_integracao", { integracao: i.id });
    if (error) recado(msgErro(error));
    carregar();
  };

  return (
    <section className="painel-lista">
      <div className="secao-rotulo secao-rotulo-acao">
        <h3>{t("Integrações", "Integrations")} {!!lista?.length && <span>{lista.length}</span>}</h3>
        {!abrindo && (lista?.length ?? 0) < 5 && <button className="link nota" onClick={() => setAbrindo(true)}>{t("Ligar nova", "Add")}</button>}
      </div>
      {!lista?.length && !abrindo && <p className="nota secao-nota">{t("Avise o Slack, o Teams, o Discord, o Google Chat ou um sistema seu quando algo acontecer aqui.", "Notify Slack, Teams, Discord, Google Chat or your own system when something happens here.")}</p>}
      {lista && lista.length > 0 && (
        <ul className="linhas">
          {lista.map((i) => (
            <li key={i.id} className="linha-item">
              <span className="avatar">{servico(i.url)[0]?.toUpperCase()}</span>
              <span className="linha-texto">
                <span className="linha-titulo">{servico(i.url)}</span>
                <span className="presenca">{i.eventos.map((e) => EVENTOS.find((x) => x.id === e)?.rotulo).join(", ")}</span>
              </span>
              {testado === i.id && <span className="salvo" role="status"><IconeCheck tamanho={12} /> {t("Enviado", "Sent")}</span>}
              <Menu rotulo={t(`Ações da integração ${servico(i.url)}`, `Actions for ${servico(i.url)}`)} itens={[
                { rotulo: t("Mandar um teste", "Send test message"), acao: () => testar(i) },
                { rotulo: t("Desligar", "Remove"), acao: () => apagar(i), perigo: true, confirmar: t(`${servico(i.url)} para de receber os avisos desta sala.`, `${servico(i.url)} will stop getting this room's notifications.`) },
              ]} />
            </li>
          ))}
        </ul>
      )}
      {abrindo ? (
        <form className="tarefa-form integracao-form" onSubmit={salvar}>
          <label className="sr" htmlFor="int-url">{t("Endereço do webhook", "Webhook URL")}</label>
          <input id="int-url" autoFocus type="url" placeholder="https://hooks.slack.com/services/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <fieldset className="eventos">
            <legend className="sr">{t("Quando avisar", "When to notify")}</legend>
            {EVENTOS.map((ev) => (
              <label key={ev.id} className="evento-opcao">
                <input type="checkbox" checked={eventos.includes(ev.id)}
                  onChange={(e) => setEventos((x) => (e.target.checked ? [...x, ev.id] : x.filter((y) => y !== ev.id)))} />
                {ev.rotulo}
              </label>
            ))}
          </fieldset>
          <details className="nota">
            <summary>{t("Onde pego esse endereço?", "Where do I find this URL?")}</summary>
            {idioma() === "pt"
              ? <p><b>Slack:</b> api.slack.com/apps → crie um app → Incoming Webhooks → Add New Webhook. <b>Teams:</b> no canal, Fluxos de trabalho → “Postar em um canal quando uma solicitação de webhook for recebida”. <b>Discord:</b> configurações do canal → Integrações → Webhooks. <b>Google Chat:</b> no espaço, Apps e integrações → Webhooks. Qualquer outro sistema recebe um JSON com o evento.</p>
              : <p><b>Slack:</b> api.slack.com/apps → create an app → Incoming Webhooks → Add New Webhook. <b>Teams:</b> in the channel, Workflows → “Post to a channel when a webhook request is received”. <b>Discord:</b> channel settings → Integrations → Webhooks. <b>Google Chat:</b> in the space, Apps &amp; integrations → Webhooks. Any other system gets a JSON with the event.</p>}
          </details>
          {erro && <p className="nota erro" role="alert">{erro}</p>}
          <div className="linha campo-acoes">
            <button type="button" className="btn btn-pequeno btn-texto" onClick={() => { setAbrindo(false); setErro(""); }}>{t("Cancelar", "Cancel")}</button>
            <button className="btn btn-pequeno btn-cheio" disabled={!url.trim() || !eventos.length}>{t("Ligar", "Add integration")}</button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
