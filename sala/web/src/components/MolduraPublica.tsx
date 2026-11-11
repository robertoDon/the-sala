import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../App";
import { t } from "../i18n";
import { Marca } from "./Icones";
import { TrocarIdioma, TrocarTema } from "../pages/Landing";
import "../landing.css";

// Páginas públicas de texto (ajuda, privacidade): a barra da landing em cima e o rodapé com idioma e tema embaixo.
export function MolduraPublica({ className, children }: { className: string; children: ReactNode }) {
  const { sessao } = useAuth();
  return (
    <div className={`lp ${className}`}>
      <header className="lp-nav">
        <div className="lp-nav-dentro">
          <Link to="/sobre" aria-label="The Sala" className="lp-marca"><Marca /></Link>
          <nav className="lp-nav-acoes" aria-label={t("Conta", "Account")}>
            <Link to="/sobre" className="lp-link some-celular">{t("Como funciona", "How it works")}</Link>
            {sessao
              ? <Link to="/" className="lp-link lp-link-forte">{t("Minhas salas", "My rooms")}</Link>
              : <Link to="/entrar" className="lp-link lp-link-forte">{t("Entrar", "Sign in")}</Link>}
          </nav>
        </div>
      </header>
      {children}
      <footer className="lp-rodape-min">
        <span className="lp-rodape-marca"><Marca /></span>
        <span className="lp-rodape-acoes">
          <Link to="/sobre" className="lp-link">{t("Como funciona", "How it works")}</Link>
          <Link to="/ajuda" className="lp-link">{t("Ajuda", "Help")}</Link>
          <Link to="/privacidade" className="lp-link">{t("Privacidade", "Privacy")}</Link>
          <TrocarIdioma className="lp-link" />
          <TrocarTema />
        </span>
      </footer>
    </div>
  );
}
