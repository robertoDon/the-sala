# The Sala

## Git

- Projeto de uma pessoa só. Trabalhe direto na `main`: commit e push na `main`, sem criar branch nem pull request, a não ser que eu peça.

## Produto

- O The Sala não é um produto Don: nunca escrever "um produto Don" / "a Don product" (rodapé, ata, nada).
- Não falar de preço nem de "grátis" em lugar nenhum (landing, ajuda, app, meta tags). Hoje é gratuito, mas não será.

## Cara do The Sala (vale para todas as telas: landing, entrar, convite, app)

- Símbolo: o logo é um ponto cheio (a pessoa) e um anel (o agente). O anel (`IconeAgente`) marca agente em todo lugar; nada de ícone de robô.
- Uma cor de ação só: o roxo `--acento`, nos botões principais do app e das páginas públicas. Não é decoração (progresso é verde, gráfico é neutro).
- Uma paleta: os tokens de `styles.css` (claro e escuro). As páginas públicas usam os mesmos tokens e seguem o tema da pessoa, com botão para trocar.
- Mesma régua: Inter, títulos 600 com tracking apertado, botões com raio 8 (pequeno 7, grande 10), cartões 14–20, sombras discretas em degraus (nunca uma sombra grande e borrada).
- Moldura de produto: a lateral fica no fundo (`--app`) e o conteúdo é um cartão por cima. Hover é neutro (`--hover`), nunca roxo.
- Na conversa, agente escreve como documento (anel + "Claude de Ana", sem caixa); pessoas em caixas suaves; a mensagem da própria pessoa é neutra, à direita. Roxo na conversa só em botão de ação.
- `styles.css` é uma camada só, organizada por seção: mudar o estilo de algo é editar a regra dele, não acrescentar uma sobrescrita no fim.
- Minimalista e com cara própria: referências servem de inspiração, não de molde. O produto real (componentes do app) é o que aparece nas vitrines.
- Textos sem gênero ao falar com a pessoa ("Boas-vindas", "Te chamaram").
- Nada de janela do navegador (`confirm`, `prompt`, `alert`). Confirmar é no próprio app: `BotaoConfirmar` (o botão vira "Confirmar" com um balão dizendo o que acontece), `confirmar` no item do `Menu`, ou `LinhaConfirmar` para sair e apagar (com palavra a digitar quando apaga tudo). Erro ou aviso curto é `recado()`.
