// Tipos de arquivo que o armazenamento aceita (a mesma lista está no bucket "arquivos", migração 038).
// O que o navegador executaria se abrisse direto (página, SVG, script) é guardado como texto simples;
// tipo desconhecido vira arquivo genérico, que só baixa. Nada se perde: o nome e a extensão ficam na mensagem.
export const TIPOS_ACEITOS = [
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/heic", "image/heif", "image/bmp", "image/tiff",
  "audio/*", "video/*",
  "application/pdf", "application/json", "application/rtf", "application/octet-stream",
  "application/zip", "application/x-zip-compressed", "application/gzip", "application/x-tar", "application/x-7z-compressed", "application/vnd.rar",
  "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text", "application/vnd.oasis.opendocument.spreadsheet", "application/vnd.oasis.opendocument.presentation",
  "text/plain", "text/markdown", "text/csv",
];

const aceito = (t: string) => TIPOS_ACEITOS.some((a) => (a.endsWith("/*") ? t.startsWith(a.slice(0, -1)) && /^[a-z]+\/[\w.+-]+$/.test(t) : a === t));

/** O tipo com que o arquivo é guardado: o próprio, se está na lista; texto simples, se é código ou página; genérico, no resto. */
export function tipoSeguro(tipo: string | null | undefined): string {
  const t = (tipo ?? "").split(";")[0].trim().toLowerCase();
  if (aceito(t)) return t;
  if (/^text\//.test(t) || /(html|xml|svg|javascript|ecmascript|typescript|yaml|sql|x-sh|shellscript|css)/.test(t)) return "text/plain";
  return "application/octet-stream";
}
