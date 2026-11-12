import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { handle } from "./Texto";
import { IconeAgente, IconeArquivo, IconeClipe, IconeEnviar, IconeFechar, IconeMais, IconeProposta, IconeResponder, IconeTarefa } from "./Icones";
import type { Citacao } from "./Bolha";
import { sb, tamanhoLegivel, type Anexo } from "../supabase";
import { erro, t as tr, tc } from "../i18n";

type Subindo = { id: string; nome: string; tamanho: number; previa?: string; anexo?: Anexo; erro?: string };

export type Sugestao = { handle: string; rotulo: string; agente?: boolean; tom?: string; apelidos?: string[] }; // tom: o mesmo anel colorido das mensagens // apelidos: "@all" também acha "@everyone"
export type ComporApi = { focar: () => void; inserir: (t: string) => void; anexar: (fs: File[]) => void };

type Props = {
  sugestoesBase: Sugestao[];
  respondendo: Citacao;
  cancelarResposta: () => void;
  enviar: (texto: string, proposta: boolean, anexos: Anexo[], aprovadores?: string[]) => void;
  subir: (f: File) => Promise<Anexo>;
  pessoas?: { id: string; nome: string }[]; // quem pode aprovar uma proposta
  criarTarefa?: (texto: string) => void; // "+ › Criar tarefa": leva o texto escrito para Tarefas
  vazia?: boolean; // sala sem mensagens: a caixa fica no centro e convida a começar
};

// Barra de escrever: @menção com sugestões, responder a uma mensagem e "fazer proposta".
// O texto de exemplo alterna e ensina um recurso por vez (só enquanto a caixa está vazia)
const dicas = (estreito: boolean) => estreito
  ? [tr("Escreva aqui", "Write a message"), tr("@ chama alguém", "@ to mention someone"), tr(`@${tc("agentes", "agents")} pergunta a todos`, `@${tc("agentes", "agents")} asks every agent`)]
  : [
    tr("Escreva aqui · @ chama alguém", "Write a message · @ to mention someone"),
    tr(`@${tc("agentes", "agents")} pergunta a todos os agentes de uma vez`, `@${tc("agentes", "agents")} asks every agent at once`),
    tr("Arraste ou cole um arquivo para anexar", "Drag or paste a file to attach it"),
    tr("Precisa de um sim? Use Propor", "Need a yes? Use Propose"),
  ];

export const Compor = forwardRef<ComporApi, Props>(function Compor({ sugestoesBase, respondendo, cancelarResposta, enviar, subir, pessoas = [], criarTarefa, vazia }, ref) {
  const [texto, setTexto] = useState("");
  const [proposta, setProposta] = useState(false);
  const [aprovam, setAprovam] = useState<string[]>([]); // vazio = a regra da sala
  const [busca, setBusca] = useState<string | null>(null); // texto depois do @ que está sendo digitado
  const [escolha, setEscolha] = useState(0);
  const caixa = useRef<HTMLTextAreaElement>(null);
  const cursorPendente = useRef<number | null>(null);
  const seletor = useRef<HTMLInputElement>(null);
  const [arquivos, setArquivos] = useState<Subindo[]>([]);
  const [estreito] = useState(() => window.matchMedia("(max-width: 480px)").matches);
  const [dica, setDica] = useState(0);
  const [mais, setMais] = useState(false);
  const maisRef = useRef<HTMLDivElement>(null);
  const listaDicas = dicas(estreito);
  useEffect(() => {
    if (texto || proposta) return;
    const id = window.setInterval(() => setDica((d) => (d + 1) % listaDicas.length), 4500);
    return () => window.clearInterval(id);
  }, [texto, proposta, listaDicas.length]);
  useEffect(() => {
    if (!mais) return;
    maisRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    const fora = (e: PointerEvent) => { if (!maisRef.current?.contains(e.target as Node)) setMais(false); };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); setMais(false); caixa.current?.focus(); }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const bs = [...(maisRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
        const i = bs.indexOf(document.activeElement as HTMLButtonElement);
        bs[(i + (e.key === "ArrowDown" ? 1 : -1) + bs.length) % bs.length]?.focus();
      }
    };
    document.addEventListener("pointerdown", fora, true);
    document.addEventListener("keydown", tecla, true);
    return () => { document.removeEventListener("pointerdown", fora, true); document.removeEventListener("keydown", tecla, true); };
  }, [mais]);
  const enviando = arquivos.some((a) => !a.anexo && !a.erro);
  const prontos = arquivos.filter((a) => a.anexo).map((a) => a.anexo!);

  const anexar = (fs: File[]) => {
    const novos = fs.slice(0, 10 - arquivos.length).map((f) => ({
      id: crypto.randomUUID(), nome: f.name || tr("arquivo", "file"), tamanho: f.size,
      previa: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined, f,
    }));
    setArquivos((a) => [...a, ...novos.map(({ f: _f, ...x }) => x)]); // eslint-disable-line @typescript-eslint/no-unused-vars
    novos.forEach(({ id, f }) => subir(f)
      .then((anexo) => setArquivos((a) => a.map((x) => (x.id === id ? { ...x, anexo } : x))))
      .catch((e) => setArquivos((a) => a.map((x) => (x.id === id ? { ...x, erro: erro(e) } : x)))));
    caixa.current?.focus();
  };

  const ajustarAltura = () => {
    const c = caixa.current;
    if (c) { c.style.height = "auto"; c.style.height = `${Math.min(c.scrollHeight, 200)}px`; }
  };

  useImperativeHandle(ref, () => ({
    anexar,
    focar: () => caixa.current?.focus(),
    inserir: (t: string) => {
      const novo = texto && !texto.endsWith(" ") ? `${texto} ${t}` : texto + t;
      cursorPendente.current = novo.length;
      setTexto(novo);
    },
  }), [texto, arquivos]); // eslint-disable-line react-hooks/exhaustive-deps

  // depois de escolher uma @menção, o cursor vai para logo depois dela, no mesmo ciclo da tela
  useLayoutEffect(() => {
    const c = caixa.current;
    if (c && cursorPendente.current !== null) {
      c.focus();
      c.setSelectionRange(cursorPendente.current, cursorPendente.current);
      cursorPendente.current = null;
    }
    ajustarAltura();
  }, [texto]);

  const sugestoes = useMemo(() => {
    if (busca === null) return [];
    const b = handle(busca);
    return sugestoesBase.filter((s) => s.handle && [s.handle, ...(s.apelidos ?? [])].some((h) => handle(h).startsWith(b))).slice(0, 6);
  }, [busca, sugestoesBase]);

  const acharBusca = (valor: string, cursor: number) => {
    const m = valor.slice(0, cursor).match(/(?:^|\s)@([\p{L}\p{N}_-]*)$/u);
    setBusca(m ? m[1] : null);
    setEscolha(0);
  };

  const escolher = (s: Sugestao) => {
    const c = caixa.current;
    if (!c) return;
    const cursor = c.selectionStart;
    const antes = texto.slice(0, cursor).replace(/@([\p{L}\p{N}_-]*)$/u, `@${s.handle} `);
    cursorPendente.current = antes.length;
    setTexto(antes + texto.slice(cursor)); setBusca(null);
  };

  // "@agentes " no começo do que já está escrito (ou sozinho, se vazio), com o cursor no fim
  const inserirNoInicio = (pre: string) => {
    const novo = texto.startsWith(pre) ? texto : pre + texto;
    cursorPendente.current = novo.length;
    setTexto(novo);
  };

  const mandar = () => {
    const t = texto.trim();
    if ((!t && !prontos.length) || enviando) return;
    enviar(t, proposta, prontos, proposta ? aprovam : undefined);
    arquivos.forEach((a) => a.previa && URL.revokeObjectURL(a.previa));
    setTexto(""); setBusca(null); setProposta(false); setArquivos([]); setAprovam([]);
  };

  return (
    <form className={`compor ${vazia ? "compor-vazia" : ""}`} data-guia="compor" onSubmit={(e) => { e.preventDefault(); mandar(); }}>
      {sugestoes.length > 0 && (
        <ul className="sugestoes" role="listbox" aria-label={tr("Mencionar", "Mention")}>
          {sugestoes.map((s, i) => (
            <li key={`${s.handle}-${i}`} role="option" aria-selected={i === escolha}>
              <button type="button" className={i === escolha ? "ativa" : ""} onMouseDown={(e) => { e.preventDefault(); escolher(s); }}>
                {s.agente ? <span className={`sug-anel ${s.tom ?? ""}`}><IconeAgente tamanho={16} /></span> : <span className="avatar avatar-mini">{s.handle[0]?.toUpperCase()}</span>}
                <span className="sug-handle">@{s.handle}</span>
                <span className="sug-rotulo">{s.rotulo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={`compor-caixa ${proposta ? "compor-proposta" : ""}`} onClick={() => caixa.current?.focus()}>
        {arquivos.length > 0 && (
          <ul className="compor-arquivos" aria-label={tr("Arquivos para enviar", "Files to send")}>
            {arquivos.map((a) => (
              <li key={a.id} className={a.erro ? "erro" : a.anexo ? "" : "subindo"} title={a.erro ?? a.nome}>
                {a.previa ? <img src={a.previa} alt="" /> : <span className="anexo-icone" aria-hidden><IconeArquivo tamanho={16} /></span>}
                <span className="anexo-info"><strong>{a.nome}</strong>
                  <span className="nota">{a.erro ? tr("Não enviou", "Upload failed") : a.anexo ? tamanhoLegivel(a.tamanho) : tr("Enviando…", "Uploading…")}</span></span>
                <button type="button" className="btn-acao" aria-label={tr(`Tirar ${a.nome}`, `Remove ${a.nome}`)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (a.anexo) sb.storage.from("arquivos").remove([a.anexo.path]); // não fica guardado sem uso
                    setArquivos((x) => x.filter((y) => y.id !== a.id));
                  }}><IconeFechar tamanho={14} /></button>
              </li>
            ))}
          </ul>
        )}
        {(respondendo || proposta) && (
          <div className="compor-topo">
            {respondendo && (
              <span className="compor-chip">
                <IconeResponder tamanho={14} /> {tr("Respondendo a", "Replying to")} <strong>{respondendo.autor}</strong>
                <span className="compor-chip-texto">{respondendo.texto}</span>
                <button type="button" className="btn-acao" onClick={(e) => { e.stopPropagation(); cancelarResposta(); }} aria-label={tr("Não responder", "Cancel reply")}><IconeFechar tamanho={14} /></button>
              </span>
            )}
            {proposta && (
              <span className="compor-chip">
                <IconeProposta tamanho={14} /> <strong>{tr("Proposta", "Proposal")}</strong> · {aprovam.length ? tr("só decide quem você marcou", "only the people you chose can decide") : tr("as pessoas da sala aprovam ou recusam", "people in the room will approve or decline")}
              </span>
            )}
            {proposta && pessoas.length > 1 && (
              <span className="compor-aprovam" role="group" aria-label={tr("Quem aprova", "Who approves")}>
                <span className="nota">{tr("Quem aprova:", "Who approves:")}</span>
                <button type="button" className={`chip-opcao ${aprovam.length ? "" : "ativo"}`} aria-pressed={!aprovam.length}
                  onClick={(e) => { e.stopPropagation(); setAprovam([]); }}>{tr("Regra da sala", "Room default")}</button>
                {pessoas.map((x) => {
                  const on = aprovam.includes(x.id);
                  return <button key={x.id} type="button" className={`chip-opcao ${on ? "ativo" : ""}`} aria-pressed={on}
                    onClick={(e) => { e.stopPropagation(); setAprovam((a) => (on ? a.filter((y) => y !== x.id) : [...a, x.id])); }}>{x.nome}</button>;
                })}
              </span>
            )}
          </div>
        )}
        <label className="sr" htmlFor="texto">{tr("Mensagem", "Message")}</label>
        <textarea id="texto" ref={caixa} rows={vazia ? 2 : 1} value={texto}
          placeholder={proposta
            ? (estreito ? tr("O que você propõe?", "What are you proposing?") : tr("O que você propõe? Diga o que muda.", "What are you proposing? Describe the change."))
            : vazia && !estreito ? tr("Escreva a primeira mensagem · @ chama alguém", "Write the first message · @ to mention someone") : listaDicas[dica % listaDicas.length]}
          onChange={(e) => { setTexto(e.target.value); acharBusca(e.target.value, e.target.selectionStart); }}
          onBlur={() => setBusca(null)}
          onPaste={(e) => { const fs = [...e.clipboardData.files]; if (fs.length) { e.preventDefault(); anexar(fs); } }}
          onKeyDown={(e) => {
            if (sugestoes.length) {
              if (e.key === "ArrowDown") { e.preventDefault(); setEscolha((i) => (i + 1) % sugestoes.length); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setEscolha((i) => (i - 1 + sugestoes.length) % sugestoes.length); return; }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); escolher(sugestoes[escolha]); return; }
              if (e.key === "Escape") { e.preventDefault(); setBusca(null); return; }
            }
            if (e.key === "Escape" && (respondendo || proposta)) { e.preventDefault(); cancelarResposta(); setProposta(false); return; }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); mandar(); }
          }} />
        <div className="compor-barra">
          <input ref={seletor} type="file" multiple hidden onChange={(e) => { anexar([...(e.target.files ?? [])]); e.target.value = ""; }} />
          <div className={`menu-ancora compor-mais ${mais ? "aberto" : ""}`} ref={maisRef}>
            <button type="button" className="btn-acao btn-mais-compor" aria-haspopup="menu" aria-expanded={mais}
              aria-label={tr("Mais: anexar, perguntar a todos, propor, criar tarefa", "More: attach, ask everyone, propose, create task")} title={tr("Anexar, propor e mais", "Attach, propose and more")}
              onClick={(e) => { e.stopPropagation(); setMais((v) => !v); }}><IconeMais tamanho={18} /></button>
            {mais && (
              <div className="menu menu-rico menu-cima" role="menu" onClick={(e) => e.stopPropagation()}>
                <button type="button" role="menuitem" onClick={() => { setMais(false); seletor.current?.click(); }}>
                  <IconeClipe tamanho={16} /><span><strong>{tr("Anexar arquivo", "Attach a file")}</strong><span>{tr("Até 10 MB. Também dá para arrastar ou colar.", "Up to 10 MB. You can also drag or paste it.")}</span></span>
                </button>
                <button type="button" role="menuitem" onClick={() => { setMais(false); inserirNoInicio(`@${tc("agentes", "agents")} `); }}>
                  <IconeAgente tamanho={16} /><span><strong>{tr("Perguntar a todos os agentes", "Ask every agent")}</strong><span>{tr("Cada um responde e você compara lado a lado.", "Each one answers and you compare them side by side.")}</span></span>
                </button>
                <button type="button" role="menuitem" onClick={() => { setMais(false); setProposta(true); caixa.current?.focus(); }}>
                  <IconeProposta tamanho={16} /><span><strong>{tr("Fazer uma proposta", "Make a proposal")}</strong><span>{tr("As pessoas aprovam ou recusam, e fica registrado.", "People approve or decline, and it's kept on record.")}</span></span>
                </button>
                {criarTarefa && (
                  <button type="button" role="menuitem" onClick={() => { setMais(false); criarTarefa(texto.trim()); setTexto(""); }}>
                    <IconeTarefa tamanho={16} /><span><strong>{tr("Criar tarefa", "Create a task")}</strong><span>{texto.trim() ? tr("Com o que você escreveu, para alguém ou um agente.", "From what you wrote, for a person or an agent.") : tr("Para alguém da sala ou um agente, com prazo.", "For someone in the room or an agent, with a due date.")}</span></span>
                  </button>
                )}
              </div>
            )}
          </div>
          <button type="button" className={`btn-acao btn-propor ${proposta ? "ativo" : ""}`} aria-pressed={proposta}
            onClick={(e) => { e.stopPropagation(); setProposta((v) => !v); caixa.current?.focus(); }}
            title={proposta ? tr("Voltar a mensagem comum", "Switch back to a regular message") : tr("Fazer uma proposta: pedir que as pessoas aprovem ou recusem", "Make a proposal: ask people to approve or decline")}>
            <IconeProposta tamanho={16} /><span>{proposta ? tr("Proposta", "Proposal") : tr("Propor", "Propose")}</span>
          </button>
          <span className="compor-espaco" />
          <span className="compor-atalho some-celular" aria-hidden><kbd>Enter</kbd> {tr("envia", "to send")} · <kbd>Shift</kbd> <kbd>Enter</kbd> {tr("quebra linha", "new line")}</span>
          <button className="btn-enviar" disabled={(!texto.trim() && !prontos.length) || enviando} title={proposta ? tr("Propor (Enter)", "Propose (Enter)") : tr("Enviar (Enter)", "Send (Enter)")} aria-label={proposta ? tr("Enviar proposta", "Send proposal") : tr("Enviar", "Send")}>
            <IconeEnviar tamanho={18} />
          </button>
        </div>
      </div>
    </form>
  );
});
