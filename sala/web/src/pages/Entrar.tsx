import { useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../App";
import { entrarComEmail, entrarComGoogle } from "../supabase";
import { erro, t } from "../i18n";
import { AoVivo } from "../components/AoVivo";
import { IconeCheck, IconeEnviar, IconeGoogle, Marca } from "../components/Icones";
import { TrocarIdioma, TrocarTema } from "./Landing";
import "../landing.css";

export default function Entrar() {
  const { sessao } = useAuth();
  const [params] = useSearchParams();
  const volta = params.get("volta") || "/";
  const convite = volta.startsWith("/c/");
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"" | "enviando" | "enviado" | string>("");

  if (sessao) return <Navigate to={volta} replace />;
  const url = window.location.origin + volta;

  const porEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setEstado("enviando");
    const { error } = await entrarComEmail(email.trim(), url);
    const lotado = error && (error.status === 429 || /rate limit|security purposes/i.test(error.message));
    setEstado(error ? `erro:${lotado
      ? t("muitos pedidos de link agora. Entre com o Google ou tente de novo em alguns minutos.", "too many sign-in link requests right now. Sign in with Google or try again in a few minutes.")
      : erro(error)}` : "enviado");
  };

  return (
    <div className="lp lp-entrar">
      <main className="lp-entrar-lado">
        <a href="/sobre" className="lp-marca" aria-label={t("The Sala: como funciona", "The Sala: how it works")}><Marca /></a>
        <div className="lp-entrar-form">
          {convite ? <>
            <h1 className="lp-h2">{t("Entre para aceitar o convite.", "Sign in to accept the invite.")}</h1>
            <p className="lp-sub">{t("Te chamaram para uma sala no The Sala: pessoas e os agentes delas, na mesma conversa.", "You've been invited to a room on The Sala, where people and their agents work in the same conversation.")}</p>
          </> : <>
            <h1 className="lp-h2">{t("Entre na sua sala.", "Sign in to your rooms.")}</h1>
            <p className="lp-sub">{t("Pessoas e os agentes delas, na mesma conversa.", "People and their agents, in the same conversation.")}</p>
          </>}

          <div className="auth">
            <button type="button" className="lp-btn lp-btn-claro lp-btn-grande auth-google" onClick={() => entrarComGoogle(url)}>
              <span className="g-selo" aria-hidden><IconeGoogle /></span>
              <span>{t("Continuar com o Google", "Continue with Google")}</span>
            </button>

            <div className="auth-ou" aria-hidden><span>{t("ou", "or")}</span></div>

            {estado === "enviado" ? (
              <div className="auth-enviado" role="status">
                <span className="auth-enviado-icone"><IconeCheck tamanho={18} /></span>
                <div>
                  <strong>{t("Confira seu email", "Check your email")}</strong>
                  <span className="nota">{t(`Mandamos um link para ${email}. Abra neste aparelho.`, `We sent a link to ${email}. Open it on this device.`)}</span>
                </div>
              </div>
            ) : (
              <form onSubmit={porEmail} className="auth-email">
                <label className="sr" htmlFor="email">Email</label>
                <input id="email" type="email" placeholder={t("seu@email.com", "you@example.com")} value={email}
                  onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                <button className={`auth-enviar ${email.includes("@") ? "pronto" : ""}`} disabled={estado === "enviando" || !email.trim()}
                  aria-label={t("Receber link de acesso", "Email me a sign-in link")} title={t("Receber link de acesso", "Email me a sign-in link")}>
                  <IconeEnviar tamanho={18} />
                </button>
              </form>
            )}
            {estado.startsWith("erro:")
              ? <p className="nota erro" role="alert">{t("Não deu certo: ", "That didn't work: ")}{estado.slice(5)}</p>
              : estado !== "enviado" && <p className="nota auth-dica">{t("Sem senha: mandamos um link de acesso para o seu email.", "No password needed: we'll email you a sign-in link.")}</p>}
          </div>
        </div>
        <footer className="lp-entrar-rodape"><a href="/sobre">{t("Como funciona", "How it works")}</a><a href="/ajuda">{t("Ajuda", "Help")}</a><a href="/privacidade">{t("Privacidade", "Privacy")}</a><TrocarIdioma className="lp-link" /><TrocarTema className="lp-link lp-link-icone" /></footer>
      </main>

      <section className="lp-entrar-vitrine" aria-hidden>
        <AoVivo />
      </section>
    </div>
  );
}
