import { useEffect, useState } from "react";
import { linksDe, tamanhoLegivel, type Anexo } from "../supabase";
import { IconeArquivo, IconeBaixar } from "./Icones";
import { t } from "../i18n";

const ehImagem = (a: Anexo) => a.tipo.startsWith("image/") && !a.tipo.includes("svg");

// Imagens em miniatura (abre grande ao clicar); outros arquivos como cartão com nome, tamanho e baixar.
export function Anexos({ anexos }: { anexos: Anexo[] }) {
  const [ver, setVer] = useState<Record<string, string>>({});
  const [baixar, setBaixar] = useState<Record<string, string>>({});

  // os links valem 1 h: renova de tempos em tempos e ao voltar para a aba, para "Baixar" não cair num link vencido
  useEffect(() => {
    if (!anexos.length) return;
    let vivo = true;
    const paths = anexos.map((a) => a.path);
    const pedir = () => {
      linksDe(paths.filter((_, i) => ehImagem(anexos[i]))).then((v) => vivo && setVer(v));
      linksDe(paths, true).then((b) => vivo && setBaixar(b));
    };
    pedir();
    const cada = window.setInterval(pedir, 10 * 60_000);
    const aoVoltar = () => { if (!document.hidden) pedir(); };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => { vivo = false; window.clearInterval(cada); document.removeEventListener("visibilitychange", aoVoltar); };
  }, [anexos]);

  if (!anexos.length) return null;
  const imagens = anexos.filter(ehImagem);
  const outros = anexos.filter((a) => !ehImagem(a));

  return (
    <div className="anexos">
      {imagens.length > 0 && (
        <div className={`anexos-imagens ${imagens.length === 1 ? "uma" : ""}`}>
          {imagens.map((a) => (
            <a key={a.path} href={ver[a.path] || undefined} target="_blank" rel="noopener noreferrer" className="anexo-imagem" title={a.nome}>
              {ver[a.path] ? <img src={ver[a.path]} alt={a.nome} loading="lazy" /> : <span className="esqueleto" aria-hidden />}
            </a>
          ))}
        </div>
      )}
      {outros.map((a) => (
        <a key={a.path} className="anexo-arquivo" href={baixar[a.path] || undefined} title={t(`Baixar ${a.nome}`, `Download ${a.nome}`)}>
          <span className="anexo-icone" aria-hidden><IconeArquivo tamanho={18} /></span>
          <span className="anexo-info"><strong>{a.nome}</strong><span className="nota">{tamanhoLegivel(a.tamanho)}</span></span>
          <IconeBaixar tamanho={16} />
        </a>
      ))}
    </div>
  );
}
