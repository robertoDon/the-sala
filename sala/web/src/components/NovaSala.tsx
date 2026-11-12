import { useEffect, useState } from "react";
import { useFocoPreso } from "./foco";
import { useNavigate } from "react-router-dom";
import { sb } from "../supabase";
import { erro as traduzir, t } from "../i18n";
import { IconeFechar } from "./Icones";

// Modelos: um ponto de partida para o contexto que os agentes leem. Tudo editável depois.
// Função (e não constante) para seguir o idioma escolhido.
export const modelos = () => [
  { id: "branco", titulo: t("Em branco", "Blank"), texto: t("Comece do zero e escreva as instruções depois.", "Start from scratch and write the instructions later."), nome: "", contexto: "" },
  {
    id: "lancamento", titulo: t("Lançamento", "Launch"), texto: t("Produto, data, preço e o que falta.", "Product, date, pricing and what's left to do."), nome: t("Lançamento", "Launch"),
    contexto: t(
      "Objetivo: lançar [o quê] até [data].\nO que já está decidido: [preço, público, canais].\nQuem decide: [nomes]. Preço, data e qualquer publicação passam por proposta.\nAgentes: respostas curtas, com números e o próximo passo de cada um.",
      "Goal: launch [what] by [date].\nAlready decided: [price, audience, channels].\nWho decides: [names]. Price, date and anything that gets published go through a proposal.\nAgents: keep answers short, with numbers and each person's next step.",
    ),
  },
  {
    id: "cliente", titulo: t("Cliente ou projeto", "Client or project"), texto: t("Escopo, prazo e o que pode sair para o cliente.", "Scope, due date and what can go out to the client."), nome: t("Projeto", "Project"),
    contexto: t(
      "Cliente: [nome]. Projeto: [o que será entregue].\nPrazo: [data]. Orçamento: [valor].\nTom com o cliente: [formal, direto...].\nNada sai para o cliente sem proposta aprovada aqui.\nAgentes: tragam riscos cedo e digam o que precisam de cada pessoa.",
      "Client: [name]. Project: [what we're delivering].\nDue date: [date]. Budget: [amount].\nTone with the client: [formal, direct...].\nNothing goes out to the client without a proposal approved here.\nAgents: flag risks early and say what you need from each person.",
    ),
  },
  {
    id: "contratacao", titulo: t("Contratação", "Hiring"), texto: t("Vaga, critérios e avaliação dos candidatos.", "Role, criteria and candidate reviews."), nome: t("Contratação", "Hiring"),
    contexto: t(
      "Vaga: [cargo], [modelo de trabalho], [faixa salarial].\nCritérios, em ordem de peso: [1], [2], [3].\nAgentes: resumam cada candidato numa tabela com os critérios e uma nota de 1 a 5. Nada de dado pessoal além do necessário.\nAvançar ou recusar alguém é decisão das pessoas, por proposta.",
      "Role: [title], [remote/hybrid/on-site], [salary range].\nCriteria, most important first: [1], [2], [3].\nAgents: summarize each candidate in a table with the criteria and a score from 1 to 5. No personal data beyond what's needed.\nMoving a candidate forward or turning them down is up to people, through a proposal.",
    ),
  },
  {
    id: "decisao", titulo: t("Decisão", "Decision"), texto: t("Uma pergunta, opções lado a lado, uma escolha.", "One question, options side by side, one choice."), nome: t("Decisão", "Decision"),
    contexto: t(
      "Pergunta: [o que precisamos decidir].\nPrazo: [data].\nO que importa: [custo, prazo, risco...].\nAgentes: tragam de 2 a 4 opções com prós, contras e fontes. Usem @agentes para que todos respondam e comparem lado a lado.\nUma pessoa decide por proposta.",
      "Question: [what we need to decide].\nDue date: [date].\nWhat matters: [cost, timing, risk...].\nAgents: bring 2 to 4 options with pros, cons and sources. Use @agents so everyone answers and you can compare side by side.\nA person decides through a proposal.",
    ),
  },
];

export function NovaSala({ fechar, aoCriar, modeloInicial = "branco" }: { fechar: () => void; aoCriar?: () => void; modeloInicial?: string }) {
  const janela = useFocoPreso<HTMLFormElement>();
  const nav = useNavigate();
  const lista = modelos();
  const [modelo, setModelo] = useState(modeloInicial);
  const [nome, setNome] = useState(lista.find((m) => m.id === modeloInicial)?.nome ?? "");
  const [erro, setErro] = useState("");
  const [indo, setIndo] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [fechar]);

  const escolher = (id: string) => {
    const atual = lista.find((m) => m.id === modelo);
    const novo = lista.find((m) => m.id === id)!;
    if (!nome.trim() || nome === atual?.nome) setNome(novo.nome);
    setModelo(id);
  };

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;
    setIndo(true); setErro("");
    const { data, error } = await sb.rpc("criar_sala", { nome: nome.trim() });
    if (error) { setIndo(false); return setErro(traduzir(error)); }
    const m = lista.find((x) => x.id === modelo)!;
    if (m.contexto) await sb.from("salas").update({ contexto: m.contexto }).eq("id", data as string);
    aoCriar?.();
    fechar();
    nav(`/s/${data}${m.contexto ? "?contexto=1" : ""}`);
  };

  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
      <form className="modal" ref={janela} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="nova-titulo" onSubmit={criar}>
        <div className="modal-topo">
          <h2 id="nova-titulo">{t("Nova sala", "New room")}</h2>
          <button type="button" className="btn-icone" onClick={fechar} aria-label={t("Fechar", "Close")}><IconeFechar /></button>
        </div>
        <fieldset className="modelos">
          <legend className="secao-rotulo secao-rotulo-solto">{t("Comece de um modelo", "Start from a template")}</legend>
          {lista.map((m) => (
            <label key={m.id} className={`modelo ${modelo === m.id ? "marcado" : ""}`}>
              <input type="radio" name="modelo" value={m.id} checked={modelo === m.id} onChange={() => escolher(m.id)} />
              <strong>{m.titulo}</strong>
              <span className="nota">{m.texto}</span>
            </label>
          ))}
        </fieldset>
        <label className="secao-rotulo secao-rotulo-solto" htmlFor="nova-nome">{t("Nome da sala", "Room name")}</label>
        <input id="nova-nome" autoFocus value={nome} maxLength={80} placeholder={t("Ex.: Lançamento do piloto", "E.g., Pilot launch")} onChange={(e) => setNome(e.target.value)} />
        {modelo !== "branco" && <p className="nota">{t("O contexto do modelo abre em seguida para você completar o que está entre colchetes.", "The template's instructions open next so you can fill in the parts in brackets.")}</p>}
        {erro && <p className="nota erro" role="alert">{erro}</p>}
        <div className="modal-acoes">
          <button type="button" className="btn btn-texto" onClick={fechar}>{t("Cancelar", "Cancel")}</button>
          <button className="btn btn-cheio" disabled={!nome.trim() || indo}>{indo ? t("Criando…", "Creating…") : t("Criar sala", "Create room")}</button>
        </div>
      </form>
    </div>
  );
}
