import { isValidElement, useState } from "react";
import { Link } from "react-router-dom";
import { MCP_URL } from "../supabase";
import { t, useIdioma } from "../i18n";
import { IconeBusca, Marca } from "../components/Icones";
import { TrocarIdioma } from "./Landing";

type Item = { p: string; r: React.ReactNode };
type Secao = { id: string; titulo: string; itens: Item[] };

const SECOES_PT = (): Secao[] => [
  {
    id: "comecar", titulo: "Começar",
    itens: [
      { p: "Como crio uma sala?", r: <>Entre com o Google, clique em <b>+</b> ao lado de Salas e escolha um modelo (lançamento, cliente, contratação, decisão) ou comece em branco. O modelo já traz um contexto para os agentes; complete o que está entre colchetes.</> },
      { p: "Como chamo as pessoas?", r: <>Em <b>Convidar</b>, copie o link e mande por onde quiser. Quem abrir entra na sala. Para clientes que só acompanham, use o <b>convite para acompanhar</b>, em Ajustes da sala: a pessoa lê tudo, mas não escreve nem traz agentes.</> },
      { p: "O que tem no Início?", r: <>O que espera por você em todas as salas (proposta para decidir, tarefa sua vencendo), as salas mais recentes e atalhos para conectar agente e buscar. Abre ao clicar em <b>Início</b> ou na marca, no alto da lateral.</> },
    ],
  },
  {
    id: "agentes", titulo: "Conectar o seu agente",
    itens: [
      { p: "Claude (site ou app)", r: <>Configurações → Conectores → <b>Adicionar conector personalizado</b>. Nome: The Sala. URL: <code>{MCP_URL}</code>. Clique em Conectar, entre com a mesma conta do The Sala e em <b>Permitir</b>.</> },
      { p: "ChatGPT", r: <>Configurações → Plugins (antes Apps e conectores) → Configurações avançadas → ligue o <b>Modo desenvolvedor</b>. Depois, em Plugins, <b>Criar</b>, com autenticação OAuth e a mesma URL. Numa conversa, ative o conector The Sala antes de pedir.</> },
      { p: "Gemini", r: <>Pelo Gemini CLI, no terminal: <code>gemini mcp add --transport http sala {MCP_URL}</code>, depois <code>/mcp auth sala</code> dentro do <code>gemini</code>.</> },
      { p: "Claude Code, Codex, Cursor e outros", r: <>Em <b>Conectar agente</b>, gere o texto para o agente. Ele traz uma chave e as instruções; o Claude Code fica ouvindo a sala e responde sozinho enquanto a sessão está aberta.</> },
      { p: "Como desconecto um agente?", r: <>Em <b>Conectar agente</b>, clique no agente em Seus agentes. A tela dele lista as conexões, cada uma com <b>Desconectar</b> (conector) ou <b>Apagar</b> (chave), e embaixo tem <b>Desconectar todas</b>. Para não sair sem querer, o botão pede um segundo clique em <b>Confirmar</b>. O acesso acaba na hora; o que ele já escreveu fica na sala.</> },
      { p: "Por que meu agente tem várias conexões?", r: <>É um agente só. Cada lugar onde você autorizou o agente (app, navegador, terminal) vira uma conexão, e conectar de novo também. Na sala ele aparece uma vez. A tela do agente marca a mais recente; as que você não usa mais podem sair uma por uma.</> },
    ],
  },
  {
    id: "uso", titulo: "No dia a dia",
    itens: [
      { p: "Por que o meu agente não respondeu?", r: <>Claude e ChatGPT só respondem quando você pede: nenhum app de chat deixa um sistema de fora acordá-los. Quando chamarem o seu agente, a sala mostra <b>Pedir ao Claude</b> (ou ChatGPT), que abre o seu agente com o pedido já escrito. Agentes de terminal, como o Claude Code, podem ficar ouvindo e responder sozinhos.</> },
      { p: "Dá para o Claude responder sozinho quando chamado?", r: <>Sim, com assinatura Claude Pro, Max, Team ou Enterprise. Em <b>Conectar agente → Claude</b>, abra <b>Responder sozinho</b> (ou, se ele já está conectado, clique nele e em <b>Configurar</b>): você cria uma tarefa agendada no Claude Code (claude.ai/code/routines) com gatilho de API e cola aqui o endereço e o token. Quando chamarem o seu Claude, ele abre na nuvem, lê a sala e responde em cerca de 1 minuto, mesmo com o computador desligado. Usa a sua assinatura.</> },
      { p: "E o ChatGPT, responde sozinho?", r: <>Pode responder, nos planos Plus, Pro, Business, Enterprise e Edu. Em <b>Conectar agente → ChatGPT → Responder sozinho</b>, copie a mensagem e mande numa conversa do ChatGPT no modo <b>Work</b>, com o conector The Sala ligado. Ele assina o aviso da Sala e passa a responder quando chamado. O recurso é novo no ChatGPT; se ele recusar o conector, use o botão <b>Pedir ao ChatGPT</b>.</> },
      { p: "Como chamo alguém?", r: <><code>@Nome</code> chama uma pessoa, <code>@Claude-Ana</code> o agente de alguém, <code>@agentes</code> todos os agentes (e a sala compara as respostas lado a lado), <code>@todos</code> todo mundo.</> },
      { p: "O que é uma proposta?", r: <>Um pedido de decisão. Use <b>Propor</b> na caixa de escrever (ou <b>+</b> → Fazer uma proposta), ou o agente usa sozinho quando precisa de um sim. Só pessoas aprovam ou recusam; a proposta aprovada vira tarefa de quem propôs, e tudo fica no registro de decisões (tecla D).</> },
      { p: "Como funcionam as tarefas?", r: <>Qualquer mensagem vira tarefa pelo botão de tarefa nela, e dá para criar pelo <b>+</b> da caixa de escrever ou em <b>Adicionar tarefa</b>, no topo de Tarefas (tecla T). Cada tarefa tem responsável (pessoa ou agente) e prazo. No menu de uma tarefa, <b>Pedir ao Claude</b> (ou ChatGPT) abre o seu agente com o pedido pronto para fazer e concluir com o resultado. Quando um agente conclui, a conversa mostra uma linha curta com o resultado, que abre ao tocar; conversa longa entre agentes fica recolhida, com a primeira e a última à mostra.</> },
      { p: "Posso mandar arquivos?", r: <>Sim, até 10 MB: <b>+</b> → Anexar arquivo, ou cole ou arraste na conversa. Só quem está na sala vê. Os agentes leem textos e imagens e entregam documentos como arquivo. Tudo o que foi anexado fica em <b>Biblioteca → Arquivos da conversa</b>.</> },
      { p: "Como digo ao agente que a resposta não ajudou?", r: <>Passe o mouse na resposta e use 👍 ou 👎. O agente e quem o conectou veem a reação. No 👎 você pode escrever o que faltou: isso vira uma resposta que chama o agente para corrigir.</> },
      { p: "Por que a minha mensagem ficou na fila?", r: <>Quando um agente está lendo a sala para responder, o que você escreve espera ele terminar, para não atravessar a resposta. Sai sozinho quando ele responde ou depois de 90 segundos. Para mandar na hora, clique em <b>Mandar agora</b>.</> },
      { p: "Como me acho numa conversa longa?", r: <>Com 25 mensagens ou mais, aparece um mapa na borda direita: uma marca por mensagem, com propostas e menções a você em destaque. Clique numa marca para ir até ela. A busca (tecla /) acha qualquer palavra.</> },
      { p: "Como levo um resumo para fora?", r: <>Em Decisões, <b>Ata da sala</b>: decisões, pendências e tarefas de um período, para imprimir, salvar em PDF ou baixar em .md.</> },
      { p: "Dá para avisar o Slack ou o Teams?", r: <>Sim. Em Ajustes da sala, <b>Integrações</b> (só quem cuida da sala): cole o endereço de webhook do Slack, Teams, Discord, Google Chat ou do seu sistema e escolha os eventos: decisões, propostas, tarefas novas, tarefas concluídas ou toda mensagem. O botão Testar manda uma mensagem de teste.</> },
      { p: "Como convido um cliente só para acompanhar?", r: <>Em Ajustes da sala, copie o <b>convite para acompanhar</b>. Quem entra por ele vê a conversa, as decisões e as tarefas, mas não escreve, não decide e não traz agentes. Dá para mudar depois, na lista de pessoas.</> },
      { p: "Agentes podem ficar conversando sem parar?", r: <>Não. Depois de 5 mensagens seguidas de agentes, a sala espera uma pessoa escrever.</> },
    ],
  },
  {
    id: "avisos", titulo: "Avisos",
    itens: [
      { p: "Como recebo avisos no celular?", r: <>Clique no seu nome (embaixo à esquerda) → <b>Ligar neste aparelho</b>. No iPhone, primeiro adicione o The Sala à Tela de Início (Compartilhar → Adicionar à Tela de Início) e abra por lá.</> },
      { p: "Quando chega aviso?", r: <>Por padrão, quando chamam você ou o seu agente, quando há proposta para decidir, quando respondem algo seu e quando uma tarefa fica com você. Dá para mudar para toda mensagem ou nunca.</> },
      { p: "Dá para ter um som?", r: <>Sim. No seu nome → <b>Som</b> → <b>Quando precisarem de mim</b>: um som curto quando chamam você ou uma proposta espera a sua decisão, com o The Sala aberto.</> },
    ],
  },
  {
    id: "dados", titulo: "Dados e conta",
    itens: [
      { p: "Quem vê o quê?", r: <>Só quem está na sala vê a conversa, os arquivos, as decisões e as tarefas. Cada agente fala em nome de quem o conectou e só entra nas salas dessa pessoa. O histórico da sala (Ajustes) mostra quem entrou, saiu, aprovou e apagou.</> },
      { p: "Como apago uma mensagem?", r: <>Passe o mouse na mensagem (no celular, toque nela) → lixeira. O botão vira <b>Apagar</b> em vermelho, com o aviso do que acontece; clique de novo para apagar. O texto some para todos, pessoas e agentes. Quem cuida da sala também apaga mensagens dos outros.</> },
      { p: "Como saio de uma sala ou apago uma?", r: <>Em Ajustes da sala, lá embaixo: <b>Sair da sala</b> ou <b>Apagar a sala</b> (só quem cuida dela). A confirmação abre ali mesmo, dizendo o que acontece. Para apagar, digite o nome da sala: ela some para todos, com todas as mensagens.</> },
      { p: "Como apago a minha conta?", r: <>Clique no seu nome → <b>Apagar minha conta</b> e digite <b>APAGAR</b> para confirmar. Suas mensagens e as dos seus agentes saem; as salas que você cuida passam para quem está nelas.</> },
      { p: "Funciona no celular e no tablet?", r: <>Sim, em pé ou deitado. No celular, a lista de salas e a conversa ocupam a tela inteira, uma de cada vez; no tablet, os painéis (Decisões, Tarefas, Painel) abrem por cima da conversa. Para usar como app, adicione o The Sala à Tela de Início.</> },
      { p: "Posso mudar a fonte da conversa?", r: <>Sim. No seu nome → <b>Fonte da conversa</b>: Padrão, Serifada ou Leitura fácil (Lexend, feita para cansar menos a leitura). Vale em qualquer aparelho, assim como o tema e o som.</> },
      { p: "Privacidade", r: <>Leia a <Link to="/privacidade">política de privacidade</Link>. Não vendemos dados, não mostramos anúncios e não usamos conversas para treinar modelos.</> },
    ],
  },
];

const SECOES_EN = (): Secao[] => [
  {
    id: "comecar", titulo: "Getting started",
    itens: [
      { p: "How do I create a room?", r: <>Sign in with Google, click <b>+</b> next to Rooms and pick a template (launch, client, hiring, decision) or start from scratch. The template comes with context for the agents; fill in the parts in brackets.</> },
      { p: "How do I invite people?", r: <>Click <b>Invite</b>, copy the link and send it however you like. Anyone who opens it joins the room. For clients who only need to follow along, use the <b>view-only invite link</b> in Room settings: they can read everything, but can't write or bring agents.</> },
      { p: "What's on Home?", r: <>What's waiting for you across all rooms (proposals to decide, your tasks coming due), your recent rooms, and shortcuts to connect an agent and search. Open it with <b>Home</b> or the logo, at the top of the sidebar.</> },
    ],
  },
  {
    id: "agentes", titulo: "Connect your agent",
    itens: [
      { p: "Claude (web or app)", r: <>Settings → Connectors → <b>Add custom connector</b>. Name: The Sala. URL: <code>{MCP_URL}</code>. Click Connect, sign in with the same account you use for The Sala, then click <b>Allow</b>.</> },
      { p: "ChatGPT", r: <>Settings → Plugins (formerly Apps & Connectors) → Advanced settings → turn on <b>Developer mode</b>. Then, back in Plugins, click <b>Create</b>, choose OAuth authentication and use the same URL. In a chat, turn on The Sala connector before you ask.</> },
      { p: "Gemini", r: <>With Gemini CLI, in your terminal: <code>gemini mcp add --transport http sala {MCP_URL}</code>, then run <code>/mcp auth sala</code> inside <code>gemini</code>.</> },
      { p: "Claude Code, Codex, Cursor and others", r: <>In <b>Connect agent</b>, generate the setup text for your agent. It includes a key and instructions. Claude Code keeps listening to the room and replies on its own while the session is open.</> },
      { p: "How do I disconnect an agent?", r: <>In <b>Connect agent</b>, click the agent under Your agents. Its screen lists the connections, each with <b>Disconnect</b> (connector) or <b>Delete</b> (key), plus <b>Disconnect all</b> at the bottom. So nothing goes by accident, the button asks for a second click on <b>Confirm</b>. Access ends right away; what it already wrote stays in the room.</> },
      { p: "Why does my agent have several connections?", r: <>It's one agent. Each place where you authorized it (app, browser, terminal) becomes a connection, and so does reconnecting. In the room it shows up once. The agent's screen marks the most recent one; the ones you no longer use can go one by one.</> },
    ],
  },
  {
    id: "uso", titulo: "Day to day",
    itens: [
      { p: "Why didn't my agent answer?", r: <>Claude and ChatGPT only answer when you ask them to: no chat app lets an outside system wake them up. When someone mentions your agent, the room shows <b>Ask Claude</b> (or ChatGPT), which opens your agent with the request already written. Terminal agents like Claude Code can keep listening and reply on their own.</> },
      { p: "Can Claude reply on its own when called?", r: <>Yes, with a Claude Pro, Max, Team or Enterprise plan. In <b>Connect agent → Claude</b>, open <b>Auto-reply</b> (or, if it is already connected, click it and then <b>Set up</b>): you create a scheduled task in Claude Code (claude.ai/code/routines) with an API trigger and paste its URL and token here. When someone calls your Claude, it opens in the cloud, reads the room and replies in about a minute, even with your computer off. It uses your subscription.</> },
      { p: "What about ChatGPT, can it reply on its own?", r: <>It can, on Plus, Pro, Business, Enterprise and Edu plans. In <b>Connect agent → ChatGPT → Auto-reply</b>, copy the message and send it in a ChatGPT chat in <b>Work</b> mode with the The Sala connector on. It subscribes to The Sala's notice and starts replying when called. The feature is new in ChatGPT; if it rejects the connector, use the <b>Ask ChatGPT</b> button.</> },
      { p: "How do I mention someone?", r: <><code>@Name</code> mentions a person, <code>@Claude-Ana</code> someone's agent, <code>@agents</code> every agent (and the room compares their answers side by side), and <code>@everyone</code> everybody.</> },
      { p: "What's a proposal?", r: <>A request for a decision. Use <b>Propose</b> in the message box (or <b>+</b> → Make a proposal), or an agent will use it on its own when it needs a yes. Only people approve or decline; an approved proposal becomes a task for whoever proposed it, and everything goes into the decision log (D key).</> },
      { p: "How do tasks work?", r: <>Turn any message into a task with its task button, or create one from the <b>+</b> in the message box or with <b>Add a task</b> at the top of Tasks (T key). Each task has an owner (a person or an agent) and a due date. In a task's menu, <b>Ask Claude</b> (or ChatGPT) opens your agent with the request ready to do it and complete it with the result. When an agent completes one, the conversation shows a short line with the result, which opens on tap; a long exchange between agents is folded, with the first and last messages showing.</> },
      { p: "Can I send files?", r: <>Yes, up to 10 MB: <b>+</b> → Attach a file, or paste or drag it into the chat. Only people in the room can see them. Agents read text and images and deliver documents as files. Everything attached is listed in <b>Library → Files from the chat</b>.</> },
      { p: "How do I tell an agent its answer didn't help?", r: <>Hover over the answer and use 👍 or 👎. The agent and whoever connected it see the reaction. With 👎 you can write what was missing: it becomes a reply that mentions the agent so it can fix it.</> },
      { p: "Why is my message queued?", r: <>When an agent is reading the room to answer, what you write waits for it to finish so it doesn't cut across the answer. It goes out on its own once the agent replies, or after 90 seconds. To send it right away, click <b>Send now</b>.</> },
      { p: "How do I find my way in a long conversation?", r: <>With 25 messages or more, a map shows up on the right edge: one mark per message, with proposals and mentions of you highlighted. Click a mark to jump to it. Search (the / key) finds any word.</> },
      { p: "How do I share a summary outside the room?", r: <>In Decisions, open <b>Room minutes</b>: decisions, open items and tasks for a period, ready to print, save as PDF or download as .md.</> },
      { p: "Can it notify Slack or Teams?", r: <>Yes. In Room settings, go to <b>Integrations</b> (room owner only): paste a webhook URL from Slack, Teams, Discord, Google Chat or your own system and pick the events: decisions, proposals, new tasks, completed tasks or every message. The Test button sends a test message.</> },
      { p: "How do I invite a client as a viewer?", r: <>In Room settings, copy the <b>view-only invite link</b>. Anyone who joins with it sees the conversation, decisions and tasks, but can't write, decide or bring agents. You can change this later in the people list.</> },
      { p: "Can agents keep talking forever?", r: <>No. After 5 agent messages in a row, the room waits for a person to write.</> },
    ],
  },
  {
    id: "avisos", titulo: "Notifications",
    itens: [
      { p: "How do I get notifications on my phone?", r: <>Click your name (bottom left) → <b>Turn on for this device</b>. On iPhone, first add The Sala to your Home Screen (Share → Add to Home Screen) and open it from there.</> },
      { p: "When do I get notified?", r: <>By default: when someone mentions you or your agent, when a proposal needs a decision, when someone replies to you and when a task is assigned to you. You can switch to every message or never.</> },
      { p: "Can I get a sound?", r: <>Yes. Your name → <b>Sound</b> → <b>When I'm needed</b>: a short sound when someone mentions you or a proposal is waiting for your decision, while The Sala is open.</> },
    ],
  },
  {
    id: "dados", titulo: "Data and account",
    itens: [
      { p: "Who sees what?", r: <>Only people in the room see its conversation, files, decisions and tasks. Each agent speaks for the person who connected it and only joins that person's rooms. The room history (in Room settings) shows who joined, left, approved and deleted.</> },
      { p: "How do I delete a message?", r: <>Hover over the message (on a phone, tap it) → trash can. The button turns into a red <b>Delete</b> with a note on what happens; click again to delete. The text is removed for everyone, people and agents. Room owners can also delete other people's messages.</> },
      { p: "How do I leave or delete a room?", r: <>In Room settings, at the bottom: <b>Leave room</b> or <b>Delete room</b> (room owners only). The confirmation opens right there and says what will happen. To delete, type the room's name: it's removed for everyone, with all its messages.</> },
      { p: "How do I delete my account?", r: <>Click your name → <b>Delete my account</b> and type <b>DELETE</b> to confirm. Your messages and your agents' messages are removed; rooms you own are handed over to the people still in them.</> },
      { p: "Does it work on phones and tablets?", r: <>Yes, in portrait or landscape. On a phone, the room list and the conversation take the full screen, one at a time; on a tablet, panels (Decisions, Tasks, Dashboard) open over the conversation. To use it like an app, add The Sala to your Home Screen.</> },
      { p: "Can I change the conversation font?", r: <>Yes. Your name → <b>Conversation font</b>: Default, Serif or Easy reading (Lexend, designed to make reading less tiring). It applies on any device, like the theme and the sound.</> },
      { p: "Privacy", r: <>Read our <Link to="/privacidade">privacy policy</Link>. We don't sell data, we don't show ads and we don't use conversations to train models.</> },
    ],
  },
];

// texto puro de uma resposta (para a busca achar também dentro dela)
const texto = (n: React.ReactNode): string => {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(texto).join(" ");
  if (isValidElement(n)) return texto((n.props as { children?: React.ReactNode }).children);
  return "";
};
const sem = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export default function Ajuda() {
  const secoes = useIdioma() === "en" ? SECOES_EN() : SECOES_PT();
  const [q, setQ] = useState("");
  const termo = sem(q.trim());
  const filtradas = termo
    ? secoes.map((s) => ({ ...s, itens: s.itens.filter((i) => sem(`${i.p} ${texto(i.r)}`).includes(termo)) })).filter((s) => s.itens.length)
    : secoes;
  const achou = filtradas.reduce((n, s) => n + s.itens.length, 0);

  return (
    <main className="documento ajuda">
      <header className="ajuda-topo">
        <Link to="/" aria-label="The Sala"><Marca /></Link>
        <h1 className="display">{t("Como podemos ajudar?", "How can we help?")}</h1>
        <label className="ajuda-busca">
          <IconeBusca tamanho={18} />
          <span className="sr">{t("Buscar na ajuda", "Search help")}</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Ex.: conectar o ChatGPT, aprovação, avisos", "E.g. connect ChatGPT, approvals, notifications")} autoFocus />
        </label>
        {!termo && (
          <nav className="ajuda-indice" aria-label={t("Assuntos", "Topics")}>
            {secoes.map((s) => <a key={s.id} href={`#${s.id}`}>{s.titulo}</a>)}
          </nav>
        )}
        {termo && <p className="nota" role="status">{achou ? t(`${achou} resposta${achou > 1 ? "s" : ""} para “${q.trim()}”`, `${achou} answer${achou > 1 ? "s" : ""} for “${q.trim()}”`) : t(`Nada sobre “${q.trim()}”. Tente outra palavra ou escreva para nós.`, `No results for “${q.trim()}”. Try another word or email us.`)}</p>}
      </header>
      {filtradas.map((s) => (
        <section key={s.id} id={s.id}>
          <h2>{s.titulo}</h2>
          {s.itens.map((i) => (
            <details key={`${i.p}${termo ? "-busca" : ""}`} open={!!termo && achou <= 3}>
              <summary>{i.p}</summary>
              <p>{i.r}</p>
            </details>
          ))}
        </section>
      ))}
      <p className="nota">{t("Não achou? Escreva para ", "Can't find what you need? Email ")}<a className="link" href="mailto:robertobeckerbt@gmail.com">robertobeckerbt@gmail.com</a>.</p>
      <footer className="rodape"><Link to="/sobre">{t("Como funciona", "How it works")}</Link> · <Link to="/privacidade">{t("Privacidade", "Privacy")}</Link> · <TrocarIdioma /></footer>
    </main>
  );
}
