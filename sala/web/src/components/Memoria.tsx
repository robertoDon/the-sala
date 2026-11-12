import { useEffect, useState } from "react";
import { sb } from "../supabase";
import { IconeFechar, IconeLapis, IconeMemoria, IconeVoltar } from "./Icones";
import { Menu } from "./Menu";
import { BotaoConfirmar } from "./Confirmar";
import { recado } from "./Recados";
import { Texto } from "./Texto";
import { erro as msgErro, locale, t } from "../i18n";

type Versao = { id: number; resumo: string | null; user_id: string | null; agente: string | null; criada_em: string };
type Props = { salaId: string; eu: string; podeEscrever: boolean; nome: (uid: string | null) => string; fechar: () => void; voltar?: () => void };

const quando = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return t("agora", "just now");
  if (min < 60) return t(`há ${min} min`, `${min} min ago`);
  const h = Math.round(min / 60);
  if (h < 24) return t(`há ${h} h`, `${h} h ago`);
  return new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short" }).replace(".", "");
};

// Memória da sala: o estado do projeto que os agentes mantêm por baixo dos panos, sem aprovação.
// As pessoas leem, corrigem e voltam para uma versão anterior.
export function Memoria({ salaId, eu, podeEscrever, nome, fechar, voltar }: Props) {
  const [texto, setTexto] = useState<string | null>(null);
  const [versoes, setVersoes] = useState<Versao[]>([]);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState("");
  const [resumo, setResumo] = useState("");
  const [vendo, setVendo] = useState<{ id: number; texto: string } | null>(null);
  const [indo, setIndo] = useState(false);
  const [historico, setHistorico] = useState(false);

  useEffect(() => {
    let vivo = true;
    const carregar = () => Promise.all([
      sb.from("salas").select("memoria").eq("id", salaId).single(),
      sb.from("memoria_versoes").select("id, resumo, user_id, agente, criada_em").eq("sala_id", salaId).order("id", { ascending: false }).limit(50),
    ]).then(([s, v]) => { if (!vivo) return; setTexto((s.data as { memoria: string } | null)?.memoria ?? ""); setVersoes((v.data as Versao[]) ?? []); });
    carregar();
    const canal = sb.channel(`memoria:${salaId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "memoria_versoes", filter: `sala_id=eq.${salaId}` }, carregar)
      .subscribe();
    return () => { vivo = false; sb.removeChannel(canal); };
  }, [salaId]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !editando && !vendo && fechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [fechar, editando, vendo]);

  const autor = (v: Versao) => (v.agente
    ? t(`${v.agente} de ${nome(v.user_id).split(" ")[0]}`, `${nome(v.user_id).split(" ")[0]}'s ${v.agente}`)
    : !v.user_id ? t("The Sala", "The Sala") : v.user_id === eu ? t("você", "you") : nome(v.user_id).split(" ")[0]);

  const salvar = async (novo: string, r: string) => {
    setIndo(true);
    const { error } = await sb.rpc("salvar_memoria", { sala: salaId, texto: novo, resumo: r });
    setIndo(false);
    if (error) { recado(msgErro(error)); return false; }
    setTexto(novo.trim());
    return true;
  };

  const ver = async (v: Versao) => {
    const { data } = await sb.from("memoria_versoes").select("texto").eq("id", v.id).single();
    if (data) setVendo({ id: v.id, texto: (data as { texto: string }).texto });
  };

  const restaurar = async (v: Versao) => {
    const { data } = await sb.from("memoria_versoes").select("texto").eq("id", v.id).single();
    if (!data) return;
    if (await salvar((data as { texto: string }).texto, t(`Voltou para a versão de ${quando(v.criada_em)}`, `Restored the version from ${quando(v.criada_em)}`))) setVendo(null);
  };

  const ultima = versoes[0];
  const sempre = () => false;

  return (
    <aside className="painel painel-memoria" aria-label={t("Memória da sala", "Room memory")}>
      <header className="painel-topo">
        {voltar && <button className="btn-icone" onClick={voltar} aria-label={t("Voltar", "Back")}><IconeVoltar /></button>}
        <h2>{t("Memória da sala", "Room memory")}</h2>
        <div className="painel-topo-acoes">
          {podeEscrever && !editando && texto !== null && (
            <button className="btn btn-pequeno" onClick={() => { setRascunho(texto); setResumo(""); setEditando(true); setVendo(null); }}><IconeLapis tamanho={15} /> {t("Editar", "Edit")}</button>
          )}
          <button className="btn-icone" onClick={fechar} aria-label={t("Fechar memória", "Close memory")}><IconeFechar /></button>
        </div>
      </header>

      <section className="painel-secao">
        <p className="nota">{t("Os agentes mantêm aqui o estado do projeto e quem faz o quê, sem pedir aprovação. Você pode corrigir ou voltar uma versão. As instruções da sala, escritas por vocês, ficam nos ajustes.",
          "Agents keep the project's status and who's doing what here, without asking for approval. You can edit it or restore an earlier version. Room instructions, written by you, are in Room settings.")}</p>
        {ultima && !editando && (
          <p className="memoria-ultima"><span className="pilula">{t("Atualizada", "Updated")} {quando(ultima.criada_em)}</span> {autor(ultima)}{ultima.resumo ? ` · ${ultima.resumo}` : ""}</p>
        )}
      </section>

      {texto === null && <div className="painel-secao"><div className="esqueleto" /><div className="esqueleto" /></div>}

      {editando && (
        <section className="painel-secao">
          <form className="tarefa-form memoria-form" onSubmit={async (e) => { e.preventDefault(); if (await salvar(rascunho, resumo.trim() || t("Editada à mão", "Edited by hand"))) setEditando(false); }}
            onKeyDown={(e) => e.key === "Escape" && setEditando(false)}>
            <textarea autoFocus rows={16} maxLength={50000} value={rascunho} onChange={(e) => setRascunho(e.target.value)} aria-label={t("Memória", "Memory")} />
            <input maxLength={300} value={resumo} onChange={(e) => setResumo(e.target.value)} placeholder={t("O que você mudou? (opcional)", "What did you change? (optional)")} aria-label={t("Resumo da mudança", "Change summary")} />
            <div className="linha campo-acoes">
              <span className="nota">{rascunho.length.toLocaleString(locale())}/{(50000).toLocaleString(locale())}</span>
              <button type="button" className="btn btn-pequeno btn-texto" onClick={() => setEditando(false)}>{t("Cancelar", "Cancel")}</button>
              <button className="btn btn-pequeno btn-cheio" disabled={indo || rascunho.trim() === (texto ?? "").trim()}>{indo ? t("Salvando…", "Saving…") : t("Salvar", "Save")}</button>
            </div>
          </form>
        </section>
      )}

      {texto !== null && !editando && (vendo ? (
        <section className="painel-secao memoria-texto">
          <div className="memoria-versao-topo">
            <span className="pilula">{t("Versão anterior", "Earlier version")}</span>
            <span className="painel-topo-acoes">
              <button className="btn btn-pequeno btn-texto" onClick={() => setVendo(null)}>{t("Ver a atual", "View current")}</button>
              {podeEscrever && <BotaoConfirmar className="btn btn-pequeno" rotulo={t("Voltar para esta", "Restore this version")} aviso={t("A memória volta para esta versão. A atual continua no histórico.", "The memory goes back to this version. The current one stays in the history.")} onConfirmar={() => restaurar(versoes.find((v) => v.id === vendo.id)!)} />}
            </span>
          </div>
          <Texto texto={vendo.texto} chamaMim={sempre} />
        </section>
      ) : texto ? (
        <section className="painel-secao memoria-texto"><Texto texto={texto} chamaMim={sempre} /></section>
      ) : (
        <section className="painel-secao painel-vazio">
          <span className="vazio-icone"><IconeMemoria tamanho={20} /></span>
          <p><strong>{t("A memória está vazia.", "The memory is empty.")}</strong></p>
          <p className="nota">{t("Ela enche na primeira decisão ou entrega: os agentes anotam o que foi decidido, o que está pendente e quem faz o quê. Também dá para escrever à mão.", "It fills in with the first decision or delivery: agents note what's been decided, what's pending and who's doing what. You can also write it by hand.")}</p>
        </section>
      ))}

      {versoes.length > 0 && !editando && (
        <section className="painel-lista painel-fim">
          <button className="secao-rotulo secao-dobra" onClick={() => setHistorico((h) => !h)} aria-expanded={historico}>
            {t("Histórico", "History")} <span>{versoes.length}</span>
          </button>
          {historico && (
            <ul className="linhas">
              {versoes.map((v, i) => (
                <li key={v.id} className={`linha-item ${vendo?.id === v.id ? "ativa" : ""}`}>
                  <span className="linha-texto">
                    <span className="linha-titulo">{v.resumo || t("Sem resumo", "No summary")}</span>
                    <span className="presenca">{autor(v)} · {quando(v.criada_em)}{i === 0 ? ` · ${t("atual", "current")}` : ""}</span>
                  </span>
                  {i > 0 && (
                    <Menu rotulo={t("Ações da versão", "Version actions")} itens={[
                      { rotulo: t("Ver esta versão", "View this version"), acao: () => ver(v) },
                      podeEscrever && { rotulo: t("Voltar para esta", "Restore this version"), acao: () => restaurar(v), confirmar: t("A memória volta para esta versão. A atual continua no histórico.", "The memory goes back to this version. The current one stays in the history.") },
                    ]} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </aside>
  );
}
