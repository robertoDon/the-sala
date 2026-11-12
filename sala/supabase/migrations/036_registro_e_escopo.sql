-- O que tinha ficado de fora da varredura (035):
--
--  1. Apagar a conta não apaga mais o que a pessoa escreveu nas salas dos outros. As mensagens, propostas e decisões
--     ficam, sem nome ("Conta apagada") e sem os arquivos. Antes sumiam em cascata e o registro da sala ficava furado.
--  2. Quem escreveu a proposta não aprova a própria, quando as outras pessoas da sala bastam para decidir.
--     (Proposta do agente segue como antes: a pessoa dele decide, que é o uso normal.)
--  3. Chave de agente pode valer para uma sala só.
--  4. Sala apagada: os arquivos dela saem do armazenamento.

-- ---------------------------------------------------------------- 1. conta apagada

-- Um perfil fixo, sem login, que fica como autor do que foi escrito por contas apagadas.
create or replace function public.conta_apagada() returns uuid
language sql immutable set search_path = '' as $$ select 'a9a6ada0-0000-4000-8000-000000000000'::uuid $$;
revoke execute on function public.conta_apagada() from public, anon;
grant execute on function public.conta_apagada() to authenticated, service_role;

-- O perfil fixo não tem conta de login. A ligação perfil → conta continua valendo para todos os outros
-- (apagar a conta apaga o perfil): recriada como NOT VALID, ela não confere as linhas que já existem, só as novas.
alter table public.perfis drop constraint perfis_id_fkey;
insert into public.perfis (id, nome, avisos) values (public.conta_apagada(), 'Conta apagada', 'nada') on conflict (id) do nothing;
alter table public.perfis add constraint perfis_id_fkey foreign key (id) references auth.users (id) on delete cascade not valid;

-- Antes de o perfil sumir: a pessoa sai das salas do jeito certo (passa a sala adiante; sala só dela é apagada)
-- e o que ela escreveu nas salas que ficam passa para "Conta apagada", sem os arquivos (que são apagados).
create or replace function public.guardar_registro() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.id = public.conta_apagada() then
    raise exception 'Este perfil guarda o que foi escrito por contas apagadas.';
  end if;
  perform public.sair_de_tudo(old.id);
  update public.mensagens set user_id = public.conta_apagada(), anexos = '[]'::jsonb where user_id = old.id;
  update public.mensagens set decidida_por = public.conta_apagada() where decidida_por = old.id;
  update public.tarefas set criada_por = public.conta_apagada() where criada_por = old.id;
  update public.tarefas set concluida_por = public.conta_apagada() where concluida_por = old.id;
  -- tarefa aberta que era dela fica sem responsável (aparece no painel como "sem responsável")
  update public.tarefas set responsavel = null, responsavel_agente = null where responsavel = old.id and estado = 'aberta';
  update public.tarefas set responsavel = public.conta_apagada() where responsavel = old.id;
  -- links da biblioteca ficam (são referência da sala); os arquivos vão embora com a conta
  update public.biblioteca set user_id = public.conta_apagada() where user_id = old.id and path is null;
  return old;
end $$;
revoke execute on function public.guardar_registro() from public, anon, authenticated;
drop trigger if exists guardar_registro on public.perfis;
create trigger guardar_registro before delete on public.perfis for each row execute function public.guardar_registro();

-- ---------------------------------------------------------------- 2. o autor não aprova a própria proposta

-- Vale para proposta escrita pela pessoa (não pelo agente dela) e só quando as outras pessoas bastam para decidir:
-- numa sala de uma pessoa só, ou quando a regra pede o sim de todos, o autor continua votando.
create or replace function public._autor_nao_vota(p public.mensagens) returns boolean
language sql stable security definer set search_path = '' as $$
  select p.agente is null and (
    select count(*) from unnest(coalesce(p.aprovadores,
      array(select m.user_id from public.membros m where m.sala_id = p.sala_id and m.papel in ('dono', 'membro')))) u
    where u <> p.user_id
  ) >= public.aprovacoes_da_proposta(p.id);
$$;
revoke execute on function public._autor_nao_vota(public.mensagens) from public, anon, authenticated;

create or replace function public.faltam_na_proposta(proposta bigint) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select array(
    select u from unnest(coalesce(p.aprovadores,
      array(select m.user_id from public.membros m where m.sala_id = p.sala_id and m.papel in ('dono', 'membro')))) u
    where not exists (select 1 from public.votos v where v.proposta_id = p.id and v.user_id = u)
      and not (u = p.user_id and public._autor_nao_vota(p)))
  from public.mensagens p where p.id = proposta;
$$;
revoke execute on function public.faltam_na_proposta(bigint) from public, anon, authenticated;
grant execute on function public.faltam_na_proposta(bigint) to service_role;

create or replace function public.decidir(proposta bigint, aprovar boolean, nota text default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  p public.mensagens;
  e text := case when aprovar then 'aprovada' else 'recusada' end;
  n text := nullif(btrim(coalesce(nota, '')), '');
  nova bigint;
  titulo text;
  votos_sim int;
  i jsonb;
  pz timestamptz;
  tid bigint;
begin
  if auth.uid() is null or not public.eh_pessoa() then raise exception 'Só pessoas decidem propostas.'; end if;
  select * into p from public.mensagens where id = proposta and tipo = 'proposta' for update;
  if not found or not public.eh_membro(p.sala_id) then raise exception 'Proposta não encontrada.'; end if;
  if p.apagada then raise exception 'Esta proposta foi apagada.'; end if;
  if p.estado <> 'pendente' then raise exception 'Esta proposta já foi decidida.'; end if;
  if not public.pode_escrever(p.sala_id) then raise exception 'Nesta sala você só acompanha.'; end if;
  if p.aprovadores is not null and not (auth.uid() = any(p.aprovadores)) then
    raise exception 'Esta proposta precisa do sim de %.',
      (select string_agg(split_part(pf.nome, ' ', 1), ', ') from public.perfis pf where pf.id = any(p.aprovadores));
  end if;

  if aprovar then
    if p.user_id = auth.uid() and public._autor_nao_vota(p) then
      raise exception 'A proposta é sua: quem aprova é outra pessoa da sala.';
    end if;
    if exists (select 1 from public.votos v where v.proposta_id = proposta and v.user_id = auth.uid()) then
      raise exception 'Você já aprovou esta proposta. Falta a aprovação de outra pessoa.';
    end if;
    insert into public.votos (proposta_id, sala_id, user_id) values (proposta, p.sala_id, auth.uid());
    select count(*) into votos_sim from public.votos v where v.proposta_id = proposta;
    if votos_sim < public.aprovacoes_da_proposta(proposta) then
      perform public._registrar(p.sala_id, auth.uid(), null, 'aprovou (falta outra aprovação)', left(split_part(btrim(p.texto), E'\n', 1), 200));
      return null;
    end if;
  end if;

  update public.mensagens set estado = e, decidida_por = auth.uid(), decidida_em = now() where id = proposta;
  insert into public.mensagens (sala_id, user_id, texto, tipo, estado, responde_a)
  values (p.sala_id, auth.uid(),
    coalesce(left(n, 2000), case when not aprovar then 'Recusada.'
      when p.novo_contexto is not null then 'Aprovada. O contexto da sala foi trocado pelo texto da proposta.'
      when p.plano is not null then 'Aprovada. O plano virou tarefas, com o prazo previsto de cada uma.'
      else 'Aprovada.' end),
    'decisao', e, proposta)
  returning id into nova;

  if aprovar and p.novo_contexto is not null then
    update public.salas set contexto = btrim(p.novo_contexto) where id = p.sala_id;
  elsif aprovar and p.plano is not null then
    for i in select * from jsonb_array_elements(p.plano) loop
      pz := nullif(i->>'prazo', '')::timestamptz;
      tid := nullif(i->>'tarefa', '')::bigint;
      if tid is not null then
        update public.tarefas t set titulo = i->>'titulo', frente = i->>'frente', responsavel = nullif(i->>'responsavel', '')::uuid,
          responsavel_agente = i->>'responsavel_agente', prazo = pz, prazo_previsto = pz, plano = proposta
        where t.id = tid and t.sala_id = p.sala_id and t.estado <> 'cancelada';
        if found then continue; end if;
      end if;
      insert into public.tarefas (sala_id, titulo, origem, frente, responsavel, responsavel_agente, prazo, prazo_previsto, plano, criada_por, criada_por_agente)
      values (p.sala_id, i->>'titulo', proposta, i->>'frente', nullif(i->>'responsavel', '')::uuid, i->>'responsavel_agente', pz, pz, proposta, p.user_id, p.agente);
    end loop;
  elsif aprovar then
    titulo := btrim(regexp_replace(regexp_replace(split_part(btrim(p.texto), E'\n', 1), '[*_`#>]', '', 'g'), '^(eu\s+)?(proponho|sugiro|posso)\s+', '', 'i'));
    titulo := upper(left(titulo, 1)) || substr(titulo, 2);
    if char_length(titulo) > 120 then titulo := left(titulo, 119) || '…'; end if;
    if titulo = '' then titulo := 'Executar a proposta aprovada'; end if;
    insert into public.tarefas (sala_id, titulo, origem, responsavel, responsavel_agente, criada_por)
    values (p.sala_id, titulo, proposta, p.user_id, p.agente, auth.uid());
  end if;
  return nova;
end $$;
revoke execute on function public.decidir(bigint, boolean, text) from public, anon;
grant execute on function public.decidir(bigint, boolean, text) to authenticated;

-- ---------------------------------------------------------------- 3. chave de agente para uma sala só

-- sala_id vazio: a chave vale para todas as salas da pessoa (como sempre). Preenchido: o agente só enxerga essa sala.
alter table public.chaves add column if not exists sala_id uuid references public.salas (id) on delete cascade;
grant select (sala_id) on public.chaves to authenticated;

drop function if exists public.criar_chave(text);
create or replace function public.criar_chave(agente text, sala uuid default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  k text := 'sala_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  n text := left(btrim(regexp_replace(coalesce(criar_chave.agente, ''), '[[:cntrl:][:space:]]+', ' ', 'g')), 40);
begin
  if auth.uid() is null or not public.eh_pessoa() then raise exception 'Entre para criar uma chave.'; end if;
  if n = '' or lower(regexp_replace(n, '[^[:alnum:]]', '', 'g')) in ('todos', 'agentes', 'all', 'agents', 'everyone', 'pessoa', 'sala', '') then
    raise exception 'Escolha outro nome para o agente.';
  end if;
  if criar_chave.sala is not null and not public.eh_membro(criar_chave.sala) then raise exception 'Você não está nesta sala.'; end if;
  if (select count(*) from public.chaves c where c.user_id = auth.uid()) >= 50 then
    raise exception 'Muitas chaves. Apague as que não usa mais.';
  end if;
  insert into public.chaves (user_id, agente, hash, final, sala_id)
  values (auth.uid(), n, encode(extensions.digest(k, 'sha256'), 'hex'), right(k, 4), criar_chave.sala);
  return k;
end $$;
revoke execute on function public.criar_chave(text, uuid) from public, anon;
grant execute on function public.criar_chave(text, uuid) to authenticated;

-- ---------------------------------------------------------------- 4. arquivos da sala apagada

create or replace function public.arquivos_da_sala(sala uuid) returns setof text
language sql stable security definer set search_path = '' as $$
  select o.name from storage.objects o where o.bucket_id = 'arquivos' and split_part(o.name, '/', 1) = sala::text;
$$;
revoke execute on function public.arquivos_da_sala(uuid) from public, anon, authenticated;
grant execute on function public.arquivos_da_sala(uuid) to service_role;

-- a sala foi apagada (por quem cuida, ou porque a última pessoa saiu): pede à função de avisos para tirar os arquivos
create or replace function public.limpar_arquivos_da_sala() returns trigger
language plpgsql security definer set search_path = '' as $$
declare segredo text;
begin
  if not exists (select 1 from storage.objects o where o.bucket_id = 'arquivos' and split_part(o.name, '/', 1) = old.id::text) then
    return null;
  end if;
  select decrypted_secret into segredo from vault.decrypted_secrets where name = 'aviso_segredo';
  if segredo is null then return null; end if;
  perform net.http_post(
    url := 'https://cokzyrdmtnbsnnboxggp.supabase.co/functions/v1/avisar',
    body := jsonb_build_object('limpar_sala', old.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-aviso', segredo)
  );
  return null;
end $$;
revoke execute on function public.limpar_arquivos_da_sala() from public, anon, authenticated;
drop trigger if exists limpar_arquivos_da_sala on public.salas;
create trigger limpar_arquivos_da_sala after delete on public.salas for each row execute function public.limpar_arquivos_da_sala();

-- ---------------------------------------------------------------- 5. trava de quem só lê, nas tarefas

-- A trava confere quem está agindo: a pessoa logada; ou, quando é o servidor, quem está criando ou concluindo agora.
-- Antes, qualquer mudança feita pelo servidor numa tarefa já concluída conferia de novo quem a tinha concluído; se essa
-- pessoa já tinha saído da sala (ou estava apagando a conta), a mudança falhava, e apagar a conta podia não completar.
create or replace function public.trava_leitor_tarefa() returns trigger
language plpgsql security definer set search_path = '' as $$
declare quem uuid;
begin
  if auth.uid() is not null then quem := auth.uid();
  elsif tg_op = 'INSERT' then quem := new.criada_por;
  elsif new.concluida_por is distinct from old.concluida_por then quem := new.concluida_por;
  end if;
  if quem is not null and quem <> public.conta_apagada() and not public.pode_escrever(new.sala_id, quem) then
    raise exception 'Nesta sala você só acompanha. Peça a quem cuida da sala para poder mexer nas tarefas.';
  end if;
  return new;
end $$;
revoke execute on function public.trava_leitor_tarefa() from public, anon, authenticated;
