import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../App";
import { sb } from "../supabase";
import { IconeCheck, Marca } from "../components/Icones";
import { erro as traduzir, t } from "../i18n";
import "../landing.css";
import { TrocarTema } from "./Landing";

// Tela que o Claude/ChatGPT abre ao conectar a Sala (OAuth 2.1 do Supabase Auth).
export default function Consentimento() {
  const [params] = useSearchParams();
  const authId = params.get("authorization_id") ?? "";
  const { sessao, perfil } = useAuth();
  const [app, setApp] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [indo, setIndo] = useState(false);

  useEffect(() => {
    if (!sessao || !authId) return;
    sb.auth.oauth.getAuthorizationDetails(authId).then(({ data, error }) => {
      if (error || !data) return setErro(error ? traduzir(error) : t("Pedido de conexão inválido ou expirado.", "This connection request is invalid or has expired."));
      if ("redirect_url" in data && !("authorization_id" in data)) {
        window.location.href = data.redirect_url; // já tinha permitido antes
        return;
      }
      setApp(("client" in data && data.client?.name) || t("Um app", "An app"));
    });
  }, [authId, sessao]);

  if (!sessao) {
    return <Navigate to={`/entrar?volta=${encodeURIComponent(`/oauth/consent?authorization_id=${authId}`)}`} replace />;
  }

  const decidir = async (permitir: boolean) => {
    setIndo(true);
    const r = permitir
      ? await sb.auth.oauth.approveAuthorization(authId, { skipBrowserRedirect: true })
      : await sb.auth.oauth.denyAuthorization(authId, { skipBrowserRedirect: true });
    if (r.error || !r.data) { setIndo(false); return setErro(r.error ? traduzir(r.error) : t("Não deu certo.", "Something went wrong.")); }
    window.location.href = r.data.redirect_url;
  };

  const nomeApp = app?.split(" ")[0] ?? "";
  return (
    <div className="lp lp-convite">
      <main className="lp-convite-centro">
        <a href="/" className="lp-marca" aria-label="The Sala"><Marca /></a>
        <TrocarTema className="lp-btn lp-btn-fantasma lp-btn-peq lp-btn-quadrado lp-tema-canto" />
        <div className="lp-convite-cartao lp-consent">
          {erro ? (
            <>
              <h1 className="lp-h2">{t("Não deu para conectar.", "Couldn't connect.")}</h1>
              <p className="lp-sub">{erro} {t("Tente conectar de novo pelo app do agente.", "Try connecting again from your agent's app.")}</p>
            </>
          ) : !app ? (
            <><div className="esqueleto" /><div className="esqueleto" /><div className="esqueleto" /></>
          ) : (
            <>
              <div className="lp-consent-par" aria-hidden>
                <span className="lp-convite-inicial lp-consent-app">{nomeApp.slice(0, 1).toUpperCase()}</span>
                <span className="lp-consent-ligacao"><i /><i /><i /></span>
                <span className="lp-convite-inicial lp-consent-sala"><svg width="26" height="26" viewBox="0 0 32 32"><circle cx="11" cy="16" r="4.5" fill="currentColor" /><circle cx="21" cy="16" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg></span>
              </div>
              <p className="lp-olho">{t("Conectar agente", "Connect agent")}</p>
              <h1 className="lp-h2 lp-consent-titulo">{t(`${app} quer entrar nas suas salas.`, `${app} wants access to your rooms.`)}</h1>
              <ul className="lp-permissoes">
                <li><IconeCheck tamanho={16} />{t("Ler as conversas das salas em que você está.", "Read the conversations in the rooms you're in.")}</li>
                <li><IconeCheck tamanho={16} />{perfil?.nome
                  ? t(`Escrever nelas como seu agente: “${nomeApp} de ${perfil.nome}”.`, `Write in them as your agent: “${perfil.nome}'s ${nomeApp}.”`)
                  : t(`Escrever nelas como seu agente.`, `Write in them as your agent.`)}</li>
                <li><IconeCheck tamanho={16} />{t("Fazer propostas. Quem aprova ou recusa são as pessoas; o agente não decide sozinho.", "Make proposals. People approve or decline them; the agent never decides on its own.")}</li>
                <li><IconeCheck tamanho={16} />{t("Você desconecta quando quiser, em Conectar agente.", "You can disconnect it anytime from Connect agent.")}</li>
              </ul>
              <div className="lp-consent-botoes">
                <button type="button" className="lp-btn lp-btn-fantasma lp-btn-grande" onClick={() => decidir(false)} disabled={indo}>{t("Agora não", "Not now")}</button>
                <button type="button" className="lp-btn lp-btn-claro lp-btn-grande" onClick={() => decidir(true)} disabled={indo} autoFocus>{t("Permitir", "Allow")}</button>
              </div>
              <p className="lp-nota">{t(`Entrando como ${sessao.user.email}.`, `Signed in as ${sessao.user.email}.`)} <button type="button" className="lp-link lp-sublinhado" onClick={() => sb.auth.signOut({ scope: "local" })}>{t("Trocar de conta", "Switch account")}</button></p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
