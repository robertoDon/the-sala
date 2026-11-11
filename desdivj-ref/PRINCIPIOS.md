# Referência: @desdivj (Divan Raj), UI + motion

Estudo de 42 posts (out–nov 2026 e dois de jan 2026): 49 vídeos e 7 imagens. A mídia não vai para o git (é de terceiros).
Para recriar a pasta:

```bash
cd desdivj-ref && python3 -I baixar.py .
```

```bash
cd desdivj-ref && for f in midia/*.mp4; do d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f"); ffmpeg -v error -y -i "$f" -vf "fps=12/$d,scale=480:-2,tile=4x3" -frames:v 1 "contact-sheets/$(basename "$f" .mp4).jpg"; done
```

`indice.json` lista cada post (id, data, texto, arquivos).

## O que vi

- **Paleta.** A UI é quase toda branca, cinza e preta. A cor entra só para dizer estado: o ponto vermelho de "• This week" e de "• Today", o "in 19 min", a pílula "Ships Thu" e as barras de "Storage 72%". Os botões de ação são pretos. Quando entra cor de verdade (o laranja do cartão "Injured Examinations", o coral do "Website refresh"), ela marca o item que está acontecendo agora.
- **Tipografia.** Neo-grotesca e títulos-manchete com o número na frente: "3 projects ship this week.", "freedom kicks in at 5pm.". Os KPIs são enormes e a unidade fica pequena em cinza: "86 /100", "42 min", "2 days", "7h 16m".
- **Apresentação.** Os cartões e janelas flutuam sobre fotos quentes: arcos de pedra, folhas de bananeira, pétalas, pele. É só vitrine; a interface em si continua neutra.
- **Motion.** O cursor aparece e conduz a demo. Uma lupa aproxima o detalhe (o "Lena is typing…" e o chip "Schedule a call"). Day/Week/Month e Board/List/Timeline trocam de visão sem corte: o indicador desliza e as barras se reorganizam. Tooltip escuro aparece no hover da barra. Aprovar uma proposta é deslizar: o botão fica laranja, o check se desenha e aparece "Northwind Studio has been notified". Pagar mostra os avatares se ligando e o "Money sent". O vazio se mexe: as camadas isométricas montam e desmontam a pilha.
- **Data viz.** As barras empilhadas usam azul, roxo, cinza e um topo vermelho (o sono), as bolhas de avatares mostram usuários por plano e os medidores são segmentados.
- **Escala.** O mesmo conceito (a próxima consulta em 42 min) aparece no Watch, na Dynamic Island, no widget, no cartão de desktop e no celular, com a mesma hierarquia em cada tamanho.

## 5 princípios (e onde entraram no The Sala)

1. **Um quente só para estado.** A cor não é decoração nem ação: só marca o que pede atenção ou o que está avançando.
   Ref.: `2111766039788974453` (Shipping stack / Bento countdown / Segmented meters), `2111407894587699490` ("• Today", "in 19 min").
   No app, o token `--quente` entra em atraso, não lidas (`.sala-novas`, `.aba-num`, divisor "Novas"), barra de avanço por frente e projeção atrasada. O roxo continua só para ação; aprovado e concluído continuam verdes.

2. **A manchete é o estado, com o número na frente.** Quem abre a tela lê uma frase e já sabe o que fazer; o detalhe vem embaixo, em cinza. Os números de estado são grandes e a unidade é pequena.
   Ref.: `2111763654400245830` ("3 projects ship this week."), `2118651671635226726` ("86 /100", "7h 16m"), `2108886680359035068` ("42 min").
   No app, o Início ganhou um rótulo com ponto quente ("Quarta-feira, 11 de nov"), a manchete "3 coisas esperam por você." e um resumo ("2 decisões para tomar · 1 tarefa atrasada"). O Painel da sala abre com três números: Feitas `8 /14`, Para decidir e Atrasadas (quente quando > 0).

3. **Trocar de visão é contínuo.** O que muda desliza; nada pisca, e o olho segue o indicador.
   Ref.: `2115772554199867776` (Board → List → Timeline), `2118651671635226726` (Day/Week/Month), `2120464164854608106` (Table ↔ Cards).
   No app, todas as `.abas` (tarefas, biblioteca, busca, conta, ajustes) ganharam um fundo único que desliza até a aba escolhida (`indicador`, em `components/indicador.ts`). As barras de avanço enchem da esquerda ao abrir o painel.

4. **A confirmação acontece no próprio objeto.** Nada de aviso solto em outro canto: o cartão em que você agiu responde e diz quem já sabe.
   Ref.: `2111763654400245830` (slide to approve → "Northwind Studio has been notified"), `2119738295039250507` ("Call scheduled" → "Added to Google Calendar"), `2110241934082220211` ("Money sent").
   No app, quando uma proposta é decidida com a pessoa olhando, a pílula entra num carimbo, o check se desenha, o cartão acende de leve em verde e o pé diz "os agentes da sala já sabem". Ao recarregar a página, a proposta aparece parada, sem animação.

5. **O vazio se mexe e já diz o próximo passo.** Uma ilustração mínima em movimento lento e uma frase curta.
   Ref.: `2119377174713229695` ("No projects yet. Start your first one."), `2109911910053519465` (animated bento empty states).
   No app, o novo `SimboloVivo` é o próprio logo em movimento: o anel (agente) chega perto do ponto (pessoa), assenta e solta um eco. Ele aparece na sala sem mensagens, no painel vazio e na primeira sala do Início. Com movimento reduzido, fica parado no lugar de descanso.

## O que ficou de fora, de propósito

- **Fotos de arquitetura e natureza atrás das telas.** Servem para apresentar o produto, não para usar no app. Se entrarem, é na landing, como moldura das vitrines.
- **Cursor, lupa e som.** É linguagem de vídeo de demo. Podem entrar num vídeo da landing, não no produto.
- **Mesmo conceito em Watch, Dynamic Island e widget.** Fica como próximo passo: o "esperando você" cabe numa notificação rica e num widget do app instalado.
