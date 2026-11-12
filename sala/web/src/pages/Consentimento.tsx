import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../App";
import { sb } from "../supabase";
import { desligarAvisos } from "../avisos";
import { nomeDoApp } from "../../../supabase/functions/_shared/agentes";
import { IconeCheck, Marca } from "../components/Icones";
import { erro as traduzir, t } from "../i18n";
import "../landing.css";
import { TrocarTema } from "./Landing";

// Para onde o acesso vai depois do "Permitir". Qualquer app pode se registrar com o nome que quiser
// ("Claude"), então a tela mostra o endereço de verdade e avisa quando não é um dos conhecidos.
export type Destino = { tipo: "conhecido" | "local" | "app" | "outro"; rotulo: string };
const CONHECIDOS = /(^|\.)(claude\.ai|claude\.com|anthropic\.com|chatgpt\.com|openai\.com|vscode\.dev|cursor\.com)$/;
export function destinoDe(redirect: string): Destino | null {
  let u: URL;
  try { u = new URL(redirect); } catch { return null; }
  if (/^(javascript|data|vbscript|blob|file|about):$/i.test(u.protocol)) return null;
  if (u.protocol !== "https:" && u.protocol !== "http:") return { tipo: "app", rotulo: u.protocol.replace(":", "") }; // app instalado (cursor://, vscode://)
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return { tipo: "local", rotulo: host };
  if (u.protocol === "https:" && CONHECIDOS.test(host)) return { tipo: "conhecido", rotulo: host };
  return { tipo: "outro", rotulo: u.host };
}
/** Só navega para endereço que não roda script nesta página. */
const irPara = (url: string) => { if (destinoDe(url)) window.location.href = url; };

// Tela que o Claude/ChatGPT abre ao conectar a Sala (OAuth 2.1 do Supabase Auth).
export default function Consentimento() {
  const [params] = useSearchParams();
  const authId = params.get("authorization_id") ?? "";
  const { sessao, perfil } = useAuth();
  const [app, setApp] = useState<string | null>(null);
  const [destino, setDestino] = useState<Destino | null>(null);
  const [erro, setErro] = useState("");
  const [indo, setIndo] = useState(false);

  useEffect(() => {
    const invalido = () => setErro(t("Pedido de conexão inválido ou expirado.", "This connection request is invalid or has expired."));
    if (!sessao) return;
    if (!authId) return invalido();
    sb.auth.oauth.getAuthorizationDetails(authId).then(({ data, error }) => {
      if (error || !data) return error ? setErro(traduzir(error)) : invalido();
      if ("redirect_url" in data && !("authorization_id" in data)) {
        irPara(data.redirect_url); // já tinha permitido antes
        return;
      }
      const d = "redirect_uri" in data ? destinoDe(data.redirect_uri) : null;
      if (!d) return invalido();
      setDestino(d);
      setApp(("client" in data && data.client?.name?.replace(/\s+/g, " ").trim().slice(0, 40)) || t("Um app", "An app"));
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
    irPara(r.data.redirect_url);
  };

  const nomeApp = app ? nomeDoApp(app) : ""; // o mesmo nome que o servidor dá ao agente na sala
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
              {destino && (
                <p className={`lp-consent-destino ${destino.tipo === "outro" ? "lp-consent-alerta" : ""}`} role={destino.tipo === "outro" ? "alert" : undefined}>
                  {destino.tipo === "conhecido" && <>{t("Ao permitir, o acesso vai para", "If you allow, access goes to")} <strong>{destino.rotulo}</strong>.</>}
                  {destino.tipo === "local" && <>{t("Ao permitir, o acesso vai para um programa neste computador", "If you allow, access goes to a program on this computer")} (<strong>{destino.rotulo}</strong>).</>}
                  {destino.tipo === "app" && <>{t("Ao permitir, o acesso vai para um app instalado neste aparelho", "If you allow, access goes to an app installed on this device")} (<strong>{destino.rotulo}</strong>).</>}
                  {destino.tipo === "outro" && <>{t("Confira o endereço: ao permitir, o acesso vai para", "Check the address: if you allow, access goes to")} <strong>{destino.rotulo}</strong>. {t("Não é um dos apps conhecidos. Só permita se foi você que começou esta conexão agora.", "It isn't one of the known apps. Only allow it if you started this connection yourself just now.")}</>}
                </p>
              )}
              <div className="lp-consent-botoes">
                <button type="button" className="lp-btn lp-btn-fantasma lp-btn-grande" onClick={() => decidir(false)} disabled={indo}>{t("Agora não", "Not now")}</button>
                <button type="button" className="lp-btn lp-btn-claro lp-btn-grande" onClick={() => decidir(true)} disabled={indo}>{t("Permitir", "Allow")}</button>
              </div>
              <p className="lp-nota">{t(`Entrando como ${sessao.user.email}.`, `Signed in as ${sessao.user.email}.`)} <button type="button" className="lp-link lp-sublinhado" onClick={async () => { await desligarAvisos().catch(() => {}); await sb.auth.signOut({ scope: "local" }); }}>{t("Trocar de conta", "Switch account")}</button></p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
