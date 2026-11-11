import { useEffect, useRef, useState } from "react";
import { copiarTexto, linksDe, sb, subirArquivo, tamanhoLegivel, LIMITE_ARQUIVO } from "../supabase";
import { IconeArquivo, IconeBiblioteca, IconeFechar, IconeLink, IconeMais, IconeMemoria, IconeVoltar } from "./Icones";
import { Menu } from "./Menu";
import { erro as msgErro, locale, t } from "../i18n";
import { recado } from "./Recados";
import { indicador } from "./indicador";

export type ItemBiblioteca = {
  id: number; sala_id: string; user_id: string; agente: string | null; tipo: "arquivo" | "link";
  titulo: string; nota: string | null; url: string | null; path: string | null; nome: string | null; mime: string | null; tamanho: number | null; criado_em: string;
};

type Props = { salaId: string; eu: string; podeEscrever: boolean; nome: (uid: string | null) => string; fechar: () => void; abrirMemoria?: () => void; irPara?: (id: number) => void };
type ArquivoConversa = { mensagem: number; path: string; nome: string; tamanho: number; quem: string; criada_em: string };

const dominio = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const extensao = (n: string | null) => (n?.includes(".") ? n.split(".").pop()!.toUpperCase().slice(0, 5) : t("Arquivo", "File"));
const data = (iso: string) => new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short" }).replace(".", "");

// Biblioteca da sala: arquivos e links de referência. Pessoas e agentes adicionam, editam e tiram;
// os agentes leem daqui antes de responder.
export function Biblioteca({ salaId, eu, podeEscrever, nome, fechar, abrirMemoria, irPara }: Props) {
  const [daConversa, setDaConversa] = useState<ArquivoConversa[] | null>(null);
  const [verConversa, setVerConversa] = useState(false);
  // tudo o que foi anexado na conversa, do mais novo para o mais velho
  useEffect(() => {
    sb.from("mensagens").select("id, user_id, agente, anexos, criada_em").eq("sala_id", salaId).eq("apagada", false).neq("anexos", "[]")
      .order("id", { ascending: false }).limit(60)
      .then(({ data: d }) => setDaConversa(((d ?? []) as { id: number; user_id: string; agente: string | null; anexos: { path: string; nome: string; tamanho: number }[]; criada_em: string }[])
        .flatMap((m) => (m.anexos ?? []).map((a) => ({ mensagem: m.id, path: a.path, nome: a.nome, tamanho: a.tamanho, criada_em: m.criada_em,
          quem: m.agente ? t(`${m.agente} de ${nome(m.user_id).split(" ")[0]}`, `${nome(m.user_id).split(" ")[0]}'s ${m.agente}`) : m.user_id === eu ? t("você", "you") : nome(m.user_id).split(" ")[0] })))));
  }, [salaId]); // eslint-disable-line react-hooks/exhaustive-deps
  const baixar = async (a: ArquivoConversa) => {
    const janela = window.open("", "_blank");
    const url = (await linksDe([a.path], true))[a.path];
    if (janela && url) janela.location.href = url; else janela?.close();
  };
  const [itens, setItens] = useState<ItemBiblioteca[] | null>(null);
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;
    const carregar = () => sb.from("biblioteca").select("*").eq("sala_id", salaId).order("id", { ascending: false }).limit(500)
      .then(({ data: d }) => vivo && setItens((d as ItemBiblioteca[]) ?? []));
    carregar();
    const canal = sb.channel(`biblioteca:${salaId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "biblioteca", filter: `sala_id=eq.${salaId}` }, carregar)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "biblioteca" }, carregar)
      .subscribe();
    return () => { vivo = false; sb.removeChannel(canal); };
  }, [salaId]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !novo && editando === null && fechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [fechar, novo, editando]);

  const autor = (b: ItemBiblioteca) => (b.agente
    ? t(`${b.agente} de ${nome(b.user_id).split(" ")[0]}`, `${nome(b.user_id).split(" ")[0]}'s ${b.agente}`)
    : b.user_id === eu ? t("você", "you") : nome(b.user_id).split(" ")[0]);

  const abrir = async (b: ItemBiblioteca) => {
    if (b.url) return window.open(b.url, "_blank", "noopener");
    const janela = window.open("", "_blank");
    const url = (await linksDe([b.path!]))[b.path!];
    if (janela && url) janela.location.href = url; else janela?.close();
  };

  const tirar = async (b: ItemBiblioteca) => {
    const { data: path, error } = await sb.rpc("apagar_biblioteca", { item: b.id });
    if (error) return recado(msgErro(error));
    if (path && (path as string).split("/")[1] === eu) sb.storage.from("arquivos").remove([path as string]).then(() => {});
    setItens((xs) => xs?.filter((x) => x.id !== b.id) ?? xs);
  };

  return (
    <aside className="painel" aria-label={t("Biblioteca da sala", "Room library")}>
      <header className="painel-topo">
        <h2>{t("Biblioteca", "Library")}</h2>
        <div className="painel-topo-acoes">
          {podeEscrever && !novo && <button className="btn btn-pequeno" onClick={() => { setNovo(true); setEditando(null); }}><IconeMais tamanho={16} /> {t("Adicionar", "Add")}</button>}
          <button className="btn-icone" onClick={fechar} aria-label={t("Fechar biblioteca", "Close library")}><IconeFechar /></button>
        </div>
      </header>

      {abrirMemoria && !novo && (
        <section className="painel-secao">
          <button className="cartao-memoria" onClick={abrirMemoria}>
            <span className="avatar item-icone" aria-hidden><IconeMemoria tamanho={16} /></span>
            <span className="linha-texto">
              <span className="linha-titulo">{t("Memória da sala", "Room memory")}</span>
              <span className="presenca">{t("O estado do projeto e quem faz o quê, mantidos pelos agentes", "Project status and who's doing what, kept up to date by agents")}</span>
            </span>
          </button>
        </section>
      )}

      {novo && <section className="painel-secao"><Novo salaId={salaId} eu={eu} pronto={() => setNovo(false)} /></section>}

      {!novo && !!daConversa?.length && (
        <section className="painel-lista">
          <button className="secao-rotulo secao-dobra" aria-expanded={verConversa} onClick={() => setVerConversa((v) => !v)}>
            <IconeVoltar tamanho={14} /> {t("Arquivos da conversa", "Files from the chat")} <span>{daConversa.length}</span>
          </button>
          {verConversa && (
            <ul className="linhas">
              {daConversa.map((a) => (
                <li key={a.path} className="linha-item">
                  <span className="avatar item-icone" aria-hidden><IconeArquivo tamanho={16} /></span>
                  <span className="linha-texto">
                    <button type="button" className="item-titulo linha-titulo" onClick={() => baixar(a)} title={t(`Baixar ${a.nome}`, `Download ${a.nome}`)}>{a.nome}</button>
                    <span className="presenca">{a.quem} · {data(a.criada_em)} · {tamanhoLegivel(a.tamanho)}</span>
                  </span>
                  {irPara && <Menu rotulo={t(`Ações de ${a.nome}`, `Actions for ${a.nome}`)} itens={[{ rotulo: t("Ver na conversa", "View in chat"), acao: () => irPara(a.mensagem) }]} />}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {itens === null && <div className="painel-secao"><div className="esqueleto" /><div className="esqueleto" /></div>}

      {itens && !itens.length && !novo && (
        <section className="painel-secao painel-vazio">
          <span className="vazio-icone"><IconeBiblioteca tamanho={20} /></span>
          <p><strong>{t("Nada na biblioteca ainda.", "Nothing in the library yet.")}</strong></p>
          <p className="nota">{t("Guarde aqui documentos e links de referência da sala: especificação, pesquisa, planilha, site do cliente. Os agentes consultam a biblioteca e também podem adicionar, editar e tirar itens.",
            "Keep the room's reference docs and links here: specs, research, spreadsheets, the client's website. Agents consult the library and can add, edit and remove items too.")}</p>
        </section>
      )}

      {itens && itens.length > 0 && (
        <section className="painel-lista painel-fim">
          <h3 className="secao-rotulo">{t("Itens", "Items")} <span>{itens.length}</span></h3>
          <ul className="linhas biblioteca">
            {itens.map((b) => (
              <li key={b.id} className="linha-item item-biblioteca">
                {editando === b.id ? (
                  <Edicao item={b} pronto={() => setEditando(null)} />
                ) : (
                  <>
                    <span className={`avatar item-icone ${b.tipo === "link" ? "item-link" : ""}`} aria-hidden>
                      {b.tipo === "link" ? <IconeLink tamanho={16} /> : <IconeArquivo tamanho={16} />}
                    </span>
                    <span className="linha-texto">
                      <button className="linha-titulo item-titulo" onClick={() => abrir(b)} title={t("Abrir", "Open")}>{b.titulo}</button>
                      <span className="presenca">
                        {b.tipo === "link" ? dominio(b.url!) : `${extensao(b.nome)}${b.tamanho ? ` · ${tamanhoLegivel(b.tamanho)}` : ""}`} · {autor(b)} · {data(b.criado_em)}
                      </span>
                      {b.nota && <span className="item-nota">{b.nota}</span>}
                    </span>
                    <Menu rotulo={t(`Ações de ${b.titulo}`, `Actions for ${b.titulo}`)} itens={[
                      { rotulo: t("Abrir", "Open"), acao: () => abrir(b) },
                      b.tipo === "link" && { rotulo: t("Copiar link", "Copy link"), acao: () => copiarTexto(b.url!) },
                      podeEscrever && { rotulo: t("Editar título e nota", "Edit title and note"), acao: () => { setEditando(b.id); setNovo(false); } },
                      podeEscrever && { rotulo: t("Tirar da biblioteca", "Remove from library"), acao: () => tirar(b), perigo: true, confirmar: t("Os agentes deixam de ver este item.", "Agents will no longer see this item.") },
                    ]} />
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

function Novo({ salaId, eu, pronto }: { salaId: string; eu: string; pronto: () => void }) {
  const [tipo, setTipo] = useState<"link" | "arquivo">("link");
  const [url, setUrl] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [titulo, setTitulo] = useState("");
  const [nota, setNota] = useState("");
  const [erro, setErro] = useState("");
  const [indo, setIndo] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  const linkOk = /^https?:\/\/\S+\.\S+/i.test(url.trim()) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(url.trim());
  const pronto_ = tipo === "link" ? linkOk : !!arquivo;

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pronto_ || indo) return;
    setIndo(true); setErro("");
    try {
      if (tipo === "link") {
        const u = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
        const { error } = await sb.from("biblioteca").insert({ sala_id: salaId, user_id: eu, tipo: "link", url: u, titulo: (titulo.trim() || dominio(u)).slice(0, 200), nota: nota.trim() || null });
        if (error) throw error;
      } else {
        const a = await subirArquivo(salaId, eu, arquivo!);
        const { error } = await sb.from("biblioteca").insert({ sala_id: salaId, user_id: eu, tipo: "arquivo", path: a.path, nome: a.nome, mime: a.tipo, tamanho: a.tamanho,
          titulo: (titulo.trim() || a.nome.replace(/\.[^.]+$/, "")).slice(0, 200), nota: nota.trim() || null });
        if (error) { sb.storage.from("arquivos").remove([a.path]).then(() => {}); throw error; }
      }
      pronto();
    } catch (er) { setErro(msgErro(er)); setIndo(false); }
  };

  return (
    <form className="tarefa-form integracao-form biblioteca-form" onSubmit={salvar} onKeyDown={(e) => e.key === "Escape" && pronto()}>
      <div className="abas abas-mini" ref={indicador} role="tablist" aria-label={t("Tipo", "Type")}>
        <button type="button" role="tab" aria-selected={tipo === "link"} className={tipo === "link" ? "aba ativa" : "aba"} onClick={() => setTipo("link")}><IconeLink tamanho={14} /> Link</button>
        <button type="button" role="tab" aria-selected={tipo === "arquivo"} className={tipo === "arquivo" ? "aba ativa" : "aba"} onClick={() => setTipo("arquivo")}><IconeArquivo tamanho={14} /> {t("Arquivo", "File")}</button>
      </div>
      {tipo === "link" ? (
        <>
          <label className="sr" htmlFor="bib-url">{t("Endereço", "URL")}</label>
          <input id="bib-url" autoFocus type="url" inputMode="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        </>
      ) : (
        <label className={`soltar ${arquivo ? "com-arquivo" : ""}`}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setArquivo(f); }}>
          <input ref={campo} type="file" className="sr" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
          <IconeArquivo tamanho={18} />
          {arquivo ? <span><strong>{arquivo.name}</strong> · {tamanhoLegivel(arquivo.size)}</span>
            : <span>{t("Escolha ou solte um arquivo", "Choose or drop a file")} <span className="nota">· {t("até", "up to")} {tamanhoLegivel(LIMITE_ARQUIVO)}</span></span>}
        </label>
      )}
      <label className="sr" htmlFor="bib-titulo">{t("Título", "Title")}</label>
      <input id="bib-titulo" maxLength={200} placeholder={t("Título (opcional)", "Title (optional)")} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      <label className="sr" htmlFor="bib-nota">{t("Nota", "Note")}</label>
      <textarea id="bib-nota" rows={2} maxLength={2000} placeholder={t("Para que serve? Os agentes leem esta nota. (opcional)", "What's it for? Agents read this note. (optional)")} value={nota} onChange={(e) => setNota(e.target.value)} />
      {erro && <p className="nota erro" role="alert">{erro}</p>}
      <div className="linha campo-acoes">
        <button type="button" className="btn btn-pequeno btn-texto" onClick={pronto}>{t("Cancelar", "Cancel")}</button>
        <button className="btn btn-pequeno btn-cheio" disabled={!pronto_ || indo}>{indo ? t("Adicionando…", "Adding…") : t("Adicionar", "Add")}</button>
      </div>
    </form>
  );
}

function Edicao({ item, pronto }: { item: ItemBiblioteca; pronto: () => void }) {
  const [titulo, setTitulo] = useState(item.titulo);
  const [nota, setNota] = useState(item.nota ?? "");
  const [indo, setIndo] = useState(false);
  return (
    <form className="tarefa-form biblioteca-edicao" onSubmit={async (e) => {
      e.preventDefault(); setIndo(true);
      const { error } = await sb.rpc("editar_biblioteca", { item: item.id, titulo: titulo.trim(), nota });
      setIndo(false);
      if (error) return recado(msgErro(error));
      pronto();
    }} onKeyDown={(e) => e.key === "Escape" && pronto()}>
      <input autoFocus maxLength={200} value={titulo} onChange={(e) => setTitulo(e.target.value)} aria-label={t("Título", "Title")} />
      <textarea rows={2} maxLength={2000} value={nota} placeholder={t("Nota (opcional)", "Note (optional)")} onChange={(e) => setNota(e.target.value)} aria-label={t("Nota", "Note")} />
      <div className="linha campo-acoes">
        <button type="button" className="btn btn-pequeno btn-texto" onClick={pronto}>{t("Cancelar", "Cancel")}</button>
        <button className="btn btn-pequeno btn-cheio" disabled={!titulo.trim() || indo}>{t("Salvar", "Save")}</button>
      </div>
    </form>
  );
}
