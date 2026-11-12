-- O armazenamento passa a aceitar só os tipos de arquivo da lista (a mesma de functions/_shared/arquivos.ts).
-- Página, SVG e script não entram como tais: o app e o servidor dos agentes guardam esses como texto simples, e tipo
-- desconhecido como arquivo genérico. Assim ninguém hospeda uma página no endereço do projeto subindo direto pela API.
-- Aplicar só depois de o app e as funções desta versão estarem no ar (eles é que convertem o tipo antes de enviar).
update storage.buckets set allowed_mime_types = array[
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/heic', 'image/heif', 'image/bmp', 'image/tiff',
  'audio/*', 'video/*',
  'application/pdf', 'application/json', 'application/rtf', 'application/octet-stream',
  'application/zip', 'application/x-zip-compressed', 'application/gzip', 'application/x-tar', 'application/x-7z-compressed', 'application/vnd.rar',
  'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet', 'application/vnd.oasis.opendocument.presentation',
  'text/plain', 'text/markdown', 'text/csv'
] where id = 'arquivos';
