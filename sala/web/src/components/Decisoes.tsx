import { useEffect, useRef, useState, type ReactNode } from "react";
import { copiarTexto, sb, type Mensagem } from "../supabase";
import { IconeCheck, IconeDecisao, IconeDocumento, IconeFechar, IconeProposta, IconeSeta } from "./Icones";
import { Texto } from "./Texto";
import { LinhaAprovacao, type Aprovacao } from "./Bolha";
import { erro as msgErro, locale, t } from "../i18n";
import { recado } from "./Recados";

type Props = {
  salaId: string;
  salaNome: string;
  versao: number; // muda quando chega proposta ou decisão
  autor: (m: Mensagem) => string;
  nome: (uid: string | null) => string;
  decidir: (id: number, aprovar: boolean | "ajuste", nota?: string) => Promise<string | null>;
  aprovacaoDe?: (m: Mensagem) => Aprovacao | null;
  irPara: (id: number) => void;
  fechar: () => void;
  abrirAta: () => void;
};

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short" }).replace(".", "") : "");

// Registro de decisões: o que espera um sim e o que já foi decidido, com quem e quando.
export function Decisoes({ salaId, salaNome, versao, autor, nome, decidir, aprovacaoDe, irPara, fechar, abrirAta }: Props) {
  const [lista, setLista] = useState<Mensagem[] | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [recusando, setRecusando] = useState<number | null>(null);
  const [nota, setNota] = useState("");

  useEffect(() => {
    sb.from("mensagens").select("*").eq("sala_id", salaId).eq("tipo", "proposta").eq("apagada", false)
      .order("id", { ascending: false }).limit(200)
      .then(({ data: d }) => setLista((d as Mensagem[]) ?? []));
  }, [salaId, versao]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && recusando === null && fechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [fechar, recusando]);

  const pendentes = lista?.filter((p) => p.estado === "pendente") ?? [];
  // em ajuste e substituídas não são decisão: a versão nova volta para "Para decidir"
  const decididas = lista?.filter((p) => p.estado === "aprovada" || p.estado === "recusada") ?? [];

  const copiar = async () => {
    const linhas = [`# ${t("Decisões", "Decisions")} · ${salaNome}`, ""];
    decididas.forEach((p) => {
      const quem = nome(p.decidida_por), quando = data(p.decidida_em), de = autor(p), texto = p.texto.replace(/\s+/g, " ");
      linhas.push(p.estado === "aprovada"
        ? t(`- Aprovada por ${quem} em ${quando} · proposta de ${de}: ${texto}`, `- Approved by ${quem} on ${quando} · proposed by ${de}: ${texto}`)
        : t(`- Recusada por ${quem} em ${quando} · proposta de ${de}: ${texto}`, `- Declined by ${quem} on ${quando} · proposed by ${de}: ${texto}`));
    });
    if (pendentes.length) linhas.push("", t("## Aguardando decisão", "## Awaiting decision"), ...pendentes.map((p) => `- ${autor(p)}: ${p.texto.replace(/\s+/g, " ")}`));
    if (await copiarTexto(linhas.join("\n"))) { setCopiado(true); setTimeout(() => setCopiado(false), 1500); }
  };

  const agir = async (id: number, aprovar: boolean | "ajuste", nota?: string) => {
    if (aprovar === "ajuste" && !nota) return recado(t("Diga o que precisa mudar.", "Describe what needs to change."));
    setOcupado(id);
    const erro = await decidir(id, aprovar, nota);
    setOcupado(null);
    if (erro) recado(msgErro(erro));
    else setRecusando(null);
  };

  return (
    <aside className="painel" aria-label={t("Decisões da sala", "Room decisions")}>
      <header className="painel-topo">
        <h2>{t("Decisões", "Decisions")}</h2>
        <div className="painel-topo-acoes">
          <button className="btn btn-pequeno" onClick={abrirAta} title={t("Decisões e tarefas de um período, para imprimir, salvar em PDF ou mandar ao cliente.", "Decisions and tasks for a period, ready to print, save as PDF or send to a client.")}>
            <IconeDocumento tamanho={16} /> {t("Ata", "Minutes")}
          </button>
          <button className="btn-icone" onClick={fechar} aria-label={t("Fechar decisões", "Close decisions")}><IconeFechar /></button>
        </div>
      </header>

      {lista === null && <div className="painel-secao"><div className="esqueleto" /><div className="esqueleto" /></div>}

      {lista && !lista.length && (
        <section className="painel-secao painel-vazio">
          <span className="vazio-icone"><IconeProposta tamanho={20} /></span>
          <p><strong>{t("Nenhuma proposta ainda.", "No proposals yet.")}</strong></p>
          <p className="nota">{t("Quando alguém precisar de um sim, a proposta aparece aqui para aprovar ou recusar. O que for decidido fica registrado, e os agentes leem antes de responder.", "When someone needs a yes, their proposal shows up here to approve or decline. Decisions are kept on record, and agents read them before replying.")}</p>
          <p className="nota">{t("Para propor, use ", "To propose, use ")}<strong>{t("Propor", "Propose")}</strong>{t(" na barra de escrever.", " in the message bar.")}</p>
        </section>
      )}

      {lista && lista.length > 0 && !pendentes.length && (
        <div className="painel-ok"><IconeDecisao tamanho={16} /> {t("Nada esperando decisão.", "Nothing awaiting a decision.")}</div>
      )}

      {pendentes.length > 0 && (
        <section className="painel-lista">
          <h3 className="secao-rotulo">{t("Para decidir", "To decide")} <span>{pendentes.length}</span></h3>
          <ul className="decisoes">
            {pendentes.map((p) => (
              <li key={p.id} className="decisao-cartao">
                <div className="decisao-topo">
                  <span className="pilula pilula-acento"><IconeProposta tamanho={12} /> {t("Proposta", "Proposal")}</span>
                  <span className="nota">{autor(p)} · {data(p.criada_em)}</span>
                  <button className="btn-mais" onClick={() => irPara(p.id)} title={t("Ver na conversa", "View in chat")} aria-label={t("Ver na conversa", "View in chat")}><IconeSeta tamanho={16} /></button>
                </div>
                <Recolhe>
                  <Texto texto={p.texto} chamaMim={() => false} />
                </Recolhe>
                {recusando === p.id ? (
                  <form className="recusar" onSubmit={(e) => { e.preventDefault(); agir(p.id, "ajuste", nota.trim() || undefined); }}>
                    <label className="sr" htmlFor={`dn${p.id}`}>{t("O que precisa mudar", "What needs to change")}</label>
                    <input id={`dn${p.id}`} autoFocus value={nota} maxLength={2000} placeholder={t("O que precisa mudar? Quem propôs lê isto.", "What needs to change? The proposer will see this.")}
                      onChange={(e) => setNota(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setRecusando(null)} />
                    <div className="decidir">
                      <button type="button" className="btn" onClick={() => setRecusando(null)}>{t("Voltar", "Back")}</button>
                      <button className="btn btn-cheio" disabled={ocupado === p.id}>{t("Pedir ajuste", "Request changes")}</button>
                    </div>
                    <button type="button" className="link-texto recusar-de-vez" disabled={ocupado === p.id} onClick={() => agir(p.id, false, nota.trim() || undefined)}>{t("Recusar de vez", "Decline for good")}</button>
                  </form>
                ) : (() => {
                  const a = aprovacaoDe?.(p);
                  if (a?.posso === false) return <LinhaAprovacao a={a} />;
                  return (
                    <>
                      {a && <LinhaAprovacao a={a} />}
                      <div className="decidir">
                        <button className="btn" disabled={ocupado === p.id} onClick={() => { setRecusando(p.id); setNota(""); }}>{t("Ajustar ou recusar", "Request changes or decline")}</button>
                        {a?.euAprovei
                          ? <button className="btn btn-aprovei" disabled><IconeCheck tamanho={14} /> {t("Você aprovou", "You approved")}</button>
                          : <button className="btn btn-cheio" disabled={ocupado === p.id} onClick={() => agir(p.id, true)}>{t("Aprovar", "Approve")}</button>}
                      </div>
                    </>
                  );
                })()}
              </li>
            ))}
          </ul>
        </section>
      )}

      {decididas.length > 0 && (
        <section className="painel-lista">
          <div className="secao-rotulo secao-rotulo-acao">
            <h3>{t("Decididas", "Decided")} <span>{decididas.length}</span></h3>
            <button className="link nota" onClick={copiar}>{copiado ? t("Copiado", "Copied") : t("Copiar registro", "Copy log")}</button>
          </div>
          <ul className="decididas">
            {decididas.map((p) => (
              <li key={p.id}>
                <button className="decidida-linha" onClick={() => irPara(p.id)} title={t("Ver na conversa", "View in chat")}>
                  <span className={`pilula ${p.estado === "aprovada" ? "pilula-ok" : "pilula-erro"}`}>
                    {p.estado === "aprovada" ? <IconeCheck tamanho={12} /> : <IconeFechar tamanho={12} />}
                    {p.estado === "aprovada" ? t("Aprovada", "Approved") : t("Recusada", "Declined")}
                  </span>
                  <span className="decidida-texto">{resumo(p.texto)}</span>
                  <span className="nota">{nome(p.decidida_por).split(" ")[0]} · {data(p.decidida_em)} · {t("proposta de", "proposed by")} {autor(p)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

// texto da proposta sem markdown, para a lista compacta
const resumo = (s: string) => s.replace(/[*_`#>]/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\s+/g, " ").trim();

// proposta longa: mostra o começo e um "Mostrar tudo"
function Recolhe({ children }: { children: ReactNode }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [longo, setLongo] = useState(false);
  const [aberto, setAberto] = useState(false);
  useEffect(() => { const c = caixa.current; if (c) setLongo(c.scrollHeight > c.clientHeight + 4); }, [children]);
  return (
    <div className="recolhe-caixa">
      <div ref={caixa} className={`recolhe ${aberto ? "aberto" : ""} ${longo && !aberto ? "cortado" : ""}`}>{children}</div>
      {longo && <button className="link nota" onClick={() => setAberto((v) => !v)}>{aberto ? t("Mostrar menos", "Show less") : t("Mostrar tudo", "Show all")}</button>}
    </div>
  );
}
