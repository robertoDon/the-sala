// Quem é quem: a Sala identifica o agente, além da pessoa (migração 033, servidor 4.33.0).
// A regra é a mesma no servidor dos agentes, nos avisos e no app (supabase/functions/_shared/agentes.ts).
import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  chama, comoChama, montarRoster, nomeDeAgente, nomeDoApp, resolverAgente, rosterTexto, type AgenteRoster, type PessoaRoster,
} from "../../../supabase/functions/_shared/agentes";
import { Texto } from "../components/Texto";
import { tomDoAgente } from "../supabase";

// a sala Circular Content: 2 pessoas, 4 agentes (dois por pessoa, cada par no mesmo app)
const ROBERTO = "u-roberto", CAT = "u-cat";
const pessoas: PessoaRoster[] = [
  { user_id: ROBERTO, nome: "Roberto", papel_sala: "dono" },
  { user_id: CAT, nome: "Cathleen Peji", papel_sala: "membro" },
];
const agentes: AgenteRoster[] = [
  // o agendado ficou com o nome do app ("Claude"); o interativo se registra como "Claude Code"
  { user_id: ROBERTO, nome: "Claude", declarado: false, papel: null, ultima: "2026-11-09T22:40:00Z" },
  { user_id: ROBERTO, nome: "Claude Code", declarado: true, papel: "writes the code, owns branches and PRs", ultima: null },
  { user_id: CAT, nome: "ChatGPT", declarado: true, papel: "coordinates and runs proposals", ultima: "2026-11-09T22:34:00Z" },
  { user_id: CAT, nome: "Codex", declarado: true, papel: "reviews, tests and reads AWS", ultima: "2026-11-09T22:31:00Z" },
];

describe("identidade do agente", () => {
  test("cliente antigo, sem nada declarado: continua com o nome do app, marcado como sem nome próprio", () => {
    expect(resolverAgente("ChatGPT", null)).toEqual({ agente: "ChatGPT", papel: null, declarado: false, origem: "app" });
    expect(resolverAgente("Claude", null, undefined)).toMatchObject({ agente: "Claude", declarado: false });
    expect(resolverAgente("Claude", null, "  ")).toMatchObject({ agente: "Claude", declarado: false });
  });

  test("duas conexões da mesma pessoa no mesmo app viram agentes diferentes", () => {
    const chatgpt = resolverAgente("ChatGPT", { agente: "ChatGPT", papel: "coordena" });
    const codex = resolverAgente("ChatGPT", { agente: "Codex", papel: "revisa e testa" });
    expect(chatgpt).toMatchObject({ agente: "ChatGPT", declarado: true, origem: "conexao" });
    expect(codex).toMatchObject({ agente: "Codex", papel: "revisa e testa", declarado: true, origem: "conexao" });
  });

  test("sem nome na conexão, vale o agente da chamada (Claude Code no mesmo conector do Claude agendado)", () => {
    expect(resolverAgente("Claude", null, "Claude Code")).toMatchObject({ agente: "Claude Code", declarado: true, origem: "chamada" });
    expect(resolverAgente("Claude", null)).toMatchObject({ agente: "Claude", declarado: false }); // o agendado, sem nada
  });

  test("conexão declarada não troca de nome por chamada", () => {
    expect(resolverAgente("ChatGPT", { agente: "Codex" }, "Codex")).toMatchObject({ agente: "Codex" }); // o mesmo nome: ok
    expect(resolverAgente("ChatGPT", { agente: "Codex" }, "codex")).toMatchObject({ agente: "Codex" });
    expect(resolverAgente("ChatGPT", { agente: "Codex" }, "ChatGPT")).toHaveProperty("erro");
  });

  test("nome curto, sem '-' (separa agente e pessoa no @) e sem palavra reservada", () => {
    for (const ok of ["Codex", "Claude·auto", "Claude Code", "Local Codex", "gpt.5", "Agente_2"]) expect(nomeDeAgente(ok)).toEqual({ nome: ok });
    expect(nomeDeAgente("  Claude   Code ")).toEqual({ nome: "Claude Code" });
    for (const ruim of ["", "Claude-auto", "@Codex", "1Codex", "agentes", "Everyone", "x".repeat(25), "<b>Codex</b>"]) expect(nomeDeAgente(ruim)).toHaveProperty("erro");
  });

  test("nome do app: Codex não vira ChatGPT", () => {
    expect(nomeDoApp("OpenAI Codex")).toBe("Codex");
    expect(nomeDoApp("ChatGPT")).toBe("ChatGPT");
    expect(nomeDoApp("Claude Code (cli)")).toBe("Claude Code");
    expect(nomeDoApp("claude.ai")).toBe("Claude");
    expect(nomeDoApp(null)).toBe("Agente");
  });
});

describe("chamada por @agente", () => {
  test("@Codex chama só o Codex, não o ChatGPT da mesma pessoa", () => {
    const t = "@Codex can you rerun the weight tests?";
    expect(chama(t, "Codex", "Cathleen Peji", false)).toBe(true);
    expect(chama(t, "ChatGPT", "Cathleen Peji", false)).toBe(false);
    expect(chama(t, "Claude", "Roberto", false)).toBe(false);
  });

  test("@Claude chama o agendado e @ClaudeCode o interativo, um sem o outro", () => {
    const sala = agentes.map((a) => a.nome);
    expect(chama("@Claude check the room", "Claude", "Roberto", false, sala)).toBe(true);
    expect(chama("@Claude check the room", "Claude Code", "Roberto", false, sala)).toBe(false);
    expect(chama("@ClaudeCode please write the PR", "Claude Code", "Roberto", false, sala)).toBe(true);
    expect(chama("@ClaudeCode please write the PR", "Claude", "Roberto", false, sala)).toBe(false);
  });

  test("@Claude Code escrito à mão, com espaço, chama o Claude Code e não o Claude", () => {
    const sala = agentes.map((a) => a.nome);
    expect(chama("@Claude Code please open the PR", "Claude Code", "Roberto", false, sala)).toBe(true);
    expect(chama("@Claude Code please open the PR", "Claude", "Roberto", false, sala)).toBe(false);
    // sem um "Claude Code" na sala, "@Claude Coordinate..." é o Claude
    expect(chama("@Claude Coordinate with Cat", "Claude", "Roberto", false, ["Claude"])).toBe(true);
    expect(chama("@Claude can you check?", "Claude", "Roberto", false, sala)).toBe(true);
  });

  test("nome com · ou . conta inteiro", () => {
    expect(chama("@Claude·auto check the room", "Claude·auto", "Roberto", false)).toBe(true);
    expect(chama("@Claude·auto check the room", "Claude", "Roberto", false)).toBe(false);
    expect(chama("@ClaudeAuto?", "Claude·auto", "Roberto", false)).toBe(true);
    expect(chama("done, @Codex.", "Codex", "Cathleen Peji", true)).toBe(true);
  });

  test("@Agente-Pessoa escolhe de quem é o agente", () => {
    expect(comoChama("@Codex-Cathleen", "Codex", "Cathleen Peji")).toBe("nome");
    expect(comoChama("@Codex-Roberto", "Codex", "Cathleen Peji")).toBe(null);
    expect(comoChama("@ClaudeCode-Roberto", "Claude Code", "Roberto")).toBe("nome");
  });

  test("@Cathleen chama a pessoa e todos os agentes dela, quando uma pessoa escreve", () => {
    const t = "@Cathleen can you confirm the branch?";
    expect(comoChama(t, "Codex", "Cathleen Peji")).toBe("pessoa");
    expect(chama(t, "Codex", "Cathleen Peji", false)).toBe(true);
    expect(chama(t, "ChatGPT", "Cathleen Peji", false)).toBe(true);
    expect(chama(t, "Claude", "Roberto", false)).toBe(false);
    // agente perguntando para a pessoa não acorda os agentes dela (senão vira corrente)
    expect(chama(t, "Codex", "Cathleen Peji", true)).toBe(false);
  });

  test("@agentes e @todos continuam chamando todos", () => {
    for (const t of ["@agentes o que acham?", "@agents thoughts?", "@everyone", "@todos"]) {
      expect(comoChama(t, "Codex", "Cathleen Peji")).toBe("coletivo");
      expect(chama(t, "Claude Code", "Roberto", false)).toBe(true);
    }
  });

  test("nome pesa mais que a pessoa e o coletivo na mesma mensagem", () => {
    expect(comoChama("@agentes and @Codex", "Codex", "Cathleen Peji")).toBe("nome");
    expect(comoChama("@agentes and @Cathleen", "Codex", "Cathleen Peji")).toBe("pessoa");
  });

  test("mensagens antigas: @ChatGPT e @Claude-Roberto chamam como antes", () => {
    expect(chama("@ChatGPT-Cathleen Local Codex can also access aws", "ChatGPT", "Cathleen Peji", false)).toBe(true);
    expect(chama("@ChatGPT-Cathleen Local Codex can also access aws", "Codex", "Cathleen Peji", false)).toBe(false);
    expect(chama("@Claude-Roberto please merge", "Claude", "Roberto", true)).toBe(true);
    expect(chama("sem menção nenhuma", "Claude", "Roberto", false)).toBe(false);
  });

  test("o app destaca @Claude·auto inteiro como uma menção", () => {
    const html = renderToStaticMarkup(<Texto texto="pode ver, @Claude·auto?" chamaMim={() => false} />);
    expect(html).toContain('<span class="mencao">@Claude·auto</span>');
  });
});

describe("Quem é quem", () => {
  const grupos = montarRoster(pessoas, agentes, { [ROBERTO]: "2026-11-09T22:35:00Z", [CAT]: "2026-11-09T22:37:00Z" });

  test("a Circular Content mostra 2 pessoas e 4 agentes, cada agente com a sua pessoa", () => {
    expect(grupos.map((g) => g.pessoa.nome)).toEqual(["Roberto", "Cathleen Peji"]);
    expect(grupos.flatMap((g) => g.agentes).length).toBe(4);
    expect(grupos[0].agentes.map((a) => a.nome).sort()).toEqual(["Claude", "Claude Code"]);
    expect(grupos[1].agentes.map((a) => a.nome).sort()).toEqual(["ChatGPT", "Codex"]);
  });

  test("o @ de cada agente: curto quando o nome é único, Agente-Pessoa quando se repete", () => {
    expect(grupos[1].agentes.find((a) => a.nome === "Codex")!.chamar).toBe("@Codex");
    expect(grupos[0].agentes.find((a) => a.nome === "Claude Code")!.chamar).toBe("@ClaudeCode");
    expect(grupos[0].agentes.find((a) => a.nome === "Claude")!.chamar).toBe("@Claude");
    const dois = montarRoster(pessoas, [{ user_id: ROBERTO, nome: "Codex" }, { user_id: CAT, nome: "Codex" }]);
    expect(dois.flatMap((g) => g.agentes.map((a) => a.chamar))).toEqual(["@Codex-Roberto", "@Codex-Cathleen"]);
  });

  test("o mesmo agente vindo duas vezes (banco e presença) aparece uma vez, com o que veio primeiro", () => {
    const g = montarRoster(pessoas, [...agentes, { user_id: CAT, nome: "Codex", papel: null, ultima: null }]);
    expect(g[1].agentes.filter((a) => a.nome === "Codex")).toHaveLength(1);
    expect(g[1].agentes.find((a) => a.nome === "Codex")!.papel).toBe("reviews, tests and reads AWS");
  });

  test("agente de quem não está na sala fica de fora", () => {
    const g = montarRoster(pessoas, [...agentes, { user_id: "u-outro", nome: "Gemini" }]);
    expect(g.flatMap((x) => x.agentes).some((a) => a.nome === "Gemini")).toBe(false);
  });

  test("texto do ler_mensagens: pessoa, agentes, papel, @, última atividade e o que não tem nome próprio", () => {
    const txt = rosterTexto(grupos, "en");
    expect(txt.split("\n")[0]).toMatch(/^Who's who/);
    expect(txt).toContain("- Cathleen Peji (person, @Cathleen also calls their agents) · last active 2026-11-09 22:37 UTC");
    expect(txt).toContain("  - agent Codex (@Codex) · reviews, tests and reads AWS · last active here 2026-11-09 22:31 UTC");
    expect(txt).toContain("  - agent Claude (@Claude) · no name of its own (app name)");
    expect(txt).toContain("  - agent Claude Code (@ClaudeCode) · writes the code, owns branches and PRs · not active here yet");
    expect(rosterTexto(grupos, "pt")).toContain("Quem é quem (gerado pela sala");
  });

  test("só nomes, papéis e horários: nada de email, id, chave ou credencial", () => {
    // mesmo que o objeto venha com mais campos, o texto só usa nome, papel e horário
    const sujo = montarRoster(
      [{ ...pessoas[0], email: "roberto@example.com", token: "sala_abc123" } as PessoaRoster],
      [{ ...agentes[0], conexao: "sessao:7f0c2b1e-aaaa", segredo: "sk-ant-oat01-xyz" } as AgenteRoster],
    );
    const txt = rosterTexto(sujo, "pt");
    for (const proibido of ["example.com", "sala_", "sessao:", "sk-ant", "u-roberto"]) expect(txt).not.toContain(proibido);
  });

  test("sala vazia não escreve nada", () => expect(rosterTexto([], "pt")).toBe(""));
});

describe("selo do agente", () => {
  test("cada agente tem um tom fixo, o mesmo em qualquer lugar", () => {
    expect(tomDoAgente("Codex")).toBe(tomDoAgente("codex"));
    expect(tomDoAgente("Claude Code")).toBe(tomDoAgente("ClaudeCode"));
    expect(tomDoAgente("Codex")).toMatch(/^tom-[1-6]$/);
    // os dois agentes de cada pessoa da Circular Content ficam com tons diferentes
    expect(tomDoAgente("Codex")).not.toBe(tomDoAgente("ChatGPT"));
    expect(tomDoAgente("Claude Code")).not.toBe(tomDoAgente("Claude"));
  });
});
