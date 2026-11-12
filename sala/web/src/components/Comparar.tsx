import { useEffect, useState } from "react";
import { useFocoPreso } from "./foco";
import type { Mensagem } from "../supabase";
import { IconeAgente, IconeFechar, IconeVoltar } from "./Icones";
import { Texto } from "./Texto";
import { naConversa, locale, t } from "../i18n";

export type Esperando = { nome: string; dono: string; status: string };

// Numa discussão o mesmo agente responde várias vezes à pergunta: vale a mais recente (uma proposta dele, se houver),
// e as anteriores ficam guardadas atrás dela.
export function porAgente(rs: Mensagem[]) {
  const grupos = new Map<string, Mensagem[]>();
  for (const r of [...rs].sort((a, b) => a.id - b.id)) {
    const k = `${r.agente}|${r.user_id}`;
    grupos.set(k, [...(grupos.get(k) ?? []), r]);
  }
  return [...grupos.values()].map((ms) => {
    const propostas = ms.filter((m) => m.tipo === "proposta");
    const final = propostas[propostas.length - 1] ?? ms[ms.length - 1];
    return { final, antes: ms.filter((m) => m.id !== final.id) };
  });
}

type Props = {
  pergunta: Mensagem;
  autorPergunta: string;
  respostas: Mensagem[];
  autor: (m: Mensagem) => string;
  esperando: Esperando[];
  fechar: () => void;
};

// A mesma pergunta, as respostas de cada agente lado a lado.
export function Comparar({ pergunta, autorPergunta, respostas, autor, esperando, fechar }: Props) {
  const janela = useFocoPreso<HTMLDivElement>();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [fechar]);

  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
      <div className="modal modal-largo" ref={janela} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="comparar-titulo">
        <div className="modal-topo">
          <h2 id="comparar-titulo">{t("Respostas lado a lado", "Side-by-side answers")}</h2>
          <button className="btn-icone" onClick={fechar} aria-label={t("Fechar", "Close")}><IconeFechar /></button>
        </div>
        <blockquote className="comparar-pergunta">
          <span className="nota">{t(`${autorPergunta} perguntou`, `${autorPergunta} asked`)}</span>
          <Texto texto={naConversa(pergunta.texto)} chamaMim={() => false} />
        </blockquote>
        <div className="colunas" role="list">
          {porAgente(respostas).map(({ final: r, antes }) => (
            <Coluna key={r.id} r={r} antes={antes} autor={autor} />
          ))}
          {esperando.map((e) => (
            <section key={`${e.nome}-${e.dono}`} className="coluna coluna-esperando" role="listitem" aria-label={t(`${e.nome} de ${e.dono}, sem resposta`, `${e.dono}'s ${e.nome}, no answer yet`)}>
              <header><IconeAgente tamanho={16} /> <strong>{t(`${e.nome} de ${e.dono}`, `${e.dono}'s ${e.nome}`)}</strong></header>
              <div className="coluna-corpo">
                <p><strong>{t("Ainda não respondeu.", "No answer yet.")}</strong></p>
                <p className="nota">{e.status}. {/^(ouvindo|listening)/.test(e.status)
                  ? t("Deve responder em instantes.", "It should reply shortly.")
                  : t(`Peça para ${e.dono.split(" ")[0]} abrir o ${e.nome} e dizer “veja a sala”.`, `Ask ${e.dono.split(" ")[0]} to open ${e.nome} and say “check the room.”`)}</p>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function Coluna({ r, antes, autor }: { r: Mensagem; antes: Mensagem[]; autor: (m: Mensagem) => string }) {
  const [verAntes, setVerAntes] = useState(false);
  const hora = (m: Mensagem) => new Date(m.criada_em).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
  return (
    <section className="coluna" role="listitem" aria-label={autor(r)}>
      <header><IconeAgente tamanho={16} /> <strong>{autor(r)}</strong>
        <time className="nota">{hora(r)}</time>
      </header>
      <div className="coluna-corpo msg-corpo">
        {r.tipo === "proposta" && (
          <p className="proposta-rotulo">
            <span className={`pilula ${r.estado === "aprovada" ? "pilula-ok" : r.estado === "recusada" ? "pilula-erro" : "pilula-acento"}`}>
              {r.estado === "aprovada" ? t("Aprovada", "Approved") : r.estado === "recusada" ? t("Recusada", "Declined") : t("Proposta", "Proposal")}
            </span>
          </p>
        )}
        <Texto texto={naConversa(r.texto)} chamaMim={() => false} />
        {antes.length > 0 && (
          <div className="coluna-antes">
            <button className="secao-rotulo secao-dobra" aria-expanded={verAntes} onClick={() => setVerAntes((v) => !v)}>
              <IconeVoltar tamanho={14} /> {antes.length === 1 ? t("1 mensagem antes", "1 earlier message") : t(`${antes.length} mensagens antes`, `${antes.length} earlier messages`)}
            </button>
            {verAntes && antes.map((m) => (
              <div key={m.id} className="coluna-antiga">
                <span className="nota">{hora(m)}</span>
                <Texto texto={naConversa(m.texto)} chamaMim={() => false} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
