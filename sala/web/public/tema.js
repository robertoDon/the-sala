// Tema escolhido neste aparelho, aplicado antes da primeira pintura (sem piscar).
// Fica num arquivo (e não em <script> dentro do index.html) para a política de conteúdo (CSP) não precisar liberar script inline.
try { var t = localStorage.getItem("sala.tema"); if (t === "claro" || t === "escuro") document.documentElement.dataset.tema = t; } catch (e) { /* sem storage */ }
