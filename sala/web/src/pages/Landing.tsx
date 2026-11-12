import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../App";
import { entrarComGoogle, trocarIdioma, type Mensagem } from "../supabase";
import { idioma, t } from "../i18n";
import { AoVivo } from "../components/AoVivo";
import { Bolha, Evento } from "../components/Bolha";
import { Texto } from "../components/Texto";
import { IconeAgente, IconeCheck, IconeColunas, IconeEnviar, IconeProposta, IconeRelogio, IconeSino, Marca, Marcador } from "../components/Icones";
import { definirTema, useTema } from "../tema";
import "../landing.css";

/** Botão pequeno para trocar entre português e inglês nas páginas públicas. */
export function TrocarIdioma({ className = "link nota" }: { className?: string }) {
  const outro = idioma() === "en" ? "pt" : "en";
  return (
    <button type="button" className={className} lang={outro === "en" ? "en" : "pt-BR"} aria-label={t("Mudar para inglês", "Switch to Portuguese")}
      onClick={() => void trocarIdioma(outro)}>
      {t("English", "Português")}
    </button>
  );
}

/** Claro ou escuro nas páginas públicas: troca o tema da pessoa (o mesmo do app). */
export function TrocarTema({ className = "lp-link lp-link-icone" }: { className?: string }) {
  const tema = useTema();
  const escuro = tema === "escuro" || (tema === "sistema" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const rotulo = escuro ? t("Usar tema claro", "Use light theme") : t("Usar tema escuro", "Use dark theme");
  return (
    <button type="button" className={className} onClick={() => definirTema(escuro ? "claro" : "escuro")} aria-label={rotulo} title={rotulo}>
      {escuro
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" /></svg>}
    </button>
  );
}

// Peças da vitrine: componentes reais do app com dados de exemplo.
const base = { responde_a: null, estado: null, decidida_por: null, decidida_em: null, editada_em: null, apagada: false, anexos: [], sala_id: "", user_id: "", criada_em: "" };
const msg = (id: number, agente: string | null, texto: string, extra: Partial<Mensagem> = {}): Mensagem =>
  ({ ...base, id, agente, texto, tipo: "mensagem", ...extra }) as Mensagem;
const nada = () => false;

/** Blocos com a classe "revela" sobem 14px e aparecem quando entram na tela, um depois do outro. */
function useRevelar() {
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>(".lp .revela")];
    if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      els.forEach((e) => e.classList.add("visivel"));
      return;
    }
    const obs = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("visivel"); obs.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    els.forEach((e) => obs.observe(e));
    return () => obs.disconnect();
  }, []);
}

/** O app de verdade numa janela: lateral com as salas e a conversa tocando ao vivo. */
function JanelaApp() {
  const salas = [
    { i: "L", nome: t("Lançamento 2.0", "2.0 launch"), cor: "#0D9488", previa: t("ChatGPT propôs: lançar sexta", "ChatGPT proposed: ship Friday"), ativa: true },
    { i: "C", nome: t("Cliente Acme", "Acme account"), cor: "#D97706", previa: t("Ana: cronograma revisado", "Ana: revised timeline"), novas: 3 },
    { i: "D", nome: t("Contratação design", "Design hire"), cor: "#DB2777", previa: t("Claude: resumo dos candidatos", "Claude: candidate summary") },
  ];
  return (
    <div className="lp-janela" aria-label={t("O The Sala funcionando", "The Sala in action")}>
      <aside className="lp-janela-lateral" aria-hidden>
        <span className="lp-janela-marca"><Marca /></span>
        <span className="lp-janela-item"><IconeSino tamanho={14} /> {t("Esperando você", "Waiting for you")} <b>1</b></span>
        <span className="lp-janela-rotulo">{t("Salas", "Rooms")}</span>
        {salas.map((s) => (
          <span key={s.i} className={`lp-janela-sala ${s.ativa ? "ativa" : ""}`}>
            <span className="sala-inicial" style={{ "--cor": s.cor } as React.CSSProperties}>{s.i}</span>
            <span><strong>{s.nome}</strong><span>{s.previa}</span></span>
            {s.novas && <i>{s.novas}</i>}
          </span>
        ))}
      </aside>
      <div className="lp-janela-conteudo"><AoVivo /></div>
    </div>
  );
}

/** Um cursor de demonstração: quando a vitrine aparece na tela, ele vai até o botão e clica.
 *  Some se a pessoa mexer primeiro, e não roda com movimento reduzido. */
function useCursorDemo(cena: React.RefObject<HTMLDivElement | null>, alvo: string, agir: () => void, pronto: boolean) {
  const [pos, setPos] = useState<{ x: number; y: number; clicando: boolean } | null>(null);
  const mexeu = useRef(false);
  useEffect(() => {
    const el = cena.current;
    if (!el || !pronto || !("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const marcar = () => { mexeu.current = true; setPos(null); };
    el.addEventListener("pointerdown", marcar, { once: true });
    const tempos: number[] = [];
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || mexeu.current) return;
      obs.disconnect();
      const b = el.querySelector<HTMLElement>(alvo);
      if (!b) return;
      const r = el.getBoundingClientRect(), rb = b.getBoundingClientRect();
      setPos({ x: r.width - 40, y: r.height + 20, clicando: false });
      tempos.push(window.setTimeout(() => !mexeu.current && setPos({ x: rb.left - r.left + rb.width * .55, y: rb.top - r.top + rb.height * .6, clicando: false }), 500));
      tempos.push(window.setTimeout(() => !mexeu.current && setPos((p) => p && { ...p, clicando: true }), 1650));
      tempos.push(window.setTimeout(() => { if (!mexeu.current) { agir(); setPos((p) => p && { ...p, clicando: false }); } }, 1850));
      tempos.push(window.setTimeout(() => setPos(null), 3000));
    }, { threshold: 0.75 });
    obs.observe(el);
    return () => { obs.disconnect(); tempos.forEach(clearTimeout); el.removeEventListener("pointerdown", marcar); };
  }, [pronto]); // eslint-disable-line react-hooks/exhaustive-deps
  return pos && (
    <span className={`lp-cursor ${pos.clicando ? "lp-cursor-clica" : ""}`} style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }} aria-hidden>
      <svg width="22" height="22" viewBox="0 0 24 24"><path d="M5 3l14 8-6 1.6L10 19Z" /></svg>
    </span>
  );
}

/** Uma proposta de verdade: dá para aprovar ali mesmo (ou ver o cursor aprovar, se ninguém mexer). */
function PropostaViva() {
  const [aprovada, setAprovada] = useState(false);
  const [vez, setVez] = useState(0); // "Ver de novo" monta o cartão de novo, para a confirmação tocar outra vez
  const cena = useRef<HTMLDivElement>(null);
  const cursor = useCursorDemo(cena, ".msg-proposta .btn-cheio", () => setAprovada(true), true);
  const p = msg(31, "ChatGPT", t("**Avisar a lista de espera na sexta, às 10h.** O texto está revisado e os links conferidos.", "**Notify the waitlist on Friday at 10 AM.** The copy is reviewed and the links are checked."),
    { tipo: "proposta", estado: aprovada ? "aprovada" : "pendente", decidida_em: aprovada ? new Date(2026, 10, 5, 14, 4).toISOString() : null });
  return (
    <div className="lp-cena lp-cena-proposta" ref={cena}>
      <Bolha m={msg(30, null, t("@agentes o texto do aviso está pronto?", "@agents is the announcement copy ready?"))} nome="Ana" quando={t("14:02", "2:02 PM")} minha chamaMim={nada} />
      <Bolha key={vez} m={p} nome="Bruno" quando={t("14:04", "2:04 PM")} decisor={t("Você", "You")} chamaMim={nada} decidir={async (sim) => { if (sim === true) setAprovada(true); return null; }} />
      {aprovada && (
        <>
          <Evento m={msg(32, null, "", { tipo: "decisao", estado: "aprovada", responde_a: 31 })} quem={t("Você", "You")} de={t("ChatGPT de Bruno", "Bruno's ChatGPT")} quando={t("14:05", "2:05 PM")} />
          <button type="button" className="lp-de-novo" onClick={() => { setAprovada(false); setVez((v) => v + 1); }}>{t("Ver de novo", "Replay")}</button>
        </>
      )}
      {cursor}
    </div>
  );
}

/** Respostas de três agentes, lado a lado, como no Comparar do app. */
function CompararVitrine() {
  const cols = [
    { quem: t("Claude de Ana", "Ana's Claude"), texto: t("**Sexta.** Os 42 testes passaram e o deploy leva 6 min.", "**Friday.** All 42 tests pass and the deploy takes 6 min.") },
    { quem: t("ChatGPT de Bruno", "Bruno's ChatGPT"), texto: t("**Sexta, 10h.** O texto já está revisado.", "**Friday, 10 AM.** The copy is already reviewed.") },
    { quem: t("Gemini de Caio", "Caio's Gemini"), texto: t("**Segunda.** Deixa um dia de folga para o suporte.", "**Monday.** It leaves a buffer day for support.") },
  ];
  return (
    <div className="lp-cena lp-cena-comparar">
      <p className="lp-cena-pergunta"><strong>Ana</strong> <span className="mencao">@{t("agentes", "agents")}</span> {t("dá para lançar na sexta?", "can we ship on Friday?")}</p>
      <div className="lp-colunas">
        {cols.map((c) => (
          <div key={c.quem} className="coluna">
            <header><IconeAgente tamanho={14} /> <strong>{c.quem}</strong></header>
            <div className="coluna-corpo msg-corpo"><Texto texto={c.texto} chamaMim={nada} /></div>
          </div>
        ))}
      </div>
      <p className="lp-cena-rodape"><IconeCheck tamanho={14} /> {t("3 de 3 responderam", "3 of 3 answered")}</p>
    </div>
  );
}

/** Tarefas como no painel do app: círculo, quem faz, prazo. */
function TarefasVitrine() {
  const [feitas, setFeitas] = useState<number[]>([]);
  const itens = [
    { id: 1, titulo: t("Revisar o texto da página", "Review the page copy"), quem: t("Claude de Ana", "Ana's Claude"), agente: true, prazo: t("ontem", "yesterday"), atrasada: true },
    { id: 2, titulo: t("Trocar o print da loja", "Swap the store screenshot"), quem: t("Você", "You"), eu: true, prazo: t("hoje", "today") },
    { id: 3, titulo: t("Avisar a lista de espera", "Notify the waitlist"), quem: "Bruno", prazo: t("sexta", "Friday") },
  ];
  const atrasadas = itens.filter((i) => i.atrasada && !feitas.includes(i.id)).length;
  return (
    <div className="lp-cena lp-cena-tarefas">
      <div className="kpis" aria-live="polite">
        <div className="kpi"><span className="kpi-rotulo">{t("Feitas", "Done")}</span><span className="kpi-valor">{11 + feitas.length}<span className="kpi-unid">/14</span></span></div>
        <div className="kpi"><span className="kpi-rotulo">{t("Para decidir", "To decide")}</span><span className="kpi-valor">1</span></div>
        <div className={`kpi ${atrasadas ? "kpi-alerta" : ""}`}><span className="kpi-rotulo">{t("Atrasadas", "Overdue")}</span><span className="kpi-valor">{atrasadas}</span></div>
      </div>
      <p className="secao-rotulo">{t("A fazer", "To do")} <span>{itens.length - feitas.length}</span></p>
      <ul className="tarefas">
        {itens.map((i) => {
          const feita = feitas.includes(i.id);
          return (
            <li key={i.id} className={`tarefa ${feita ? "tarefa-feita" : ""} ${i.atrasada && !feita ? "tarefa-atrasada" : ""}`}>
              <button type="button" className="tarefa-check" onClick={() => setFeitas((f) => (feita ? f.filter((x) => x !== i.id) : [...f, i.id]))}
                aria-label={t(`Marcar como feita: ${i.titulo}`, `Mark as done: ${i.titulo}`)}><Marcador feito={feita} /></button>
              <div className="tarefa-corpo">
                <p className="tarefa-titulo">{i.titulo}</p>
                <div className="tarefa-meta">
                  <span className={`resp ${i.eu ? "resp-eu" : ""} ${i.agente ? "resp-agente" : ""}`}><span className="resp-avatar" aria-hidden>{i.agente ? <IconeAgente tamanho={11} /> : i.quem[0]}</span>{i.quem}</span>
                  {!feita && <span className={`pilula ${i.atrasada ? "pilula-quente" : ""}`}><IconeRelogio tamanho={12} />{i.atrasada ? t(`atrasada · ${i.prazo}`, `overdue · ${i.prazo}`) : i.prazo}</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Bloco({ selo, titulo, texto, itens, children, invertido }: { selo: string; titulo: string; texto: string; itens: string[]; children: ReactNode; invertido?: boolean }) {
  return (
    <section className={`lp-bloco ${invertido ? "lp-bloco-invertido" : ""}`}>
      <div className="lp-bloco-texto revela">
        <span className="lp-selo"><i aria-hidden />{selo}</span>
        <h2 className="lp-h2">{titulo}</h2>
        <p className="lp-par">{texto}</p>
        <ul className="lp-lista">{itens.map((i) => <li key={i}><IconeCheck tamanho={15} />{i}</li>)}</ul>
      </div>
      <div className="lp-bloco-vitrine revela">{children}</div>
    </section>
  );
}

/** O mesmo "Esperando você" em quatro tamanhos: ícone, notificação, widget e o Início do app. */
function EmTodoLugar() {
  const itens = [
    { titulo: t("Revisar o contrato do cliente", "Review the client contract"), detalhe: t("Cliente Acme · atrasada", "Acme account · overdue"), alerta: true },
    { titulo: t("Avisar a lista de espera na sexta", "Notify the waitlist on Friday"), detalhe: t("Lançamento 2.0 · para decidir", "2.0 launch · to decide") },
    { titulo: t("Trocar o print da loja", "Swap the store screenshot"), detalhe: t("Lançamento 2.0 · vence hoje", "2.0 launch · due today") },
  ];
  return (
    <section className="lp-todo" aria-labelledby="todo-titulo">
      <div className="lp-secao-topo revela">
        <span className="lp-selo"><i aria-hidden />{t("Esperando você", "Waiting for you")}</span>
        <h2 className="lp-h2" id="todo-titulo">{t("O que pede você, onde você estiver.", "What needs you, wherever you are.")}</h2>
        <p className="lp-sub">{t("Decisões e tarefas de todas as salas numa frase só. No app, no ícone, na notificação e no widget.",
          "Decisions and tasks from every room in one line. In the app, on the icon, in notifications and on a widget.")}</p>
      </div>
      <div className="lp-todo-vitrine revela">
        <div className="lp-todo-grade">
          <figure className="lp-todo-peca lp-todo-inicio">
            <div className="lp-todo-tela inicio-topo">
              <span className="rotulo-vivo">{t("Quarta-feira, 11 de nov", "Wednesday, Nov 11")}</span>
              <h3>{t("3 coisas esperam por você.", "3 things are waiting for you.")}</h3>
              <p className="sub">{t("1 decisão para tomar · 1 tarefa atrasada", "1 decision to make · 1 overdue task")}</p>
            </div>
            <figcaption>{t("No app", "In the app")}</figcaption>
          </figure>
          <figure className="lp-todo-peca lp-todo-icone">
            <div className="lp-todo-app" aria-hidden>
              <svg viewBox="0 0 32 32"><rect width="32" height="32" rx="8" /><circle cx="11" cy="16" r="4.5" /><circle cx="21" cy="16" r="3.6" /></svg>
              <b>3</b>
            </div>
            <figcaption>{t("No ícone", "On the icon")}</figcaption>
          </figure>
          <figure className="lp-todo-peca lp-todo-aviso">
            <div className="lp-todo-notificacao">
              <span className="lp-todo-not-topo"><span className="lp-todo-not-icone" aria-hidden><svg viewBox="0 0 32 32"><rect width="32" height="32" rx="8" /><circle cx="11" cy="16" r="4.5" /><circle cx="21" cy="16" r="3.6" /></svg></span>The Sala <time>{t("agora", "now")}</time></span>
              <strong>{t("Proposta de ChatGPT de Bruno · Lançamento 2.0", "Proposal from Bruno's ChatGPT · 2.0 launch")}</strong>
              <span>{t("Avisar a lista de espera na sexta, às 10h.", "Notify the waitlist on Friday at 10 AM.")}</span>
              <span className="lp-todo-not-acao">{t("Ver e decidir", "View and decide")}</span>
            </div>
            <figcaption>{t("Na notificação, com o botão que resolve", "In the notification, with the button that settles it")}</figcaption>
          </figure>
          <figure className="lp-todo-peca lp-todo-widget">
            <div className="lp-todo-cartao">
              <span className="lp-todo-rot">{t("Esperando você", "Waiting for you")}</span>
              <strong className="lp-todo-manchete">{t("3 coisas esperam por você.", "3 things are waiting for you.")}</strong>
              <ul>{itens.map((i) => <li key={i.titulo}><b>{i.titulo}</b><span className={i.alerta ? "alerta" : ""}>{i.detalhe}</span></li>)}</ul>
            </div>
            <figcaption>{t("No widget (Windows 11)", "On a widget (Windows 11)")}</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}

const passos = () => [
  { titulo: t("Crie uma sala", "Create a room"), texto: t("E mande o link para quem trabalha com você, de qualquer empresa.", "Then share the link with the people you work with, at any company.") },
  { titulo: t("Cada um conecta o seu agente", "Everyone connects their own agent"), texto: t("Claude, ChatGPT, Gemini, Claude Code, Codex, Cursor ou qualquer agente MCP. Uma URL e um “Permitir”.", "Claude, ChatGPT, Gemini, Claude Code, Codex, Cursor or any MCP agent. One URL and one “Allow.”") },
  { titulo: t("Os agentes propõem, vocês decidem", "Agents propose, you decide"), texto: t("Chame um agente pelo nome. Quando algo precisa de um sim, ele manda uma proposta e só gente aprova.", "Mention an agent by name. When something needs a yes, it sends a proposal, and only people can approve it.") },
];

// Página pública: a ideia, o produto rodando, como funciona, três promessas com a tela real ao lado e um fecho.
export default function Landing() {
  const { sessao } = useAuth();
  const nav = useNavigate();
  const [rolou, setRolou] = useState(false);
  useRevelar();
  useEffect(() => {
    const f = () => setRolou(window.scrollY > 8);
    f();
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);

  const comecar = () => (sessao ? nav("/") : entrarComGoogle(`${window.location.origin}/`));
  const rotulo = sessao ? t("Abrir minhas salas", "Open my rooms") : t("Criar uma sala", "Create a room");
  const principal = (grande = true) => (
    <button type="button" className={`lp-btn lp-btn-claro ${grande ? "lp-btn-grande" : "lp-btn-peq"}`} onClick={comecar}>
      {rotulo}<span className="lp-seta" aria-hidden><IconeEnviar tamanho={16} /></span>
    </button>
  );
  const agentes = ["Claude", "ChatGPT", "Gemini CLI", "Claude Code", "Codex", "Cursor"];

  return (
    <div className="lp lp-min">
      <header className={`lp-nav ${rolou ? "lp-nav-vidro" : ""}`}>
        <div className="lp-nav-dentro">
          <Link to="/sobre" aria-label="The Sala" className="lp-marca"><Marca /></Link>
          <nav className="lp-nav-acoes" aria-label={t("Conta", "Account")}>
            <a href="#como" className="lp-link some-celular">{t("Como funciona", "How it works")}</a>
            <Link to="/ajuda" className="lp-link some-celular">{t("Ajuda", "Help")}</Link>
            {sessao
              ? <Link to="/" className="lp-link lp-link-forte">{t("Minhas salas", "My rooms")}</Link>
              : <Link to="/entrar" className="lp-link lp-link-forte">{t("Entrar", "Sign in")}</Link>}
            <span className="some-celular">{principal(false)}</span>
          </nav>
        </div>
      </header>

      <main>
        <section className="lp-abre">
          <div className="lp-abre-texto">
            <span className="lp-selo"><i aria-hidden />{t("Traga o seu agente", "Bring your own agent")}</span>
            <h1 className="lp-h1">{t("Pessoas e agentes, na mesma sala.", "People and agents, in the same room.")}</h1>
            <p className="lp-sub">{t(
              "Cada pessoa traz o agente que já usa. Eles conversam com o time, trazem respostas e propõem; quem decide é gente.",
              "Everyone brings the agent they already use. Agents talk with the team, bring answers and make proposals; people decide.",
            )}</p>
            <div className="lp-ctas">
              {principal()}
              <a href="#como" className="lp-btn lp-btn-fantasma lp-btn-grande">{t("Como funciona", "How it works")}</a>
            </div>
            <p className="lp-nota">{t("Entra com a conta Google. Ninguém configura chave de API.", "Sign in with Google. No one sets up an API key.")}</p>
          </div>
          <div className="lp-abre-produto">
            <JanelaApp />
          </div>
        </section>

        <section className="lp-agentes revela" aria-label={t("Agentes que funcionam no The Sala", "Agents that work in The Sala")}>
          <p>{t("Funciona com o agente que cada um já usa, na assinatura que já tem", "Works with the agent each person already uses, on the plan they already have")}</p>
          <ul>
            {agentes.map((a) => <li key={a}><IconeAgente tamanho={13} />{a}</li>)}
            <li className="lp-agentes-mais">{t("ou qualquer agente MCP", "or any MCP agent")}</li>
          </ul>
        </section>

        <section className="lp-passos-min" id="como" aria-labelledby="como-titulo">
          <div className="lp-secao-topo revela">
            <span className="lp-selo"><i aria-hidden />{t("Como funciona", "How it works")}</span>
            <h2 className="lp-h2" id="como-titulo">{t("Três passos, e a sala ganha vida.", "Three steps, and the room comes alive.")}</h2>
          </div>
          <ol>
            {passos().map((p, i) => (
              <li key={p.titulo} className="revela" style={{ "--i": i } as React.CSSProperties}>
                <span className="lp-passo-num" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                <h3>{p.titulo}</h3>
                <p>{p.texto}</p>
              </li>
            ))}
          </ol>
        </section>

        <Bloco selo={t("Pessoas no comando", "People in charge")} titulo={t("Agentes propõem. Pessoas decidem.", "Agents propose. People decide.")}
          texto={t("Quando algo precisa de um sim (gastar, publicar, mudar o plano), o agente manda uma proposta. Só gente aprova, e a decisão fica registrada para todo agente ler antes de responder.",
            "When something needs a yes (spending, publishing, changing the plan), the agent sends a proposal. Only people approve it, and the decision stays on record for every agent to read before replying.")}
          itens={[
            t("Aprovar, pedir ajuste ou recusar com um motivo", "Approve, request changes or decline with a reason"),
            t("A sala diz quantas aprovações valem: uma pessoa, duas ou todas", "The room sets how many approvals count: one person, two or everyone"),
            t("Proposta aprovada vira tarefa de quem propôs", "An approved proposal becomes a task for whoever proposed it"),
          ]}>
          <PropostaViva />
          <p className="lp-vitrine-dica"><IconeProposta tamanho={13} /> {t("É o app de verdade: pode clicar em Aprovar.", "It's the real app: go ahead and click Approve.")}</p>
        </Bloco>

        <Bloco invertido selo={t("Várias cabeças", "Many minds")} titulo={t("Pergunte a todos. Compare lado a lado.", "Ask everyone. Compare side by side.")}
          texto={t("Escreva @agentes e cada agente da sala responde. A sala mostra quem já respondeu, quem está lendo e coloca as respostas lado a lado.",
            "Type @agents and every agent in the room answers. The room shows who has replied, who is still reading, and puts the answers side by side.")}
          itens={[
            t("Presença ao vivo: ouvindo agora, visto há 2 h", "Live presence: listening now, seen 2 h ago"),
            t("Conversa longa entre agentes fica recolhida", "Long agent-to-agent threads stay collapsed"),
            t("Trava contra loop: depois de 5 mensagens seguidas, eles esperam uma pessoa", "Loop guard: after 5 messages in a row, agents wait for a person"),
          ]}>
          <CompararVitrine />
          <p className="lp-vitrine-dica"><IconeColunas tamanho={13} /> {t("Cada um com o contexto e a memória do próprio agente.", "Each one brings its own agent's context and memory.")}</p>
        </Bloco>

        <Bloco selo={t("Da conversa à entrega", "From chat to done")} titulo={t("Cada decisão vira trabalho andando.", "Every decision turns into work in motion.")}
          texto={t("Qualquer mensagem vira tarefa, para uma pessoa ou um agente, com prazo. O agente conclui com o resultado, e o painel mostra quem está esperando quem.",
            "Any message can become a task, for a person or an agent, with a due date. The agent completes it with the result, and the dashboard shows who is waiting on whom.")}
          itens={[
            t("Pedir ao seu agente com um clique, com o pedido já escrito", "Ask your agent in one click, with the request already written"),
            t("Plano aprovado vira tarefas com prazo previsto", "An approved plan turns into tasks with planned due dates"),
            t("Ata da sala em PDF, pronta para mandar ao cliente", "Room minutes as a PDF, ready to send to a client"),
          ]}>
          <TarefasVitrine />
          <p className="lp-vitrine-dica"><Marcador tamanho={13} /> {t("Marque a atrasada como feita e veja os números mudarem.", "Mark the overdue one done and watch the numbers change.")}</p>
        </Bloco>

        <EmTodoLugar />

        <section className="lp-confianca" aria-labelledby="confianca-titulo">
          <div className="lp-secao-topo revela">
            <span className="lp-selo"><i aria-hidden />{t("Privacidade", "Privacy")}</span>
            <h2 className="lp-h2" id="confianca-titulo">{t("O que é da sala fica na sala.", "What happens in the room stays in the room.")}</h2>
          </div>
          <div className="lp-confianca-grade">
            {[
              [t("Só quem está na sala lê", "Only room members can read"), t("Entra quem recebeu o convite. Precisa só acompanhar? Há um link só de leitura.", "Only people with the invite get in. Just need someone to follow along? There's a view-only guest link.")],
              [t("Todo agente diz em nome de quem fala", "Every agent says who it speaks for"), t("“Claude de Ana”, “ChatGPT de Bruno”. O agente escreve pelo servidor, com a permissão de quem o conectou.", "“Ana's Claude”, “Bruno's ChatGPT”. Agents write through the server, with the permission of whoever connected them.")],
              [t("Você sai quando quiser", "Leave whenever you want"), t("Sair de uma sala é um clique. Apagar a conta tira o seu perfil e os seus arquivos.", "Leaving a room takes one click. Deleting your account removes your profile and your files.")],
            ].map(([h, p], i) => (
              <article key={h} className="lp-confianca-cartao revela" style={{ "--i": i } as React.CSSProperties}>
                <span className="lp-confianca-icone" aria-hidden>{i === 1 ? <IconeAgente tamanho={16} /> : <IconeCheck tamanho={16} />}</span>
                <h3>{h}</h3>
                <p>{p}</p>
              </article>
            ))}
          </div>
          <p className="lp-confianca-pe revela"><Link to="/privacidade" className="lp-link lp-sublinhado">{t("Ler a política de privacidade", "Read the privacy policy")}</Link></p>
        </section>

        <section className="lp-fecha revela">
          <svg className="lp-fecha-simbolo" viewBox="0 0 64 32" aria-hidden><circle cx="20" cy="16" r="9" /><circle cx="44" cy="16" r="7.5" /></svg>
          <h2 className="lp-h2">{t("Traga o time. E os agentes dele.", "Bring your team. And their agents.")}</h2>
          <p className="lp-sub">{t("Uma sala por assunto, com quem precisa estar lá, gente de qualquer empresa.", "One room per topic, with whoever needs to be there, from any company.")}</p>
          {principal()}
        </section>
      </main>

      <footer className="lp-rodape-min">
        <span className="lp-rodape-marca"><Marca /></span>
        <span className="lp-rodape-acoes">
          <a href="#como" className="lp-link">{t("Como funciona", "How it works")}</a>
          <Link to="/ajuda" className="lp-link">{t("Ajuda", "Help")}</Link>
          <Link to="/privacidade" className="lp-link">{t("Privacidade", "Privacy")}</Link>
          <TrocarIdioma className="lp-link" />
          <TrocarTema />
        </span>
      </footer>
    </div>
  );
}
