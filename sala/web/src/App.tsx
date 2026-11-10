import { Dicas } from "./components/Dicas";
import { Recados } from "./components/Recados";
import { Puxar } from "./components/Puxar";
import { createContext, Fragment, useContext, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { sb, type Perfil } from "./supabase";
import Entrar from "./pages/Entrar";
import Inicio from "./pages/Inicio";
import SalaPage from "./pages/Sala";
import Convite from "./pages/Convite";
import Consentimento from "./pages/Consentimento";
import Privacidade from "./pages/Privacidade";
import Landing from "./pages/Landing";
import Ajuda from "./pages/Ajuda";
import { definirIdioma, escolhido, idioma, useIdioma } from "./i18n";
import { lerDaConta } from "./preferencias";

type Auth = { sessao: Session | null; perfil: Perfil | null; recarregarPerfil: () => void };
const AuthCtx = createContext<Auth>({ sessao: null, perfil: null, recarregarPerfil: () => {} });
export const useAuth = () => useContext(AuthCtx);

export default function App() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const lingua = useIdioma();

  const carregarPerfil = async (uid?: string) => {
    if (!uid) return setPerfil(null);
    const { data } = await sb.from("perfis").select("id, nome, avatar, avisos, idioma, guia_visto, guia_sala_visto").eq("id", uid).maybeSingle();
    setPerfil(data);
    // idioma: a escolha feita neste aparelho vale; sem escolha aqui, vale a do perfil. O perfil sempre fica sabendo.
    if (data) {
      if (!escolhido() && data.idioma) definirIdioma(data.idioma, false);
      else if (data.idioma !== idioma()) sb.from("perfis").update({ idioma: idioma() }).eq("id", uid).then(() => {});
    }
  };

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => { setSessao(data.session); carregarPerfil(data.session?.user.id); lerDaConta(data.session?.user); });
    const { data } = sb.auth.onAuthStateChange((_e, s) => { setSessao(s); carregarPerfil(s?.user.id); });
    return () => data.subscription.unsubscribe();
  }, []);

  if (sessao === undefined) return null; // primeira leitura da sessão, sem piscar tela

  return (
    <AuthCtx.Provider value={{ sessao, perfil, recarregarPerfil: () => carregarPerfil(sessao?.user.id) }}>
      <Fragment key={lingua /* trocar o idioma redesenha tudo, sem perder a sessão */}>
      <Routes>
        <Route path="/entrar" element={<Entrar />} />
        <Route path="/privacidade" element={<Privacidade />} />
        <Route path="/oauth/consent" element={<Consentimento />} />
        <Route path="/c/:codigo" element={<Convite />} />
        <Route path="/" element={sessao ? <Inicio /> : <Landing />} />
        <Route path="/sobre" element={<Landing />} />
        <Route path="/ajuda" element={<Ajuda />} />
        <Route path="/s/:id" element={<Protegida><SalaPage /></Protegida>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Dicas />
      <Recados />
      <Puxar />
      </Fragment>
    </AuthCtx.Provider>
  );
}

function Protegida({ children }: { children: React.ReactNode }) {
  const { sessao } = useAuth();
  const loc = useLocation();
  if (!sessao) return <Navigate to={`/entrar?volta=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <>{children}</>;
}
