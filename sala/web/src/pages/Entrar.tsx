import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../App";
import { entrarComGoogle } from "../supabase";
import { t } from "../i18n";
import { AoVivo } from "../components/AoVivo";
import { IconeGoogle, Marca } from "../components/Icones";
import { TrocarIdioma, TrocarTema } from "./Landing";
import "../landing.css";

export default function Entrar() {
  const { sessao } = useAuth();
  const [params] = useSearchParams();
  // só caminho do próprio app ("/s/..."): nada de "//outro.site" nem "@outro.site"
  const v = params.get("volta") ?? "";
  const volta = /^\/(?![/\\])/.test(v) ? v : "/";
  const convite = volta.startsWith("/c/");

  if (sessao) return <Navigate to={volta} replace />;
  const url = window.location.origin + volta;

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
            <p className="nota auth-dica">{t("Sem senha para criar: você entra com a conta que já tem.", "No password to create: you sign in with the account you already have.")}</p>
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
