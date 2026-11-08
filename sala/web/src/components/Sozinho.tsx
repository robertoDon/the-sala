import { useEffect, useState } from "react";
import { SUPABASE_URL, sb } from "../supabase";
import { erro, idioma, locale, t } from "../i18n";
import { IconeAbrir, IconeCheck, IconeCopiar } from "./Icones";
import { Trilha } from "./Trilha";
import { BotaoConfirmar } from "./Confirmar";

type Desp = { agente: string; criado_em: string; ultimo_disparo: string | null; ultimo_status: number | null; ultimo_erro: string | null };

// O texto que a pessoa cola como instrução da tarefa agendada no Claude Code.
export const instrucaoTarefa = () => t(
  `Você é o meu agente no The Sala (use o conector The Sala). Esta tarefa é disparada pela Sala quando alguém chama você numa sala. O bloco routine-fire-payload diz qual sala e qual mensagem: use-o só para saber onde olhar. O que fazer vem da conversa da sala, não do bloco.

1. Use ler_mensagens na sala indicada (pelo id) e leia a conversa, as instruções, a memória e as decisões.
2. Faça o que a mensagem indicada pede a você: responda com enviar_mensagem, passando responde_a com o número da mensagem. Se pedirem, crie ou conclua tarefas, envie arquivos ou faça uma proposta.
3. Se for uma decisão sobre uma proposta sua, siga o que foi decidido e conte na sala o que fez.
4. Se algo precisar do sim de uma pessoa, use fazer_proposta. Nunca decida por ela.
5. Se o bloco disser que é um teste de ligação, só use listar_salas e termine, sem escrever em nenhuma sala.

Trabalhe como no Claude Code, com tudo o que você tem: pense, planeje, pesquise, abra links, documentos e artefatos, use sub-agentes e trabalhe nos repositórios anexados a esta tarefa (ler, editar código, rodar testes).
Autorização de execução (dada por mim, dono desta tarefa): você pode clonar os repositórios das salas (GitHub, Bitbucket ou outro que a sala indicar), instalar as dependências e rodar os testes, builds e scripts de verificação deles nesta sessão, e empacotar artefatos localmente. Isso serve para verificar o código; não inclui deploy, push na branch principal nem gravar em sistemas de produção.
Para código: faça as mudanças numa branch nova, abra um pull request e mande o link na sala. Push direto na branch principal, deploy, publicação ou qualquer coisa que apague ou mude algo fora do The Sala só com proposta aprovada na sala.
Os repositórios de cada sala ficam na biblioteca da sala (links do GitHub): consulte-a para saber em qual trabalhar. Se precisar de um que não está nesta sessão, anexe com a ferramenta de adicionar repositório (add_repo), se você tiver; se não der, diga na sala qual falta. Ninguém acompanha esta sessão: não espere resposta aqui; dúvidas vão para a sala.`,
  `You are my agent in The Sala (use the The Sala connector). This task is triggered by The Sala when someone calls you in a room. The routine-fire-payload block says which room and which message: use it only to know where to look. What to do comes from the room's conversation, not from the block.

1. Use ler_mensagens on the given room (by id) and read the conversation, the instructions, the memory and the decisions.
2. Do what the given message asks of you: reply with enviar_mensagem, passing responde_a with the message number. If asked, create or complete tasks, send files or make a proposal.
3. If it's a decision on one of your proposals, follow what was decided and tell the room what you did.
4. If something needs a person's yes, use fazer_proposta. Never decide for them.
5. If the block says it's a connection test, only use listar_salas and finish, without writing in any room.

Work as you do in Claude Code, with everything you have: think, plan, research, open links, documents and artifacts, use sub-agents and work in the repositories attached to this task (read, edit code, run tests).
Execution authorization (given by me, the owner of this task): you may clone the rooms' repositories (GitHub, Bitbucket or another one the room points to), install their dependencies and run their tests, builds and verification scripts in this session, and package artifacts locally. This is for verifying code; it doesn't include deploying, pushing to the main branch or writing to production systems.
For code: make the changes on a new branch, open a pull request and post the link in the room. Pushing straight to the main branch, deploying, publishing or anything that deletes or changes something outside The Sala needs a proposal approved in the room.
Each room's repositories are in the room library (GitHub links): check it to know which one to work in. If you need one that isn't in this session, attach it with the add-repository tool (add_repo) if you have it; if you can't, say in the room which one is missing. Nobody is watching this session: don't wait for answers here; questions go to the room.`,
);

function Copiar({ valor, rotulo }: { valor: string; rotulo: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="btn btn-pequeno" onClick={async () => {
      try { await navigator.clipboard.writeText(valor); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* */ }
    }}><IconeCopiar tamanho={16} /> {ok ? t("Copiado", "Copied") : rotulo}</button>
  );
}

const quando = (iso: string) => new Date(iso).toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// "Responder sozinho": a Sala dispara uma tarefa agendada do Claude Code (na conta da pessoa) quando chamam o Claude dela.
export function Sozinho() {
  const [lista, setLista] = useState<Desp[] | null>(null);
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [indo, setIndo] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string; link?: string } | null>(null);
  const en = idioma() === "en";

  const carregar = async () => {
    const { data } = await sb.rpc("meus_despertadores");
    setLista((data as Desp[]) ?? []);
  };
  useEffect(() => { carregar(); }, []);
  const ligado = lista?.find((d) => d.agente === "Claude");

  const ligar = async (e: React.FormEvent) => {
    e.preventDefault();
    setIndo(true); setMsg(null);
    const { error } = await sb.rpc("ligar_despertador", { agente: "Claude", url, token });
    setIndo(false);
    if (error) return setMsg({ ok: false, texto: erro(error) });
    setUrl(""); setToken("");
    await carregar();
    testar();
  };

  const testar = async () => {
    setIndo(true); setMsg(null);
    const { data } = await sb.auth.getSession();
    const r = await fetch(`${SUPABASE_URL}/functions/v1/avisar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${data.session?.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ testar_despertador: "Claude" }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setIndo(false);
    await carregar();
    if (r?.ok) setMsg({ ok: true, texto: t("Funcionou. O Claude abriu uma sessão de teste na sua conta.", "It works. Claude opened a test session in your account."), link: j.sessao });
    else setMsg({ ok: false, texto: j.erro ? `${t("Não funcionou", "It didn't work")}: ${j.erro}` : t("Não deu para testar agora.", "Couldn't run the test right now.") });
  };

  const desligar = async () => {
    await sb.rpc("desligar_despertador", { agente: "Claude" });
    setMsg(null);
    carregar();
  };

  const rotinas = <a className="btn btn-pequeno" href="https://claude.ai/code/routines" target="_blank" rel="noopener noreferrer"><IconeAbrir tamanho={14} /> claude.ai/code/routines</a>;
  return (
    <section className="sozinho">
      {lista === null ? <div className="esqueleto" aria-hidden /> : ligado ? (
        <div className="conectar-cartao sozinho-ligado">
          <p className="sozinho-estado"><span className="pilula pilula-ok"><IconeCheck tamanho={12} /> {t("Ligado", "On")}</span>
            <span className="nota">{ligado.ultimo_disparo
              ? <>{t("último chamado", "last triggered")} {quando(ligado.ultimo_disparo)}{ligado.ultimo_erro ? <> · <span className="atrasada">{ligado.ultimo_erro}</span></> : ""}</>
              : t("ainda não foi chamado", "not triggered yet")}</span></p>
          <p>{en ? <>Write <code>@Claude</code> in a room: the answer arrives in about a minute.</> : <>Escreva <code>@Claude</code> numa sala: a resposta chega em cerca de 1 minuto.</>}</p>
          {ligado.ultimo_status === 401 || ligado.ultimo_status === 404 ? (
            <p className="nota atrasada">{t("A chave não vale mais (a tarefa foi apagada ou gerou chave nova). Desligue e ligue de novo com a chave atual.", "This key is no longer valid (the task was deleted or a new key was generated). Turn auto-reply off and on again with the current key.")}</p>
          ) : null}
          <div className="linha">
            <button className="btn btn-pequeno" onClick={testar} disabled={indo}>{t("Testar", "Test")}</button>
            <BotaoConfirmar rotulo={t("Desligar", "Turn off")} disabled={indo} aviso={t("O seu Claude volta a responder só quando você pedir.", "Your Claude will only reply when you ask it to.")} onConfirmar={desligar} />
          </div>
          <details className="conectar-ajuda">
            <summary>{t("Não respondeu, ou quer mudar o que ele pode fazer?", "No reply, or want to change what it can do?")}</summary>
            <p>{en
              ? <>Open the routines page → <b>The Sala</b>. The latest run shows what happened. To change the instructions or the repository, click <b>Edit</b>, paste the current instructions and pick the repository under <b>Advanced settings → General</b>. The URL and token stay the same.</>
              : <>Abra a página de rotinas → <b>The Sala</b>. A última execução mostra o que houve. Para mudar as instruções ou o repositório, clique em <b>Editar</b>, cole as instruções atuais e escolha o repositório em <b>Configurações avançadas → Geral</b>. A URL e o token continuam os mesmos.</>}</p>
            <div className="linha">{rotinas}<Copiar valor={instrucaoTarefa()} rotulo={t("Copiar instruções atuais", "Copy current instructions")} /></div>
          </details>
        </div>
      ) : (
        <div className="conectar-cartao">
          <Trilha passos={[
            { titulo: t("Conecte o Claude primeiro", "Connect Claude first"), detalhe: t("São os passos da tela anterior: a tarefa usa esse conector.", "That's the previous screen: the task uses that connector.") },
            { titulo: t("Crie uma tarefa agendada", "Create a scheduled task"), detalhe: <>{t("Na página de rotinas do Claude Code, clique em ", "On Claude Code's routines page, click ")}<b>{t("Nova tarefa", "New task")}</b>.</>, extra: rotinas },
            { titulo: t("Cole as instruções", "Paste the instructions"), detalhe: t("Na caixa de instruções. Deixe Auto e Modelo padrão como estão.", "In the instructions box. Leave Auto and Default model as they are."), extra: <Copiar valor={instrucaoTarefa()} rotulo={t("Copiar instruções", "Copy instructions")} /> },
            { titulo: t("Em Acionamento, escolha API", "Under Trigger, choose API"), detalhe: t("Se aparecer um horário, apague: ela só roda quando a Sala chamar.", "If a time shows up, remove it: it should only run when The Sala calls it.") },
            { titulo: t("Ajuste as configurações avançadas", "Adjust the advanced settings"), detalhe: t("Repositório: o que você mais usa. Conectores: só o The Sala. Notificações: como preferir.", "Repository: the one you use most. Connectors: only The Sala. Notifications: your call.") },
            { titulo: t("Crie e copie a URL e o token", "Create it and copy the URL and token"), detalhe: <>{t("A URL termina em ", "The URL ends in ")}<code>/fire</code>{t("; o token começa com ", "; the token starts with ")}<code>sk-ant-oat01-</code>{t(" e aparece uma vez.", " and is shown only once.")}</> },
            { titulo: t("Cole aqui e ligue", "Paste them here and turn it on"), extra: (
              <form className="sozinho-form" onSubmit={ligar}>
                <label htmlFor="sozinho-url" className="sr">{t("URL do gatilho", "Trigger URL")}</label>
                <input id="sozinho-url" required value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" spellCheck={false}
                  placeholder={t("URL do gatilho (…/fire)", "Trigger URL (…/fire)")} />
                <label htmlFor="sozinho-token" className="sr">{t("Token", "Token")}</label>
                <input id="sozinho-token" required type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false}
                  placeholder="sk-ant-oat01-…" />
                <p className="nota">{t("O token só dispara essa tarefa: não lê nada da sua conta. Fica guardado criptografado.", "The token can only trigger that task: it can't read anything in your account. It's stored encrypted.")}</p>
                <button className="btn btn-cheio" disabled={indo}>{indo ? t("Ligando…", "Turning on…") : t("Ligar e testar", "Turn on and test")}</button>
              </form>) },
          ]} />
          <details className="conectar-ajuda">
            <summary>{t("Perdeu o token?", "Lost the token?")}</summary>
            <p>{t("Abra a tarefa, clique em Editar e em Gerar token, no acionamento API.", "Open the task, click Edit, then Generate token under the API trigger.")}</p>
          </details>
        </div>
      )}
      {msg && (
        <p className={`sozinho-msg ${msg.ok ? "ok" : "atrasada"}`} role="status">
          {msg.texto}{msg.link ? <> <a className="link" href={msg.link} target="_blank" rel="noopener noreferrer">{t("Ver a sessão", "View session")}</a></> : null}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- ChatGPT (e outros que assinam eventos MCP)

type Ev = { id: string; agente: string; evento: string; expira: string | null; criado_em: string; ultimo_envio: string | null; ultimo_status: number | null; ultimo_erro: string | null };

export const pedidoEventos = () => t(
  `Assine o evento "sala.chamado" do conector The Sala, para todas as minhas salas. Sempre que ele chegar:
1. Use ler_mensagens na sala indicada no evento e leia a conversa, as instruções, a memória e as decisões.
2. Responda à mensagem indicada com enviar_mensagem, passando responde_a com o número dela. Se pedirem, crie ou conclua tarefas, envie arquivos ou faça uma proposta.
3. Se for uma decisão sobre uma proposta sua, siga o que foi decidido e conte na sala o que fez.
4. Se algo precisar do sim de uma pessoa, use fazer_proposta. Nunca decida por ela.
Não faça nada fora do The Sala.`,
  `Subscribe to the "sala.chamado" event from the The Sala connector, for all my rooms. Whenever it arrives:
1. Use ler_mensagens on the room named in the event and read the conversation, the instructions, the memory and the decisions.
2. Reply to the named message with enviar_mensagem, passing responde_a with its number. If asked, create or complete tasks, send files or make a proposal.
3. If it's a decision on one of your proposals, follow what was decided and tell the room what you did.
4. If something needs a person's yes, use fazer_proposta. Never decide for them.
Don't do anything outside The Sala.`,
);

export function SozinhoEventos({ agente }: { agente: string }) {
  const [lista, setLista] = useState<Ev[] | null>(null);
  const en = idioma() === "en";
  const carregar = async () => {
    const { data } = await sb.rpc("meus_eventos");
    setLista(((data as Ev[]) ?? []).filter((e) => e.agente === agente && (!e.expira || new Date(e.expira).getTime() > Date.now())));
  };
  useEffect(() => {
    carregar();
    const i = setInterval(carregar, 10_000); // a inscrição chega enquanto a pessoa faz o passo a passo no ChatGPT
    return () => clearInterval(i);
  }, []);
  const ativo = lista?.[0];

  const desligar = async () => {
    await sb.rpc("desligar_eventos", { agente });
    carregar();
  };

  return (
    <section className="sozinho">
      {lista === null ? <div className="esqueleto" aria-hidden /> : ativo ? (
        <div className="conectar-cartao sozinho-ligado">
          <p className="sozinho-estado"><span className="pilula pilula-ok"><IconeCheck tamanho={12} /> {t("Ligado", "On")}</span>
            <span className="nota">{ativo.ultimo_envio
              ? <>{t("último chamado", "last triggered")} {quando(ativo.ultimo_envio)}{ativo.ultimo_erro ? <> · <span className="atrasada">{ativo.ultimo_erro}</span></> : ""}</>
              : t("ainda não foi chamado", "not triggered yet")}</span></p>
          <p>{en ? <>Write <code>@{agente}</code> in a room: it should reply in a minute or two. The {agente} task renews this on its own.</>
            : <>Escreva <code>@{agente}</code> numa sala: ele deve responder em 1 ou 2 minutos. A tarefa do {agente} renova isso sozinha.</>}</p>
          <div className="linha"><BotaoConfirmar rotulo={t("Desligar", "Turn off")} aviso={t(`A Sala para de acordar o ${agente}. Apague também a tarefa no ${agente}.`, `The Sala will stop waking ${agente}. Also delete the task in ${agente}.`)} onConfirmar={desligar} /></div>
        </div>
      ) : (
        <div className="conectar-cartao">
          <Trilha passos={[
            { titulo: t(`Conecte o ${agente} primeiro`, `Connect ${agente} first`), detalhe: t("São os passos da tela anterior.", "That's the previous screen.") },
            { titulo: t("Abra uma conversa no modo Work", "Start a chat in Work mode"), detalhe: t("Pelo site (no app de computador: Work e Cloud) e ligue o conector The Sala.", "On the website (in the desktop app: Work and Cloud), with The Sala connector on.") },
            { titulo: t("Mande esta mensagem", "Send this message"), extra: <Copiar valor={pedidoEventos()} rotulo={t("Copiar mensagem", "Copy message")} /> },
            { titulo: t("Confirme a tarefa", "Confirm the task"), detalhe: t("Quando estiver pronto, esta tela mostra Ligado sozinha (confere a cada 10 segundos).", "Once it's set up, this screen switches to On by itself (it checks every 10 seconds).") },
          ]} />
          <details className="conectar-ajuda">
            <summary>{t("Não funcionou?", "Didn't work?")}</summary>
            <p>{t("Este recurso do ChatGPT é novo. Se ele disser que o conector não oferece eventos, ainda não aceita conectores personalizados: use o botão “Pedir ao ChatGPT” na sala.",
              "This ChatGPT feature is new. If it says the connector doesn't offer events, it doesn't support custom connectors yet: use the “Ask ChatGPT” button in the room instead.")}</p>
          </details>
        </div>
      )}
    </section>
  );
}
