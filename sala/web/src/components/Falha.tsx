import { Component, type ReactNode } from "react";
import { t } from "../i18n";
import { Marca } from "./Icones";

// Rede de segurança: se uma tela quebrar ao desenhar, a pessoa vê um recado e um jeito de voltar,
// em vez de uma página em branco.
export class Falha extends Component<{ children: ReactNode }, { quebrou: boolean }> {
  state = { quebrou: false };
  static getDerivedStateFromError() { return { quebrou: true }; }
  componentDidCatch(erro: unknown) { console.error(erro); }
  render() {
    if (!this.state.quebrou) return this.props.children;
    return (
      <main className="centro">
        <Marca />
        <section className="vazio">
          <h1 className="display">{t("Algo deu errado nesta tela.", "Something went wrong on this screen.")}</h1>
          <p className="sub">{t("Nada do que já foi enviado se perdeu. Recarregue para continuar.", "Nothing already sent was lost. Reload to continue.")}</p>
          <div className="linha">
            <button type="button" className="btn btn-cheio" onClick={() => window.location.reload()}>{t("Recarregar", "Reload")}</button>
            <a className="btn" href="/">{t("Ir para o início", "Go to home")}</a>
          </div>
        </section>
      </main>
    );
  }
}
