import type { ReactNode } from "react";

// Markdown leve, montado como elementos React (nunca innerHTML): parágrafos, listas, citação,
// bloco de código, `código`, **negrito**, *itálico*, links e @menções.

// handle: a mesma comparação de nomes do servidor ("Claude Code" = "ClaudeCode")
export { handle } from "../../../supabase/functions/_shared/agentes";

// Menções coletivas, em português e em inglês: @agentes = @agents; @todos = @everyone = @all.
export const AGENTES = ["agentes", "agents"];
export const TODOS = ["todos", "everyone", "all"];
/** O handle (já normalizado) chama todos os agentes da sala. */
export const chamaAgentes = (h: string) => AGENTES.includes(h);
/** O handle (já normalizado) chama todo mundo, pessoas e agentes. */
export const chamaTodos = (h: string) => TODOS.includes(h);
/** Texto com @agentes/@todos (ou @agents/@everyone/@all) como menção inteira. */
export const MENCAO_COLETIVA = new RegExp(`@(${[...AGENTES, ...TODOS].join("|")})(?![\\p{L}\\p{N}_])`, "iu");

const INLINE =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s\n][^*\n]*\*|(?<![\p{L}\p{N}_])_[^_\s\n][^_\n]*_(?![\p{L}\p{N}_]))|(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])|(@[\p{L}\p{N}_]+(?:[·.][\p{L}\p{N}_]+)*(?:-[\p{L}\p{N}_]+)?)|((?<![\p{L}\p{N}_&/])#\d{1,7}(?![\p{L}\p{N}_]))/gu;

// "#142" no texto (agentes citam mensagens pelo número): vira um link com o nome de quem escreveu
// só vira link quando é uma mensagem desta sala; "#12" de uma tarefa ou de outro lugar fica como texto
export type RefMsg = { rotulo: (id: number) => string | null; ir: (id: number) => void };

function inline(texto: string, chamaMim: (m: string) => boolean, chave: string, ref?: RefMsg): ReactNode[] {
  const out: ReactNode[] = [];
  let ultimo = 0;
  let i = 0;
  for (const m of texto.matchAll(INLINE)) {
    const ini = m.index ?? 0;
    if (ini > ultimo) out.push(texto.slice(ultimo, ini));
    const k = `${chave}-${i++}`;
    const [tudo, codigo, negrito, italico, link, mencao, numero] = m;
    if (codigo) out.push(<code key={k}>{codigo.slice(1, -1)}</code>);
    else if (negrito) out.push(<strong key={k}>{inline(negrito.slice(2, -2), chamaMim, k, ref)}</strong>);
    else if (italico) out.push(<em key={k}>{italico.slice(1, -1)}</em>);
    else if (link) out.push(<a key={k} href={link} target="_blank" rel="noopener noreferrer">{link.replace(/^https?:\/\//, "")}</a>);
    else if (mencao) out.push(<span key={k} className={chamaMim(mencao) ? "mencao mencao-eu" : "mencao"}>{mencao}</span>);
    else if (numero && ref) { const id = Number(numero.slice(1)); const r = ref.rotulo(id); out.push(r ? <button key={k} type="button" className="ref-msg" onClick={() => ref.ir(id)}>{r}</button> : numero); }
    else out.push(tudo);
    ultimo = ini + tudo.length;
  }
  if (ultimo < texto.length) out.push(texto.slice(ultimo));
  return out;
}

type Bloco =
  | { tipo: "p" | "quote"; linhas: string[] }
  | { tipo: "ul" | "ol"; itens: string[] }
  | { tipo: "code"; texto: string }
  | { tipo: "h"; texto: string };

function blocos(texto: string): Bloco[] {
  const out: Bloco[] = [];
  const linhas = texto.replace(/\r/g, "").split("\n");
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (/^\s*```/.test(l)) {
      const corpo: string[] = [];
      for (i++; i < linhas.length && !/^\s*```/.test(linhas[i]); i++) corpo.push(linhas[i]);
      out.push({ tipo: "code", texto: corpo.join("\n") });
      continue;
    }
    const ul = l.match(/^\s*[-*•]\s+(.*)$/);
    const ol = l.match(/^\s*\d+[.)]\s+(.*)$/);
    const ult = out[out.length - 1];
    if (ul) { ult?.tipo === "ul" ? ult.itens.push(ul[1]) : out.push({ tipo: "ul", itens: [ul[1]] }); continue; }
    if (ol) { ult?.tipo === "ol" ? ult.itens.push(ol[1]) : out.push({ tipo: "ol", itens: [ol[1]] }); continue; }
    const h = l.match(/^#{1,4}\s+(.*)$/);
    if (h) { out.push({ tipo: "h", texto: h[1] }); continue; }
    const q = l.match(/^>\s?(.*)$/);
    if (q) { ult?.tipo === "quote" ? ult.linhas.push(q[1]) : out.push({ tipo: "quote", linhas: [q[1]] }); continue; }
    if (!l.trim()) { out.push({ tipo: "p", linhas: [] }); continue; }
    if (ult?.tipo === "p" && ult.linhas.length) ult.linhas.push(l);
    else out.push({ tipo: "p", linhas: [l] });
  }
  return out.filter((b) => !(b.tipo === "p" && !b.linhas.length));
}

export function Texto({ texto, chamaMim, refMsg }: { texto: string; chamaMim: (mencao: string) => boolean; refMsg?: RefMsg }) {
  return (
    <>
      {blocos(texto).map((b, i) => {
        const k = `b${i}`;
        const linhas = (ls: string[]) => ls.flatMap((l, j) => (j ? [<br key={`${k}br${j}`} />, ...inline(l, chamaMim, `${k}l${j}`, refMsg)] : inline(l, chamaMim, `${k}l${j}`, refMsg)));
        switch (b.tipo) {
          case "code": return <pre key={k}><code>{b.texto}</code></pre>;
          case "ul": return <ul key={k}>{b.itens.map((t, j) => <li key={j}>{inline(t, chamaMim, `${k}i${j}`, refMsg)}</li>)}</ul>;
          case "ol": return <ol key={k}>{b.itens.map((t, j) => <li key={j}>{inline(t, chamaMim, `${k}i${j}`, refMsg)}</li>)}</ol>;
          case "h": return <p key={k}><strong>{inline(b.texto, chamaMim, k, refMsg)}</strong></p>;
          case "quote": return <blockquote key={k}>{linhas(b.linhas)}</blockquote>;
          default: return <p key={k}>{linhas(b.linhas)}</p>;
        }
      })}
    </>
  );
}
