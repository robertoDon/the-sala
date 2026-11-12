// Testes das partes que não podem quebrar sem ninguém ver: nomes de arquivo, pedido ao agente,
// menções, markdown seguro, presença e tarefas atrasadas.
import { beforeEach, describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { atrasada, chaveDoNome, pedidoPara, presenca, type Tarefa } from "../supabase";
import { MENCAO_COLETIVA, Texto, chamaAgentes, chamaTodos, handle } from "../components/Texto";
import { definirIdioma, erro, gravado, t } from "../i18n";

beforeEach(() => definirIdioma("pt", false));

const CHAVE_VALIDA = /^[A-Za-z0-9._-]{1,120}$/; // a mesma regra do banco (preparar_mensagem)

describe("chave do arquivo no armazenamento", () => {
  test.each([
    ["Orçamento às 10.00.00.png", "Orcamento-as-10.00.00.png"],
    ["Proposta #2.pdf", "Proposta-2.pdf"],
    ["relatório final.md", "relatorio-final.md"],
  ])("%s vira %s", (nome, chave) => expect(chaveDoNome(nome)).toBe(chave));

  test("nunca deixa .. nem barra", () => {
    for (const nome of ["../../segredo.pdf", "a/../b.txt", "..", "...pdf", " print.png", "😀.png", ""]) {
      const c = chaveDoNome(nome);
      expect(c).toMatch(CHAVE_VALIDA);
      expect(c.includes("..")).toBe(false);
    }
  });

  test("nome enorme cabe no limite", () => expect(chaveDoNome(`${"a".repeat(300)}.pdf`)).toMatch(CHAVE_VALIDA));
});

describe("pedir ao meu agente", () => {
  const m = { id: 45 };
  test("Claude e ChatGPT abrem com o pedido escrito", () => {
    const c = pedidoPara("Claude", "Follou", m, "Roberto");
    expect(c.url).toMatch(/^https:\/\/claude\.ai\/new\?q=/);
    expect(decodeURIComponent(c.url!)).toContain("#45");
    expect(pedidoPara("ChatGPT", "Follou", m, "Roberto").url).toMatch(/^https:\/\/chatgpt\.com\/\?q=/);
  });
  test("os outros copiam o texto", () => {
    const g = pedidoPara("Gemini", "Follou", m, "Roberto");
    expect(g.url).toBeNull();
    expect(g.texto).toContain("responde_a=45");
  });
});

describe("menções", () => {
  test("acento e símbolo não importam", () => {
    expect(handle("José")).toBe("jose");
    expect(handle("Claude Code")).toBe("claudecode");
  });
  test("@agentes e @todos também em inglês", () => {
    for (const h of ["agentes", "agents"]) expect(chamaAgentes(handle(h))).toBe(true);
    for (const h of ["todos", "everyone", "all", "Everyone"]) expect(chamaTodos(handle(h))).toBe(true);
    expect(chamaAgentes("agent")).toBe(false);
    expect(chamaTodos("allison")).toBe(false);
  });
  test("pergunta a todos os agentes, em qualquer idioma", () => {
    for (const t of ["@agentes o que acham?", "@agents what do you think?", "oi @todos", "hey @everyone", "@all, ok?", "@Agents!"])
      expect(MENCAO_COLETIVA.test(t)).toBe(true);
    for (const t of ["@agentesx", "@allison oi", "@agent", "sem menção"]) expect(MENCAO_COLETIVA.test(t)).toBe(false);
  });
});

describe("markdown seguro", () => {
  const html = (t: string) => renderToStaticMarkup(<Texto texto={t} chamaMim={(x) => x === "@Ana"} />);
  test("formata negrito, link e menção", () => {
    const h = html("**oi** @Ana veja https://exemplo.com/a");
    expect(h).toContain("<strong>oi</strong>");
    expect(h).toContain("mencao-eu");
    expect(h).toContain('href="https://exemplo.com/a"');
  });
  test("não injeta HTML nem javascript:", () => {
    const h = html('<img src=x onerror=alert(1)> [x](javascript:alert(1)) <script>alert(1)</script>');
    expect(h).not.toContain("<img");
    expect(h).not.toContain("<script");
    expect(h).not.toContain('href="javascript:');
  });
});

describe("link com texto", () => {
  const html = (t: string) => renderToStaticMarkup(<Texto texto={t} chamaMim={() => false} />);
  test("[texto](endereço) vira link com o texto", () => {
    const h = html("Detalhe em [changelog](https://exemplo.com/changelog).");
    expect(h).toContain('<a href="https://exemplo.com/changelog" title="exemplo.com/changelog" target="_blank" rel="noopener noreferrer">changelog</a>.');
  });
  test("endereço com parênteses fecha no lugar certo", () => {
    expect(html("[Sala](https://pt.wikipedia.org/wiki/Sala_(arquitetura)) ok")).toContain('href="https://pt.wikipedia.org/wiki/Sala_(arquitetura)"');
  });
  test("texto que finge outro endereço mostra o destino de verdade", () => {
    const h = html("[banco.com](https://outro.example/entrar)");
    expect(h).toContain(">outro.example/entrar</a>");
    expect(h).not.toContain(">banco.com<");
    expect(html("[exemplo.com](https://www.exemplo.com/a)")).toContain(">exemplo.com</a>");
  });
  test("só http e https", () => {
    for (const t of ["[x](javascript:alert(1))", "[x](data:text/html,oi)", "[x](//outro.example)"]) expect(html(t)).not.toContain("<a ");
  });
  test("dentro de código fica como está", () => {
    expect(html("`[a](https://b.example)`")).toBe("<p><code>[a](https://b.example)</code></p>");
  });
});

describe("presença e prazos", () => {
  const agora = new Date();
  test("ouvindo agora", () => {
    const p = presenca({ user_id: "u", nome: "Claude Code", visto_em: agora.toISOString(), ouvindo_ate: new Date(+agora + 30_000).toISOString() });
    expect(p).toEqual({ ativo: true, texto: "ouvindo agora" });
  });
  test("visto há horas", () => {
    const p = presenca({ user_id: "u", nome: "Claude", visto_em: new Date(+agora - 3 * 3600_000).toISOString(), ouvindo_ate: null });
    expect(p.ativo).toBe(false);
    expect(p.texto).toBe("visto há 3 h");
  });
  const tarefa = (prazo: string | null, estado: Tarefa["estado"] = "aberta") => ({ prazo, estado } as Tarefa);
  test("atrasada só se aberta e com prazo vencido", () => {
    expect(atrasada(tarefa(new Date(+agora - 1000).toISOString()))).toBe(true);
    expect(atrasada(tarefa(new Date(+agora + 86_400_000).toISOString()))).toBe(false);
    expect(atrasada(tarefa(new Date(+agora - 1000).toISOString(), "feita"))).toBe(false);
    expect(atrasada(tarefa(null))).toBe(false);
  });
});

describe("idioma", () => {
  test("português e inglês lado a lado", () => {
    expect(t("Entrar", "Sign in")).toBe("Entrar");
    definirIdioma("en", false);
    expect(t("Entrar", "Sign in")).toBe("Sign in");
  });
  test("presença em inglês", () => {
    definirIdioma("en", false);
    const p = presenca({ user_id: "u", nome: "Claude", visto_em: new Date(Date.now() - 3 * 3600_000).toISOString(), ouvindo_ate: null });
    expect(p.texto).toBe("seen 3 h ago");
  });
  test("erros do banco e textos gravados viram inglês", () => {
    definirIdioma("en", false);
    expect(erro({ message: "Esta tarefa acabou de ser concluída. Veja a lista atualizada." })).toBe("This task was just completed. Check the updated list.");
    expect(erro("Algo que não conhecemos")).toBe("Algo que não conhecemos");
    expect(gravado("Aprovada.")).toBe("Approved.");
    expect(gravado("✓ Concluí a tarefa: **Revisar**\n\nok")).toBe("✓ Completed the task: **Revisar**\n\nok");
  });
  test("em português nada muda", () => {
    expect(erro({ message: "Tarefa não encontrada." })).toBe("Tarefa não encontrada.");
    expect(gravado("Aprovada.")).toBe("Aprovada.");
  });
  test("pedido ao agente em inglês", () => {
    definirIdioma("en", false);
    expect(pedidoPara("Gemini", "Follou", { id: 7 }, "Ana").texto).toMatch(/^Read the room "Follou"/);
  });
});

describe("quem aprova o quê", () => {
  test("proposta com aprovadores diz quem decide e quem falta", async () => {
    const { LinhaAprovacao } = await import("../components/Bolha");
    const html = renderToStaticMarkup(<LinhaAprovacao a={{ precisa: 2, quem: ["Roberto"], euAprovei: false, faltam: ["David"], indicados: ["Roberto", "David"], posso: false }} />);
    expect(html).toContain("Decidem: Roberto e David");
    expect(html).toContain("falta David");
  });
  test("decisão de plano aparece em inglês", () => {
    definirIdioma("en", false);
    expect(gravado("Aprovada. O plano virou tarefas, com o prazo previsto de cada uma.")).toBe("Approved. The plan became tasks, each with its planned due date.");
  });
});

describe("tarefa concluída vira uma linha na conversa", () => {
  test("lê título e resultado, nos dois idiomas", async () => {
    const { tarefaFeita } = await import("../components/Bolha");
    expect(tarefaFeita("✓ Concluí a tarefa: **Revisar o PR 5**\n\n65 de 65 testes passam em `9bc4de6`.")).toEqual({ titulo: "Revisar o PR 5", resultado: "65 de 65 testes passam em 9bc4de6." });
    expect(tarefaFeita("✓ Completed the task: **Ship it**")).toEqual({ titulo: "Ship it", resultado: "" });
    expect(tarefaFeita("Concluí a tarefa de revisar")).toBeNull();
  });
  test("mostra quem concluiu e o quê", async () => {
    const { EventoTarefa } = await import("../components/Bolha");
    const html = renderToStaticMarkup(<EventoTarefa id={9} quem="Claude de Roberto" titulo="Revisar o PR 5" resultado="Passou." quando="12:33" />);
    expect(html).toContain("Claude de Roberto");
    expect(html).toContain("concluiu");
    expect(html).toContain("Revisar o PR 5");
  });
});
