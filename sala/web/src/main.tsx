import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { Falha } from "./components/Falha";
import "./styles.css";
import { registrarSw } from "./avisos";
import { aplicarTema } from "./tema";
import { iniciarPreferencias } from "./preferencias";

aplicarTema();
iniciarPreferencias();

// teclado aberto no celular: a área segura de baixo (a barrinha do iPhone) fica atrás do teclado,
// então a caixa de escrever não precisa reservar esse espaço
const vv = window.visualViewport;
if (vv) {
  const medir = () => document.documentElement.classList.toggle("teclado-aberto", window.innerHeight - vv.height > 120);
  vv.addEventListener("resize", medir);
  medir();
}

registrarSw();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Falha>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Falha>
  </StrictMode>,
);
