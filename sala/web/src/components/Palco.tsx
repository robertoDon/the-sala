// Cenários das páginas públicas (landing, entrar, convite, consentimento).
export type Palco = "arcos" | "arco" | "sol";
/** Cenário quente atrás das vitrines: arquitetura desenhada (arcos de pedra, luz entrando), no lugar de foto.
 *  Só decoração: as cores vêm de --palco-* em landing.css e seguem o tema. */
export function CenaPalco({ tipo, className = "lp-palco-cena" }: { tipo: Palco; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 600 480" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="600" height="480" className="pc-parede" />
      {tipo === "arcos" && (
        <>
          {[40, 230, 420].map((x) => (
            <g key={x}>
              <path d={`M${x} 480V190a70 70 0 0 1 140 0v290Z`} className="pc-vao" />
              <path d={`M${x} 480V190a70 70 0 0 1 22-51l0 341Z`} className="pc-sombra" />
            </g>
          ))}
          <path d="M0 400L600 300V480H0Z" className="pc-luz" />
        </>
      )}
      {tipo === "arco" && (
        <>
          <path d="M150 480V230a150 150 0 0 1 300 0v250Z" className="pc-vao" />
          <path d="M150 480V230a150 150 0 0 1 44-106l0 356Z" className="pc-sombra" />
          <path d="M260 120L600 0V480H420Z" className="pc-luz" />
          <rect y="440" width="600" height="40" className="pc-degrau" />
        </>
      )}
      {tipo === "sol" && (
        <>
          {[0, 1, 2, 3].map((i) => <path key={i} d={`M${120 + i * 120} 0h52L${-40 + i * 120} 480h-52Z`} className="pc-luz" />)}
          <path d="M380 480V300a110 110 0 0 1 220 0v180Z" className="pc-vao" />
          <path d="M0 0h600v36H0Z" className="pc-sombra" />
        </>
      )}
    </svg>
  );
}
