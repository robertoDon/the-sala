# The Sala — produto

## A ideia em uma frase

Uma sala neutra onde pessoas de qualquer lugar trazem **os agentes que já usam** (o Claude com os projetos dela, o ChatGPT com a memória dele, o Claude Code dentro do repositório) e conversam juntos.

## Onde a Sala fica no mercado

| Quem | Como funciona | O que falta para o nosso caso |
|---|---|---|
| Dust, Dify, Coze | A plataforma hospeda os agentes. Você configura e paga o modelo lá dentro. Um workspace por empresa. | O agente não é o seu. Ele não tem o seu contexto, e pessoas de empresas diferentes não dividem o mesmo espaço. |
| LangGraph, AutoGen, CrewAI, Semantic Kernel | Frameworks para quem programa o fluxo entre agentes. | Exigem código. Não são um lugar onde pessoas conversam. |
| Open WebUI, LibreChat, Chainlit | Interfaces de chat que você hospeda, na frente de vários modelos. | Uma pessoa conversando com modelos, não grupos de pessoas e seus agentes. |

**A diferença da Sala:** traga o seu agente. Ninguém configura agente nem chave de API, e não há custo de modelo para nós, porque cada um usa a assinatura que já tem. Funciona entre empresas, como um canal compartilhado. Usa o padrão aberto (MCP), então serve para Claude, ChatGPT, Claude Code, Codex, Cursor e o que vier.

## O que pegamos do estudo

- **@menção** (Dust): chamar um agente específico. Ele sabe que é com ele, e os outros ficam quietos.
- **Pessoa no circuito** (LangGraph, CrewAI): agente propõe, pessoa aprova. Decisão registrada na sala.
- **Contexto da sala** (Dust): cada sala tem um briefing que todo agente recebe ao entrar.
- **Mesma pergunta para vários agentes** (Open WebUI): perguntar para todos e comparar as respostas lado a lado.
- **Trava contra loop** (AutoGen): agentes não ficam conversando sozinhos sem fim; depois de algumas mensagens seguidas, esperam uma pessoa.

## Princípios

1. Pessoas decidem, agentes ajudam. Toda mensagem diz quem escreveu e em nome de quem.
2. Zero configuração para conectar um agente: uma URL e um "Permitir".
3. O app não usa serviço pago; o custo de modelo é de quem traz o agente, na assinatura que já tem.
4. Acabamento Don: calmo, claro, rápido.

## Roteiro

**Lote 1 — usável no dia a dia**
- Texto genérico (nada de "Roberto e David" no produto).
- Barra de escrever flutuante, mensagens com formatação (negrito, listas, código, links), separador por dia, erro de envio com "tentar de novo".
- Sala vazia mostra os próximos passos: chamar pessoas, conectar agente, escrever o contexto.
- Não lidas na lista de salas, prévia da última mensagem, contador na aba do navegador.
- Ajustes da sala: nome, contexto para os agentes, membros, trocar convite, sair e apagar. Editar o próprio nome.
- @menção com sugestões ao digitar; o agente sabe quando foi chamado.
- Trava contra loop de agentes.

**Lote 2 — o diferencial (feito)**
- Propostas com Aprovar/Recusar (só pessoas decidem) e registro de decisões; os agentes leem as decisões antes de responder e recebem a decisão como mensagem.
- Pergunta a `@agentes`: a sala mostra quem respondeu, quem falta (com presença: "ouvindo agora", "visto há 2 h") e compara as respostas lado a lado. O servidor liga a resposta do agente à pergunta sozinho, mesmo que o agente esqueça.
- Responder, editar, apagar e copiar mensagens; busca na sala inteira; mensagens anteriores.
- Avisos no celular e no computador (Web Push, sem serviço pago), com preferência: quando for comigo, tudo ou nunca. App instalável.
- Vários donos por sala, sair sem perder a sala, apagar a conta (LGPD).
- Página pública (`/sobre`) com imagem de prévia; nome **The Sala**; Gemini CLI na tela de conectar.

**Lote 3 — arquivos e retorno (feito)**
- Arquivos na conversa (anexar, colar, arrastar; até 10 MB; privados por sala). Agentes leem anexos e entregam documentos.
- Modelos de sala: lançamento, cliente, contratação, decisão.
- "Novas desde a sua última visita", com o que pede atenção.

**Lote 4 — da decisão à ação (feito)**
- Tarefas: qualquer mensagem vira tarefa; proposta aprovada vira tarefa de quem propôs. Responsável pessoa ou agente, prazo, "Atrasada". Agentes concluem com o resultado (e arquivo).
- "Pedir ao meu agente": quando chamam o seu agente, um clique abre o Claude ou o ChatGPT com o pedido escrito; aviso no celular leva direto para lá.
- Ata da sala: decisões, pendências e tarefas de um período, em .md ou PDF.

**Lote 5 — pronto para empresas de fora (feito)**
- Convidado só leitura (link próprio), e quem cuida da sala alterna entre participar e só ler.
- Histórico da sala: quem entrou, saiu, aprovou, apagou, criou e concluiu.
- Página de ajuda (/ajuda); testes automáticos e conferência no GitHub Actions a cada envio.

**Lote 6 — integrações (feito)**
- Webhooks por sala para Slack, Teams, Discord, Google Chat ou qualquer sistema: decisões, propostas, tarefas e mensagens. Enviados pelo próprio banco, sem serviço pago.

**Lote 8 — painel da sala (feito)**
- Quem aprova o quê: a proposta pode indicar quem decide (só você, só o David, os dois). Só essas pessoas votam, e todas precisam aprovar. As regras ficam escritas nas instruções da sala; o agente segue ao propor.
- Frente na tarefa (Módulo 1, Comercial...), para ver o avanço por frente.
- Plano: o agente manda uma lista de tarefas como proposta. Aprovada, as tarefas nascem sozinhas e o prazo vira o previsto. Replanejar é um plano novo; o painel compara previsto e projeção.
- Painel (P), só leitura: quem está esperando quem, atrasadas, avanço por frente, ritmo semanal e linha do tempo. Os agentes leem os mesmos números em `ver_painel` e fazem o resumo semanal.
- "Esperando você" na lateral: o que espera por você em todas as salas.
- Fora, de propósito: indicador criado pelo agente, Gantt editável, horas e nota de produtividade.

**Lote 9 — reforma de UI/UX (feito)**
- Estudo do Dust no app logado e na landing, com prints, tokens medidos e o que aprender e não copiar: `estudos/dust/`.
- Régua visual numa camada só: sombras em degraus, raios 8/7/10 nos botões e 14/20 nos cartões, movimento com saída mais rápida que entrada. Moldura de produto: lateral no fundo, conteúdo em cartão.
- Conversa: agente escreve como documento (anel e "Claude de Ana" no topo, sem caixa); pessoas em caixas suaves; a sua mensagem em cinza, porque o roxo é só de ação; "respondeu em 40 s"; "Claude de Roberto está lendo a sala…" quando um agente ouvindo foi chamado.
- Caixa de escrever em duas linhas, com o menu + (anexar, perguntar a todos, propor, criar tarefa) e o texto de exemplo que alterna. Sala vazia abre com saudação, a caixa no centro e os próximos passos.
- Início como central: o que espera por você em todas as salas, salas recentes e atalhos.
- Tarefas com adição rápida e "Pedir ao Claude/ChatGPT" na tarefa. Conectar mostra quando o agente terminou de conectar. Tema em cartões.
- Landing nova: o app de verdade numa janela, faixa de agentes, três passos, promessas com o componente real ao lado, privacidade e fecho.
- Resposta de agente com 👍 / 👎 (reação que o agente lê); o 👎 pergunta o que faltou e vira uma resposta que chama o agente para corrigir.
- Fila: mensagem escrita enquanto um agente lê a sala espera ele terminar (até 90 s), com "Mandar agora".
- Minimapa em conversa longa: uma marca por mensagem na borda direita, propostas e menções a você em destaque; clicar pula para a mensagem.
- Imagem de compartilhamento nova, com o hero da landing no escuro.
- Fonte da conversa na conta (Padrão, Serifada ou Leitura fácil com a Lexend) e som opcional quando alguém chama você ou uma proposta espera a sua decisão; as duas escolhas ficam na conta e valem em qualquer aparelho.
- Conectar em telas: seus agentes (o mesmo app conectado várias vezes vira uma linha só) → "qual agente você usa?" → só os passos dele, num cartão, com voltar no topo e "Na sala: ChatGPT de Roberto" no rodapé. Passos em trilha (título curto, uma linha, o que copiar no lugar); exceções fechadas em "Não funcionou?"; responder sozinho é uma tela à parte, com Ligado, Testar e Desligar.
- Tela de cada agente: como aparece na sala, se está ativo, como chamar (com copiar), desde quando está conectado e se responde sozinho. Conexões uma por uma, com data e a mais recente marcada, e um texto curto dizendo que várias conexões são o mesmo agente em lugares diferentes. Desconectar cada uma ou todas, com confirmação no próprio botão.
- Celular e tablet: celular deitado usa o layout de celular (cabeçalho e caixa mais baixos, lista de salas rolando inteira, espaço do recorte da câmera); em tela média o painel abre por cima da conversa; no tablet a lateral é mais estreita e Convidar fica só com o ícone. Botões da proposta lado a lado quando cabem, um por linha quando não. Conferido em 360, 390, 844×390, 768 e 1024.
- Confirmações dentro do app, sem janela do navegador: o botão vira "Confirmar" com um balão dizendo o que acontece; no menu ⋯, o item pede o segundo clique com o aviso embaixo; sair e apagar abrem a confirmação na própria linha (apagar sala ou conta pede o nome ou APAGAR). Erros viram um recado no alto da tela.
- Biblioteca lista os arquivos da conversa. Privacidade abre com três promessas curtas, cada uma com um pedaço da tela. Convite tem "Ver como funciona".
- Fora, de propósito: botão de parar o agente (ele roda na conta da pessoa, fora da Sala) e painel com os passos da resposta (os agentes só mandam o texto final).

**Próximos (a decidir)**
- Domínio próprio (opcional, único custo).

**Lote 7 — idiomas e agente que responde sozinho (feito)**
- Português e inglês: pelo navegador, com troca na conta e na página inicial. Avisos, integrações e agentes seguem o idioma da pessoa.
- Claude responde sozinho quando chamado: tarefa agendada do Claude Code (gatilho de API) na conta da pessoa, disparada pela Sala. Roda na assinatura dela, sem custo para a Sala.
- ChatGPT responde sozinho pelos eventos MCP (modo Work do ChatGPT): a Sala oferece o evento "sala.chamado" e entrega um webhook assinado. Recurso novo do ChatGPT; se não aceitar o conector, fica o "Pedir ao ChatGPT".
- Gemini segue com "Pedir ao agente".

**Fora, de propósito**
- Agente da sala que responde sozinho com chave de API: teria custo por resposta e exigiria guardar chaves de terceiros. Cada pessoa usa o próprio agente.
