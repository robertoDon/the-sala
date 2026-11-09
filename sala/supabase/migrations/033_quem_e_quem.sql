-- Quem é quem: a Sala identifica o agente, além da pessoa.
-- Antes, o nome do agente era o nome do app que conectou ("Claude", "ChatGPT"), e duas conexões da mesma pessoa
-- no mesmo app (Claude interativo e Claude agendado; ChatGPT e Codex) saíam com o mesmo nome. Agora cada conexão
-- declara um nome curto ("Codex", "Claude·auto") e, se quiser, um papel de uma linha. O nome vai para as mesmas
-- colunas `agente` de sempre (mensagens, tarefas, reações, presença, despertar): autoria = pessoa (user_id) + agente.
-- Mensagens antigas ficam como estão ("ChatGPT de Cathleen"). Cliente que não declara nada continua com o nome do app.

-- papel de uma linha e se o nome foi declarado (false = nome do app, "sem nome próprio" no Quem é quem)
alter table public.agentes add column if not exists papel text check (papel is null or char_length(papel) <= 120);
alter table public.agentes add column if not exists app text check (app is null or char_length(app) <= 40);
alter table public.agentes add column if not exists declarado boolean not null default false;

-- nome declarado por conexão (registrar_agente): uma sessão MCP ("sessao:<Mcp-Session-Id>") ou uma chave de agente
-- ("chave:<id>"). Fica por conexão, não por mensagem. Só o servidor dos agentes lê e escreve.
create table if not exists public.conexoes (
  chave     text primary key check (chave ~ '^(sessao|chave):[A-Za-z0-9._-]{8,200}$'),
  user_id   uuid not null references public.perfis on delete cascade,
  agente    text not null check (char_length(agente) between 1 and 40),
  papel     text check (papel is null or char_length(papel) <= 120),
  usada_em  timestamptz not null default now()
);
create index if not exists conexoes_usada on public.conexoes (usada_em);
create index if not exists conexoes_user on public.conexoes (user_id);
alter table public.conexoes enable row level security;
revoke all on public.conexoes from anon, authenticated;

-- Quem é quem da sala: cada pessoa (com a última mensagem dela aqui) e os agentes dela, com papel, se o nome é
-- próprio e a última atividade nesta sala. Só nomes, papéis e horários: nada de email, chave ou conexão.
-- Agentes contam quando falaram aqui ou foram vistos nos últimos 30 dias (os mesmos que o app mostra).
create or replace function public.quem_e_quem(sala uuid)
returns table (user_id uuid, pessoa text, papel_sala text, agente text, papel text, declarado boolean, ultima timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.eh_membro(sala) then raise exception 'Sala não encontrada.'; end if;
  return query
  with ms as (
    select m.user_id, m.agente, max(m.criada_em) as ultima
      from public.mensagens m where m.sala_id = sala and not m.apagada group by m.user_id, m.agente
  ), mb as (
    select x.user_id, x.papel, p.nome from public.membros x join public.perfis p on p.id = x.user_id where x.sala_id = sala
  )
  select mb.user_id, mb.nome, mb.papel, null::text, null::text, null::boolean,
         (select ms.ultima from ms where ms.user_id = mb.user_id and ms.agente is null)
    from mb
  union all
  select a.user_id, mb.nome, mb.papel, a.nome, a.papel, a.declarado, ms.ultima
    from mb join public.agentes a on a.user_id = mb.user_id
    left join ms on ms.user_id = a.user_id and ms.agente = a.nome
   where ms.ultima is not null or a.visto_em > now() - interval '30 days'
  union all
  -- falou aqui, mas a presença sumiu (conexão antiga ou tirada): continua no histórico da sala
  select ms.user_id, mb.nome, mb.papel, ms.agente, null::text, false, ms.ultima
    from ms join mb on mb.user_id = ms.user_id
   where ms.agente is not null and not exists (select 1 from public.agentes a where a.user_id = ms.user_id and a.nome = ms.agente);
end $$;
revoke execute on function public.quem_e_quem(uuid) from public, anon;
grant execute on function public.quem_e_quem(uuid) to authenticated, service_role;

-- o app mostra o papel e o nome próprio junto da presença (tempo real já assina public.agentes)
