// Ícones de 24 px, traço 2, pontas redondas.
type P = { tamanho?: number };
const base = (t = 20) => ({
  width: t, height: t, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true,
});

export const IconeMais = ({ tamanho }: P) => <svg {...base(tamanho)}><path d="M12 5v14M5 12h14" /></svg>;
export const IconeEnviar = ({ tamanho }: P) => <svg {...base(tamanho)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
export const IconePlugue = ({ tamanho }: P) => (
  <svg {...base(tamanho)}><path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0V7ZM12 16v5" /></svg>
);
export const IconeConvite = ({ tamanho }: P) => (
  <svg {...base(tamanho)}><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6" /></svg>
);
export const IconeVoltar = ({ tamanho }: P) => <svg {...base(tamanho)}><path d="M15 6l-6 6 6 6" /></svg>;
export const IconeFechar = ({ tamanho }: P) => <svg {...base(tamanho)}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const IconeCopiar = ({ tamanho }: P) => (
  <svg {...base(tamanho)}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></svg>
);
export const IconeSair = ({ tamanho }: P) => (
  <svg {...base(tamanho)}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10" /></svg>
);
// Marca de agente: o anel do logo (o ponto cheio é a pessoa, o anel é o agente dela).
export const IconeAgente = ({ tamanho }: P) => (
  <svg {...base(tamanho)} strokeWidth={2.4}><circle cx="12" cy="12" r="6.5" /></svg>
);

// O símbolo vivo para telas vazias: o anel (agente) chega perto do ponto (pessoa), assenta e solta um eco.
// Parado (movimento reduzido), fica no lugar de descanso.
export const SimboloVivo = ({ tamanho = 32 }: P) => (
  <svg className="simbolo-vivo" width={tamanho} height={tamanho} viewBox="0 0 32 32" aria-hidden overflow="visible">
    <circle className="sv-eco" cx="20.5" cy="16" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <circle className="sv-ponto" cx="10.5" cy="16" r="4.8" fill="currentColor" />
    <circle className="sv-anel" cx="20.5" cy="16" r="4.2" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
);

export const Marca = () => (
  <div className="marca">
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <circle cx="11" cy="16" r="4.5" fill="var(--fundo)" />
      <circle cx="21" cy="16" r="3.6" fill="none" stroke="var(--fundo)" strokeWidth="1.8" />
    </svg>
    <span>The Sala</span>
  </div>
);

export const IconeGoogle = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);
export const IconeAjustes = ({ tamanho }: P) => (
  <svg {...base(tamanho)}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>
);
export const IconeCheck = ({ tamanho }: P) => <svg {...base(tamanho)}><path d="M5 12l5 5L20 7" /></svg>;
export const IconeResponder = ({ tamanho }: P) => <svg {...base(tamanho)}><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 6 6v5" /></svg>;
export const IconeLapis = ({ tamanho }: P) => <svg {...base(tamanho)}><path d="M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4" /></svg>;
export const IconeLixo = ({ tamanho }: P) => <svg {...base(tamanho)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>;
export const IconeBusca = ({ tamanho }: P) => <svg {...base(tamanho)}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
export const IconeDecisao = ({ tamanho }: P) => <svg {...base(tamanho)}><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>;
export const IconeRecusa = ({ tamanho }: P) => <svg {...base(tamanho)}><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></svg>;
export const IconeColunas = ({ tamanho }: P) => <svg {...base(tamanho)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /></svg>;
export const IconeSino = ({ tamanho }: P) => <svg {...base(tamanho)}><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2ZM10 21h4" /></svg>;
export const IconeProposta = ({ tamanho }: P) => <svg {...base(tamanho)}><path d="M5 4h14v16l-7-4-7 4V4Z" /></svg>;
export const IconeMais3 = ({ tamanho }: P) => <svg {...base(tamanho)}><path d="M6 12h.01M12 12h.01M18 12h.01" /></svg>;
export const IconeClipe = ({ tamanho }: P) => <svg {...base(tamanho)}><path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4L15.5 7" /></svg>;
export const IconeArquivo = ({ tamanho }: P) => <svg {...base(tamanho)}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /></svg>;
export const IconeBaixar = ({ tamanho }: P) => <svg {...base(tamanho)}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>;
export const IconeTarefa = ({ tamanho }: P) => <svg {...base(tamanho)}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 12 3 3 5-6" /></svg>;
export const IconeCaixa = ({ tamanho }: P) => <svg {...base(tamanho)}><rect x="4" y="4" width="16" height="16" rx="3" /></svg>;
export const IconeAbrir = ({ tamanho }: P) => <svg {...base(tamanho)}><path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></svg>;
export const IconeDocumento = ({ tamanho }: P) => <svg {...base(tamanho)}><path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M9 13h6M9 17h6M14 3v5h5" /></svg>;
export const IconeReagir = ({ tamanho }: P) => <svg {...base(tamanho)}><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01" /></svg>;
export const IconeSeta = ({ tamanho }: P) => <svg {...base(tamanho)}><path d="M7 17 17 7M8 7h9v9" /></svg>;
export const IconeRelogio = ({ tamanho }: P) => <svg {...base(tamanho)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;

// Marcador redondo de tarefa: vazio, com o check aparecendo no hover; cheio quando feita.
export const Marcador = ({ feito, tamanho = 18 }: { feito?: boolean; tamanho?: number }) => (
  <svg width={tamanho} height={tamanho} viewBox="0 0 20 20" aria-hidden className={feito ? "marcador feito" : "marcador"}>
    <circle cx="10" cy="10" r="8.6" />
    <path d="m6.4 10.3 2.4 2.4 4.8-5" />
  </svg>
);
export const IconeAjuda = ({ tamanho }: P) => <svg {...base(tamanho)}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01" /></svg>;
export const IconeMapa = ({ tamanho }: P) => <svg {...base(tamanho)}><path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2V6ZM9 4v14M15 6v14" /></svg>;
export const IconeBiblioteca = ({ tamanho }: P) => <svg {...base(tamanho)}><rect x="3.5" y="4" width="4" height="16" rx="1" /><rect x="9" y="4" width="4" height="16" rx="1" /><path d="m14.6 5.3 3.8-.9 3.1 14.3-3.8.9Z" /></svg>;
export const IconeLink = ({ tamanho }: P) => <svg {...base(tamanho)}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>;
export const IconeMemoria = ({ tamanho }: P) => <svg {...base(tamanho)}><path d="M6 3.5h9l3.5 3.5v13.5H6Z" /><path d="M14.5 3.5V7.5h4" /><path d="M9 12h6M9 15.5h6M9 8.5h2.5" /></svg>;
export const IconePainel = ({ tamanho }: P) => <svg {...base(tamanho)}><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M21 20H3" /></svg>;
export const IconeCasa = ({ tamanho }: P) => <svg {...base(tamanho)}><path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-8.5Z" /></svg>;
// Polegar para cima (ou para baixo, girado): avaliar a resposta de um agente
export const IconeJoinha = ({ tamanho, baixo }: P & { baixo?: boolean }) => (
  <svg {...base(tamanho)} style={baixo ? { transform: "rotate(180deg)" } : undefined}><path d="M7 10v10H4V10h3ZM7 10l4-7a2 2 0 0 1 3 2l-1 5h5.5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.3 20H7" /></svg>
);
export const IconeChave = ({ tamanho }: P) => <svg {...base(tamanho)}><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 8.7-8.7M16 7l3 3M14 9l2 2" /></svg>;
