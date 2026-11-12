-- Fecha o que restava da auditoria no banco:
--
--  1. Tempo real sem eventos de exclusão. O Realtime não consegue aplicar as regras de quem lê (RLS) numa linha que
--     já foi apagada, então manda a chave dela para todo mundo que estiver ouvindo: quem saiu de qual sala, quem
--     votou em qual proposta, o nome de um agente tirado. Só ids, mas de salas alheias. A publicação passa a levar
--     só inserções e mudanças; o que o app precisava saber de uma exclusão (alguém saiu, uma reação foi tirada, um
--     item saiu da biblioteca) vira uma linha em `sinais`, que só chega a quem é da sala.
--  2. `pode_escrever(sala, pessoa)` só responde sobre outra pessoa para quem é da sala.

-- ---------------------------------------------------------------- 1. sinais

create table if not exists public.sinais (
  id bigint generated always as identity primary key,
  sala_id uuid not null,            -- sem ligação com salas: o sinal de uma sala que acabou de ser apagada não trava nada
  tipo text not null check (tipo in ('membro', 'reacao', 'biblioteca')),
  ref bigint,                       -- id da reação ou do item que saiu
  para uuid,                        -- quem saiu ou foi tirado: recebe o sinal mesmo já fora da sala
  criado_em timestamptz not null default now()
);
create index if not exists sinais_criado_em on public.sinais (criado_em);
alter table public.sinais enable row level security;
revoke all on public.sinais from anon, authenticated;
grant select on public.sinais to authenticated;
drop policy if exists "ver sinais das suas salas" on public.sinais;
create policy "ver sinais das suas salas" on public.sinais for select to authenticated
  using (public.eh_membro(sala_id) or para = auth.uid());

-- uma exclusão vira um sinal curto; os antigos somem na mesma hora (o sinal só serve a quem está com o app aberto)
create or replace function public.sinalizar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- a própria sala está sendo apagada: não há mais a quem avisar
  if not exists (select 1 from public.salas s where s.id = old.sala_id) then return null; end if;
  delete from public.sinais where criado_em < now() - interval '10 minutes';
  if tg_table_name = 'membros' then
    insert into public.sinais (sala_id, tipo, para) values (old.sala_id, 'membro', old.user_id);
  elsif tg_table_name = 'reacoes' then
    insert into public.sinais (sala_id, tipo, ref) values (old.sala_id, 'reacao', old.id);
  elsif tg_table_name = 'biblioteca' then
    insert into public.sinais (sala_id, tipo, ref) values (old.sala_id, 'biblioteca', old.id);
  end if;
  return null;
end $$;
revoke execute on function public.sinalizar() from public, anon, authenticated;
drop trigger if exists sinalizar on public.membros;
create trigger sinalizar after delete on public.membros for each row execute function public.sinalizar();
drop trigger if exists sinalizar on public.reacoes;
create trigger sinalizar after delete on public.reacoes for each row execute function public.sinalizar();
drop trigger if exists sinalizar on public.biblioteca;
create trigger sinalizar after delete on public.biblioteca for each row execute function public.sinalizar();

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sinais') then
    alter publication supabase_realtime add table public.sinais;
  end if;
end $$;
-- exclusões deixam de sair pelo tempo real (inserções e mudanças continuam, filtradas pelas regras de cada tabela)
alter publication supabase_realtime set (publish = 'insert, update');

-- ---------------------------------------------------------------- 2. pode_escrever

create or replace function public.pode_escrever(sala uuid, pessoa uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select (auth.uid() is null or pessoa = auth.uid() or public.eh_membro(sala)) -- sobre outra pessoa, só quem é da sala (ou o servidor)
     and exists (select 1 from public.membros m where m.sala_id = sala and m.user_id = pessoa and m.papel in ('dono', 'membro'));
$$;
revoke execute on function public.pode_escrever(uuid, uuid) from public, anon;
grant execute on function public.pode_escrever(uuid, uuid) to authenticated, service_role;
