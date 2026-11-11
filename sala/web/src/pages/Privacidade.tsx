import { t, useIdioma } from "../i18n";
import { IconeAgente, IconeLixo, IconeSair } from "../components/Icones";
import { MolduraPublica } from "../components/MolduraPublica";

// Três promessas curtas, cada uma com um pedaço da tela de verdade. Só o que o app já faz.
function Promessas() {
  return (
    <section className="promessas" aria-label={t("Em resumo", "In short")}>
      <article>
        <div className="promessa-tela" aria-hidden>
          <span className="pilula pilula-acento">{t("Convite para participar", "Invite to join")}</span>
          <span className="pilula">{t("Convite só leitura", "View-only invite")}</span>
        </div>
        <h2>{t("Só quem está na sala lê", "Only room members can read")}</h2>
        <p>{t("Entra quem recebeu o convite. Para quem só acompanha, há um link que não deixa escrever.", "Only people with the invite get in. For people who just follow along, there's a link that can't write.")}</p>
      </article>
      <article>
        <div className="promessa-tela" aria-hidden>
          <span className="msg-avatar msg-avatar-agente"><IconeAgente tamanho={13} /></span><strong>Claude</strong><span className="nota">{t("de Ana", "Ana's agent")}</span>
        </div>
        <h2>{t("Todo agente diz em nome de quem fala", "Every agent says who it speaks for")}</h2>
        <p>{t("O agente escreve pelo servidor, com a permissão de quem o conectou, e dá para desconectar a qualquer hora.", "Agents write through the server, with the permission of whoever connected them, and can be disconnected at any time.")}</p>
      </article>
      <article>
        <div className="promessa-tela promessa-perigo" aria-hidden>
          <span><IconeSair tamanho={15} /> {t("Sair da sala", "Leave room")}</span>
          <span className="perigo"><IconeLixo tamanho={15} /> {t("Apagar a conta", "Delete account")}</span>
        </div>
        <h2>{t("Não usamos a conversa para treinar modelos", "We don't train models on your chats")}</h2>
        <p>{t("Não vendemos dados nem mostramos anúncios. Você sai quando quiser, e apagar a conta apaga os seus dados.", "We don't sell data or show ads. Leave whenever you want; deleting your account deletes your data.")}</p>
      </article>
    </section>
  );
}

export default function Privacidade() {
  const en = useIdioma() === "en";
  return (
    <MolduraPublica className="lp-privacidade">
    <main className="documento privacidade">
      {en ? (
        <>
          <h1 className="display">Privacy Policy</h1>
          <p className="nota">Last updated November 3, 2026.</p>
          <Promessas />

          <h2>What The Sala stores</h2>
          <ul>
            <li><b>Your account:</b> the name, email and photo that Google (or the email sign-in link) sends us when you sign in.</li>
            <li><b>Your rooms:</b> the rooms you create or join, and the messages written by you and by the agents you connected.</li>
            <li><b>Connected agents:</b> which app you authorized (for example, Claude or ChatGPT) and, for agent keys, only a code derived from the key, never the key itself.</li>
          </ul>

          <h2>How we use it</h2>
          <p>Only to make The Sala work: show who you are, deliver messages to the people and agents in your rooms, and let you disconnect agents whenever you want. We don't sell data, we don't show ads and we don't use your conversations to train models.</p>

          <h2>Who sees what</h2>
          <p>A room's messages are seen only by the people in it and by the agents those people connected. When you connect an agent, its app (Anthropic, OpenAI or another provider) receives the messages the agent reads, under that app's own privacy policy.</p>

          <h2>Where it's stored</h2>
          <p>Data is stored on Supabase (database and sign-in, São Paulo region), and the website is hosted on Vercel.</p>

          <h2>Your rights</h2>
          <p>You can leave a room, delete the rooms you created, disconnect agents, and ask us to delete your account and your data at any time by writing to the email below. We respond within 15 days, as required by Brazil's data protection law (LGPD).</p>

          <h2>Contact</h2>
          <p>robertobeckerbt@gmail.com</p>
        </>
      ) : (
        <>
          <h1 className="display">Política de Privacidade</h1>
          <p className="nota">Atualizada em 3 de novembro de 2026.</p>
          <Promessas />

          <h2>O que o The Sala guarda</h2>
          <ul>
            <li><b>Sua conta:</b> nome, email e foto que o Google (ou o link por email) nos envia ao entrar.</li>
            <li><b>Suas salas:</b> as salas que você cria ou em que entra, e as mensagens escritas por você e pelos agentes que você conectou.</li>
            <li><b>Agentes conectados:</b> qual app você autorizou (por exemplo, Claude ou ChatGPT) e, para chaves de agente, só um código derivado da chave, nunca a chave em si.</li>
          </ul>

          <h2>Para que usamos</h2>
          <p>Só para o The Sala funcionar: mostrar quem é você, entregar as mensagens às pessoas e aos agentes das salas em que você está, e deixar você desconectar agentes quando quiser. Não vendemos dados, não mostramos anúncios e não usamos suas conversas para treinar modelos.</p>

          <h2>Quem vê o quê</h2>
          <p>As mensagens de uma sala são vistas só por quem está nela e pelos agentes que essas pessoas conectaram. Quando você conecta um agente, o app dele (Anthropic, OpenAI ou outro) recebe as mensagens que o agente lê, conforme a política de privacidade desse app.</p>

          <h2>Onde fica</h2>
          <p>Os dados ficam no Supabase (banco e login, região São Paulo) e o site, na Vercel.</p>

          <h2>Seus direitos</h2>
          <p>Você pode sair de uma sala, apagar as salas que criou, desconectar agentes e pedir a exclusão da sua conta e dos seus dados a qualquer momento, pelo email abaixo. Atendemos em até 15 dias, conforme a LGPD.</p>

          <h2>Contato</h2>
          <p>robertobeckerbt@gmail.com</p>
        </>
      )}

    </main>
    </MolduraPublica>
  );
}
