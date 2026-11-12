import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../App";
import { sb } from "../supabase";
import { Marca } from "../components/Icones";
import { corDaSala } from "../components/Layout";
import { erro, t } from "../i18n";
import "../landing.css";
import { TrocarTema } from "./Landing";
import { recado } from "../components/Recados";

type Info = { sala_id: string; nome: string; pessoas: number; ja_membro: boolean; leitura: boolean };

export default function Convite() {
  const { codigo = "" } = useParams();
  const { sessao } = useAuth();
  const nav = useNavigate();
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const [entrando, setEntrando] = useState(false);

  useEffect(() => {
    if (!sessao) return;
    let vivo = true, espera = 0;
    // erro de rede não é "convite não vale mais": avisa e tenta de novo
    const ver = () => sb.rpc("ver_convite", { codigo }).then(({ data, error }) => {
      if (!vivo) return;
      if (error) { recado(erro(error)); espera = window.setTimeout(ver, 4000); return; }
      setInfo((data as Info[])?.[0] ?? null);
    });
    ver();
    return () => { vivo = false; window.clearTimeout(espera); };
  }, [codigo, sessao]);

  if (!sessao) return <Navigate to={`/entrar?volta=${encodeURIComponent(`/c/${codigo}`)}`} replace />;
  if (info?.ja_membro) return <Navigate to={`/s/${info.sala_id}`} replace />;

  const entrar = async () => {
    setEntrando(true);
    const { data, error } = await sb.rpc("entrar_sala", { codigo });
    if (error) { setEntrando(false); return recado(erro(error)); }
    nav(`/s/${data}`);
  };

  return (
    <div className="lp lp-convite">
      <main className="lp-convite-centro">
        <a href="/" className="lp-marca" aria-label="The Sala"><Marca /></a>
        <TrocarTema className="lp-btn lp-btn-fantasma lp-btn-peq lp-btn-quadrado lp-tema-canto" />
        {info === undefined && <div className="lp-convite-cartao" aria-busy="true"><div className="esqueleto" /><div className="esqueleto" /></div>}
        {info === null && (
          <div className="lp-convite-cartao">
            <h1 className="lp-h2">{t("Este convite não vale mais.", "This invite is no longer valid.")}</h1>
            <p className="lp-sub">{t("Quem cuida da sala pode ter trocado o link. Peça um novo.", "The room owner may have replaced the link. Ask them for a new one.")}</p>
            <Link className="lp-btn lp-btn-fantasma lp-btn-grande" to="/">{t("Ver minhas salas", "See my rooms")}</Link>
          </div>
        )}
        {info && (
          <div className="lp-convite-cartao">
            <span className="lp-convite-inicial" style={{ "--cor": corDaSala(info.sala_id) } as React.CSSProperties} aria-hidden>{info.nome.slice(0, 1).toUpperCase()}</span>
            <p className="lp-olho">{info.leitura ? t("Te chamaram para acompanhar", "You're invited to view") : t("Te chamaram para", "You're invited to join")}</p>
            <h1 className="lp-h2">{info.nome}</h1>
            <p className="lp-sub">{info.pessoas === 1
              ? t("1 pessoa na sala.", "1 person in the room.")
              : t(`${info.pessoas} pessoas na sala.`, `${info.pessoas} people in the room.`)} {info.leitura
              ? t("Você vê a conversa, as decisões e as tarefas, sem escrever.", "You'll be able to see the conversation, decisions and tasks, but not write.")
              : t("Depois de entrar, você conecta o seu agente em um minuto.", "After you join, you can connect your agent in about a minute.")}</p>
            <button type="button" className="lp-btn lp-btn-claro lp-btn-grande" onClick={entrar} disabled={entrando} autoFocus>
              {entrando ? t("Entrando…", "Joining…") : t("Entrar na sala", "Join room")}
            </button>
            <a href="/sobre" target="_blank" rel="noopener" className="lp-link lp-nota">{t("Primeira vez? Ver como funciona", "First time here? See how it works")}</a>
          </div>
        )}
      </main>
    </div>
  );
}
