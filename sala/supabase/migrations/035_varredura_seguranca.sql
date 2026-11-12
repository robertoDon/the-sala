-- Varredura de segurança (novembro de 2026). Nada aqui muda o que o app faz no caminho normal; fecha os atalhos.
--
--  1. Leitura que faltava: memória, aprovações e idioma da sala (o app lia e o banco negava: Memória abria vazia).
--  2. Colunas que o cliente não deve escrever (convite, memória direto, foto do perfil).
--  3. Aprovações: quórum da sala vale também quando a proposta indica quem decide; voto de quem saiu ou virou
--     leitor não conta; pedir ajuste respeita quem decide; funções de contagem só para quem é da sala.
--  4. Registro: decisão e proposta já decidida não se apagam.
--  5. Convite: tirar alguém (ou deixar só lendo) troca os links; app conectado não lê o link de convite.
--  6. Sala nunca passa para quem só lê se há quem escreve.
--  7. Quem só lê: não reage nem edita mensagem antiga.
--  8. Avisos: só endereço de serviço de push conhecido, com teto por pessoa.
--  9. Webhooks: endereço público de verdade (nada de IP em qualquer notação); saem com quem ligou.
-- 10. Carimbo do servidor: data da mensagem e do item da biblioteca não vêm do cliente; tipo e tamanho do
--     arquivo da biblioteca vêm do armazenamento.
-- 11. Nomes sem caractere de controle (nome da pessoa e nome do agente da chave entram no que os agentes leem).
-- 12. Trava de agentes sem corrida; teto de mensagens por minuto.
-- 13. Cofre: o segredo do "responder sozinho" some junto com a linha (inclusive ao apagar a conta).
-- 14. Higiene: search_path fixo, funções de gatilho fora da API, nada para anon.

-- ---------------------------------------------------------------- 1 e 2. colunas

grant select (memoria, aprovacoes, idioma) on public.salas to authenticated;

revoke update on public.salas from anon, authenticated;
revoke update (id, convite, convite_leitura, criada_em, criada_por, limite_agentes, memoria, nome, contexto, aprovacoes, idioma) on public.salas from anon, authenticated;
grant update (nome, contexto, aprovacoes, idioma) on public.salas to authenticated;

revoke update on public.perfis from anon, authenticated;
revoke update (id, nome, avatar, avisos, idioma, guia_visto, guia_sala_visto, criado_em) on public.perfis from anon, authenticated;
grant update (nome, avisos, idioma, guia_visto, guia_sala_visto) on public.perfis to authenticated;

-- ---------------------------------------------------------------- 3. aprovações

create or replace function public.aprovacoes_necessarias(sala uuid) returns int
language sql stable security definer set search_path = '' as $$
  select least(
    (select s.aprovacoes from public.salas s where s.id = sala),
    greatest(1, (select count(*)::int from public.membros m where m.sala_id = sala and m.papel in ('dono', 'membro')))
  )
  where auth.uid() is null or public.eh_membro(sala); -- servidor, ou quem é da sala
$$;
revoke execute on function public.aprovacoes_necessarias(uuid) from public, anon;
grant execute on function public.aprovacoes_necessarias(uuid) to authenticated, service_role;

-- só o servidor e as funções do banco usam estas duas (respondiam sobre qualquer sala, por id sequencial)
revoke execute on function public.aprovacoes_da_proposta(bigint), public.faltam_na_proposta(bigint) from public, anon, authenticated;
grant execute on function public.aprovacoes_da_proposta(bigint), public.faltam_na_proposta(bigint) to service_role;

-- quem propõe pode indicar quem decide, mas não pode baixar o número de aprovações que a sala pede
create or replace function public.checar_proposta() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  i jsonb;
  itens jsonb := '[]'::jsonb;
  pz timestamptz;
  tid bigint;
  r uuid;
  precisa int;
begin
  if tg_op = 'UPDATE' then
    if new.aprovadores is distinct from old.aprovadores or new.plano is distinct from old.plano then
      raise exception 'Quem aprova e o plano não mudam depois de propor. Faça uma proposta nova.';
    end if;
    return new;
  end if;

  if new.aprovadores is not null then
    new.aprovadores := array(select distinct u from unnest(new.aprovadores) u where u is not null);
    if cardinality(new.aprovadores) = 0 then
      new.aprovadores := null;
    elsif exists (select 1 from unnest(new.aprovadores) u where not exists (
      select 1 from public.membros m where m.sala_id = new.sala_id and m.user_id = u and m.papel in ('dono', 'membro'))) then
      raise exception 'Quem aprova precisa ser uma pessoa da sala que pode escrever.';
    else
      precisa := least(
        (select s.aprovacoes from public.salas s where s.id = new.sala_id),
        greatest(1, (select count(*)::int from public.membros m where m.sala_id = new.sala_id and m.papel in ('dono', 'membro'))));
      if cardinality(new.aprovadores) < precisa then
        raise exception 'Esta sala pede % aprovações: indique pelo menos % pessoas para decidir, ou nenhuma.', precisa, precisa;
      end if;
    end if;
  end if;

  if new.plano is not null then
    if jsonb_typeof(new.plano) <> 'array' then raise exception 'O plano precisa ser uma lista de tarefas.'; end if;
    for i in select * from jsonb_array_elements(new.plano) loop
      if jsonb_typeof(i) <> 'object' or btrim(coalesce(i->>'titulo', '')) = '' then
        raise exception 'Toda tarefa do plano precisa de título.';
      end if;
      r := nullif(i->>'responsavel', '')::uuid;
      if r is not null and not exists (select 1 from public.membros m where m.sala_id = new.sala_id and m.user_id = r) then
        raise exception 'O responsável de "%" precisa estar na sala.', i->>'titulo';
      end if;
      begin
        pz := nullif(i->>'prazo', '')::timestamptz;
      exception when others then
        raise exception 'Prazo inválido no plano: %', i->>'prazo';
      end;
      tid := nullif(i->>'tarefa', '')::bigint;
      if tid is not null and not exists (select 1 from public.tarefas t where t.id = tid and t.sala_id = new.sala_id and t.estado <> 'cancelada') then
        raise exception 'A tarefa % não está nesta sala.', tid;
      end if;
      itens := itens || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'titulo', left(btrim(regexp_replace(i->>'titulo', '[[:cntrl:]]+', ' ', 'g')), 200),
        'frente', nullif(left(btrim(regexp_replace(coalesce(i->>'frente', ''), '[[:cntrl:]]+', ' ', 'g')), 40), ''),
        'responsavel', r,
        'responsavel_agente', case when r is null then null else nullif(left(btrim(regexp_replace(coalesce(i->>'responsavel_agente', ''), '[[:cntrl:]]+', ' ', 'g')), 40), '') end,
        'prazo', pz,
        'tarefa', tid)));
    end loop;
    new.plano := itens;
  end if;
  return new;
end $$;
revoke execute on function public.checar_proposta() from public, anon, authenticated;

-- saiu da sala ou passou a só ler: o voto em proposta ainda aberta deixa de contar
create or replace function public.votos_seguem_membros() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.papel <> 'leitor' then return null; end if;
  delete from public.votos v using public.mensagens p
   where p.id = v.proposta_id and p.estado = 'pendente' and v.sala_id = old.sala_id and v.user_id = old.user_id;
  return null;
end $$;
revoke execute on function public.votos_seguem_membros() from public, anon, authenticated;
drop trigger if exists votos_seguem_membros on public.membros;
create trigger votos_seguem_membros after delete or update of papel on public.membros
for each row execute function public.votos_seguem_membros();

-- pedir ajuste: só quem decide a proposta (quando ela indica quem decide)
create or replace function public.pedir_ajuste(proposta bigint, nota text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  p public.mensagens;
  n text := nullif(btrim(coalesce(nota, '')), '');
  nova bigint;
begin
  if auth.uid() is null or not public.eh_pessoa() then raise exception 'Só pessoas pedem ajuste.'; end if;
  select * into p from public.mensagens where id = proposta and tipo = 'proposta' for update;
  if not found or not public.eh_membro(p.sala_id) then raise exception 'Proposta não encontrada.'; end if;
  if p.apagada then raise exception 'Esta proposta foi apagada.'; end if;
  if p.estado <> 'pendente' then raise exception 'Esta proposta já foi decidida.'; end if;
  if not public.pode_escrever(p.sala_id) then raise exception 'Nesta sala você só acompanha.'; end if;
  if p.aprovadores is not null and not (auth.uid() = any(p.aprovadores)) then
    raise exception 'Só quem decide esta proposta pede ajuste.';
  end if;
  if n is null then raise exception 'Diga o que precisa mudar: quem propôs lê isto.'; end if;

  update public.mensagens set estado = 'ajuste', decidida_por = auth.uid(), decidida_em = now() where id = proposta;
  delete from public.votos v where v.proposta_id = proposta;
  insert into public.mensagens (sala_id, user_id, texto, tipo, estado, responde_a)
  values (p.sala_id, auth.uid(), left(n, 2000), 'decisao', 'ajuste', proposta)
  returning id into nova;
  perform public._registrar(p.sala_id, auth.uid(), null, 'pediu ajuste', left(n, 200));
  return nova;
end $$;
revoke execute on function public.pedir_ajuste(bigint, text) from public, anon;
grant execute on function public.pedir_ajuste(bigint, text) to authenticated;

-- ---------------------------------------------------------------- 4. registro

create or replace function public.apagar_mensagem(mensagem bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.mensagens;
begin
  if not public.eh_pessoa() then raise exception 'Só pessoas apagam mensagens.'; end if;
  select * into m from public.mensagens where id = mensagem for update;
  if not found or not public.eh_membro(m.sala_id) then raise exception 'Mensagem não encontrada.'; end if;
  if m.user_id <> auth.uid() and not public.eh_dono(m.sala_id) then
    raise exception 'Você apaga as suas mensagens e as dos seus agentes.';
  end if;
  if m.tipo = 'decisao' or (m.tipo = 'proposta' and m.estado in ('aprovada', 'recusada')) then
    raise exception 'Decisões e propostas já decididas ficam no registro da sala.';
  end if;
  update public.mensagens set apagada = true, texto = 'Mensagem apagada.', anexos = '[]'::jsonb where id = mensagem;
end $$;
revoke execute on function public.apagar_mensagem(bigint) from public, anon;
grant execute on function public.apagar_mensagem(bigint) to authenticated;

-- ---------------------------------------------------------------- 5. convite

-- alguém foi tirado da sala, ou passou a só ler: os links antigos deixam de valer (senão voltava com o mesmo link)
create or replace function public.trocar_convite_ao_tirar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or auth.uid() = old.user_id then return null; end if; -- saiu por conta própria, ou é o servidor
  if tg_op = 'UPDATE' and new.papel <> 'leitor' then return null; end if;
  update public.salas set convite = replace(gen_random_uuid()::text, '-', ''),
                          convite_leitura = replace(gen_random_uuid()::text, '-', '')
   where id = old.sala_id;
  return null;
end $$;
revoke execute on function public.trocar_convite_ao_tirar() from public, anon, authenticated;
drop trigger if exists trocar_convite_ao_tirar on public.membros;
create trigger trocar_convite_ao_tirar after delete or update of papel on public.membros
for each row execute function public.trocar_convite_ao_tirar();

-- o link de convite é para a pessoa mandar; o app conectado (token do agente) não precisa dele
create or replace function public.minhas_salas()
returns table (id uuid, nome text, convite text, convite_leitura text, contexto text, papel text, nao_lidas bigint, pendentes bigint, lido_ate bigint,
  minhas_tarefas bigint, ultima_id bigint, ultima_texto text, ultima_agente text, ultima_nome text, ultima_em timestamptz, ultima_tipo text, idioma text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.nome,
         case when m.papel <> 'leitor' and public.eh_pessoa() then s.convite end,
         case when m.papel = 'dono' and public.eh_pessoa() then s.convite_leitura end,
         s.contexto, m.papel,
         (select count(*) from public.mensagens x
           where x.sala_id = s.id and x.id > m.lido_ate and x.user_id <> auth.uid()),
         (select count(*) from public.mensagens x
           where x.sala_id = s.id and x.tipo = 'proposta' and x.estado = 'pendente' and not x.apagada),
         m.lido_ate,
         (select count(*) from public.tarefas t where t.sala_id = s.id and t.estado = 'aberta' and t.responsavel = auth.uid()),
         u.id, left(case when u.texto = '' and jsonb_array_length(u.anexos) > 0 then '📎 ' || (u.anexos->0->>'nome') else u.texto end, 140),
         u.agente, p.nome, u.criada_em, u.tipo, s.idioma
  from public.membros m
  join public.salas s on s.id = m.sala_id
  left join lateral (select * from public.mensagens y where y.sala_id = s.id order by y.id desc limit 1) u on true
  left join public.perfis p on p.id = u.user_id
  where m.user_id = auth.uid()
  order by coalesce(u.criada_em, s.criada_em) desc;
$$;
revoke execute on function public.minhas_salas() from public, anon;
grant execute on function public.minhas_salas() to authenticated;

-- só a pessoa (não o app conectado em nome dela) mexe no que é dela
create or replace function public.marcar_lida(sala uuid, ate bigint) returns void
language sql security definer set search_path = '' as $$
  update public.membros set lido_ate = greatest(lido_ate, ate)
  where sala_id = sala and user_id = auth.uid() and public.eh_pessoa();
$$;
revoke execute on function public.marcar_lida(uuid, bigint) from public, anon;
grant execute on function public.marcar_lida(uuid, bigint) to authenticated;

create or replace function public.desligar_despertador(agente text) returns void
language plpgsql security definer set search_path = '' as $$
declare s uuid;
begin
  if auth.uid() is null or not public.eh_pessoa() then raise exception 'Entre para desligar.'; end if;
  delete from public.despertadores d where d.user_id = auth.uid() and d.agente = desligar_despertador.agente returning d.segredo into s;
  if s is not null then delete from vault.secrets where id = s; end if;
  perform public._recalcular_desperta(auth.uid(), desligar_despertador.agente);
end $$;
revoke execute on function public.desligar_despertador(text) from public, anon;
grant execute on function public.desligar_despertador(text) to authenticated;

create or replace function public.desligar_eventos(agente text) returns void
language plpgsql security definer set search_path = '' as $$
declare e record;
begin
  if auth.uid() is null or not public.eh_pessoa() then raise exception 'Entre para desligar.'; end if;
  for e in select x.id from public.eventos_inscricoes x where x.user_id = auth.uid() and x.agente = desligar_eventos.agente loop
    perform public.apagar_inscricao_evento(e.id);
  end loop;
end $$;
revoke execute on function public.desligar_eventos(text) from public, anon;
grant execute on function public.desligar_eventos(text) to authenticated;

-- ---------------------------------------------------------------- 6. quem cuida da sala

-- o último que cuida saiu: passa para quem escreve há mais tempo; só vai para quem só lê se não há mais ninguém
create or replace function public._sair(sala uuid, quem uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare proximo uuid;
begin
  perform 1 from public.salas where id = sala for update;
  if exists (select 1 from public.membros where sala_id = sala and user_id = quem and papel = 'dono')
     and not exists (select 1 from public.membros where sala_id = sala and user_id <> quem and papel = 'dono') then
    select user_id into proximo from public.membros where sala_id = sala and user_id <> quem
     order by (papel = 'membro') desc, entrou_em limit 1;
    if proximo is null then
      delete from public.salas where id = sala;
      return;
    end if;
    update public.membros set papel = 'dono' where sala_id = sala and user_id = proximo;
  end if;
  delete from public.membros where sala_id = sala and user_id = quem;
end $$;
revoke execute on function public._sair(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- 7. quem só lê

create or replace function public.trava_leitor() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.pode_escrever(new.sala_id, new.user_id) then
    raise exception 'Nesta sala você só acompanha. Peça a quem cuida da sala para poder escrever.';
  end if;
  return new;
end $$;
revoke execute on function public.trava_leitor() from public, anon, authenticated;

create or replace function public.trava_leitor_tarefa() returns trigger
language plpgsql security definer set search_path = '' as $$
declare quem uuid := coalesce(auth.uid(), case when tg_op = 'INSERT' then new.criada_por else new.concluida_por end);
begin
  if quem is not null and not public.pode_escrever(new.sala_id, quem) then
    raise exception 'Nesta sala você só acompanha. Peça a quem cuida da sala para poder mexer nas tarefas.';
  end if;
  return new;
end $$;
revoke execute on function public.trava_leitor_tarefa() from public, anon, authenticated;

-- reação é escrita (o agente lê): quem só acompanha não reage, pessoa ou agente dela; e ninguém enche uma mensagem de reações
create or replace function public.trava_reacao() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.pode_escrever(new.sala_id, new.user_id) then
    raise exception 'Nesta sala você só acompanha.';
  end if;
  if char_length(new.emoji) > 16 or new.emoji ~ '[\u0001-\u007e]' then -- emoji, não texto
    raise exception 'Reaja com um emoji.';
  end if;
  if (select count(*) from public.reacoes r
       where r.mensagem_id = new.mensagem_id and r.user_id = new.user_id and coalesce(r.agente, '') = coalesce(new.agente, '')) >= 6 then
    raise exception 'São muitas reações na mesma mensagem.';
  end if;
  return new;
end $$;
revoke execute on function public.trava_reacao() from public, anon, authenticated;
drop trigger if exists trava_reacao on public.reacoes;
create trigger trava_reacao before insert on public.reacoes for each row execute function public.trava_reacao();

create or replace function public.editar_mensagem(mensagem bigint, texto text) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.mensagens; t text := btrim(coalesce(texto, ''));
begin
  if not public.eh_pessoa() then raise exception 'Só pessoas editam mensagens.'; end if;
  select * into m from public.mensagens where id = mensagem for update;
  if not found or not public.eh_membro(m.sala_id) or m.user_id <> auth.uid() or m.agente is not null then
    raise exception 'Você só edita as suas mensagens.';
  end if;
  if not public.pode_escrever(m.sala_id) then raise exception 'Nesta sala você só acompanha.'; end if;
  if m.apagada or m.tipo <> 'mensagem' then
    raise exception 'Propostas e decisões não mudam depois de enviadas. Apague e proponha de novo.';
  end if;
  if t = '' or char_length(t) > 20000 then raise exception 'O texto precisa ter entre 1 e 20.000 caracteres.'; end if;
  update public.mensagens set texto = t, editada_em = now() where id = mensagem;
end $$;
revoke execute on function public.editar_mensagem(bigint, text) from public, anon;
grant execute on function public.editar_mensagem(bigint, text) to authenticated;

-- ---------------------------------------------------------------- 8. avisos (Web Push)

-- o servidor faz POST no endereço cadastrado: só serviço de push de navegador, e poucos aparelhos por pessoa
create or replace function public._push_valido(endpoint text) returns boolean
language sql immutable set search_path = '' as $$
  select char_length(endpoint) <= 1000 and endpoint ~
    '^https://([a-z0-9-]+\.)*(googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)/[^[:space:][:cntrl:]]+$';
$$;
revoke execute on function public._push_valido(text) from public, anon, authenticated;

create or replace function public.inscrever(endpoint text, p256dh text, auth text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.eh_pessoa() then raise exception 'Entre para receber avisos.'; end if;
  if not public._push_valido(inscrever.endpoint) or char_length(coalesce(inscrever.p256dh, '')) not between 20 and 200
     or char_length(coalesce(inscrever.auth, '')) not between 8 and 100 then
    raise exception 'Este navegador não entrega avisos do The Sala.';
  end if;
  if not exists (select 1 from public.inscricoes i where i.endpoint = inscrever.endpoint)
     and (select count(*) from public.inscricoes i where i.user_id = auth.uid()) >= 20 then
    raise exception 'Muitos aparelhos com aviso ligado. Desligue os avisos em um deles antes.';
  end if;
  insert into public.inscricoes as i (endpoint, user_id, p256dh, auth)
  values (inscrever.endpoint, auth.uid(), inscrever.p256dh, inscrever.auth)
  on conflict on constraint inscricoes_pkey
  do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, criada_em = now();
end $$;
revoke execute on function public.inscrever(text, text, text) from public, anon;
grant execute on function public.inscrever(text, text, text) to authenticated;

delete from public.inscricoes i where not public._push_valido(i.endpoint);

-- ---------------------------------------------------------------- 9. webhooks

-- host com nome e domínio de verdade: corta IP em qualquer notação (127.0.0.1, 2130706433, 0x7f000001, [::1]),
-- nome sem ponto, redes internas e os serviços que apontam qualquer nome para um IP
create or replace function public._url_externa(url text) returns boolean
language sql immutable set search_path = '' as $$
  select url ~ '^https://[^/?#@[:space:]]+(/|[?]|$)'
     and h ~* '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z]$'
     and h !~* '(^|\.)(localhost|local|internal|intranet|localdomain|svc|lan|home|corp|test|invalid|example|nip\.io|sslip\.io|xip\.io|localtest\.me|lvh\.me)$'
     and h !~* '^metadata\.'
  from (select lower(split_part(split_part(split_part(url, '/', 3), '?', 1), ':', 1))) t(h);
$$;
revoke execute on function public._url_externa(text) from public, anon, authenticated;

-- quem ligou a integração saiu da sala: ela para de enviar (o endereço era dele)
create or replace function public.integracoes_seguem_quem_ligou() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.integracoes i where i.sala_id = old.sala_id and i.criada_por = old.user_id;
  return null;
end $$;
revoke execute on function public.integracoes_seguem_quem_ligou() from public, anon, authenticated;
drop trigger if exists integracoes_seguem_quem_ligou on public.membros;
create trigger integracoes_seguem_quem_ligou after delete on public.membros
for each row execute function public.integracoes_seguem_quem_ligou();

-- ---------------------------------------------------------------- 10. carimbo do servidor

-- mensagem escrita pelo app: a data é a de agora e ninguém nasce "substituída"
create or replace function public.carimbar_mensagem() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    new.criada_em := now();
    new.substituida_por := null;
  end if;
  return new;
end $$;
revoke execute on function public.carimbar_mensagem() from public, anon, authenticated;
drop trigger if exists carimbar_mensagem on public.mensagens;
create trigger carimbar_mensagem before insert on public.mensagens for each row execute function public.carimbar_mensagem();

-- item da biblioteca escrito pelo app: data de agora; se é arquivo, ele precisa existir e o tipo e o tamanho são os dele
create or replace function public.carimbar_biblioteca() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o record;
begin
  new.titulo := left(btrim(regexp_replace(coalesce(new.titulo, ''), '[[:cntrl:]]+', ' ', 'g')), 200);
  if auth.uid() is null then return new; end if;
  new.criado_em := now();
  if new.tipo = 'arquivo' then
    select obj.metadata->>'mimetype' as mime, (obj.metadata->>'size')::bigint as tamanho into o
      from storage.objects obj where obj.bucket_id = 'arquivos' and obj.name = new.path;
    if not found then raise exception 'Arquivo não encontrado. Envie de novo.'; end if;
    new.mime := left(coalesce(o.mime, 'application/octet-stream'), 100);
    new.tamanho := o.tamanho;
  end if;
  return new;
end $$;
revoke execute on function public.carimbar_biblioteca() from public, anon, authenticated;
drop trigger if exists carimbar_biblioteca on public.biblioteca;
create trigger carimbar_biblioteca before insert on public.biblioteca for each row execute function public.carimbar_biblioteca();

-- ---------------------------------------------------------------- 11. nomes sem caractere de controle

-- o nome da pessoa aparece no "Quem é quem" que todo agente lê: uma linha só, sem quebra que finja outra seção
create or replace function public.limpar_nome_do_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.nome := left(btrim(regexp_replace(coalesce(new.nome, ''), '[[:cntrl:][:space:]]+', ' ', 'g')), 60);
  if new.nome = '' then new.nome := 'Pessoa'; end if;
  return new;
end $$;
revoke execute on function public.limpar_nome_do_perfil() from public, anon, authenticated;
drop trigger if exists limpar_nome_do_perfil on public.perfis;
create trigger limpar_nome_do_perfil before insert or update of nome on public.perfis
for each row execute function public.limpar_nome_do_perfil();
update public.perfis set nome = nome where nome ~ '[[:cntrl:]]' or nome <> btrim(nome);

-- nome do agente da chave: uma linha, e nunca um dos nomes que chamam todo mundo
create or replace function public.criar_chave(agente text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  k text := 'sala_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  n text := left(btrim(regexp_replace(coalesce(criar_chave.agente, ''), '[[:cntrl:][:space:]]+', ' ', 'g')), 40);
begin
  if auth.uid() is null or not public.eh_pessoa() then raise exception 'Entre para criar uma chave.'; end if;
  if n = '' or lower(regexp_replace(n, '[^[:alnum:]]', '', 'g')) in ('todos', 'agentes', 'all', 'agents', 'everyone', 'pessoa', 'sala', '') then
    raise exception 'Escolha outro nome para o agente.';
  end if;
  if (select count(*) from public.chaves c where c.user_id = auth.uid()) >= 50 then
    raise exception 'Muitas chaves. Apague as que não usa mais.';
  end if;
  insert into public.chaves (user_id, agente, hash, final)
  values (auth.uid(), n, encode(extensions.digest(k, 'sha256'), 'hex'), right(k, 4));
  return k;
end $$;
revoke execute on function public.criar_chave(text) from public, anon;
grant execute on function public.criar_chave(text) to authenticated;

-- ---------------------------------------------------------------- 12. trava de agentes e teto por minuto

create or replace function public.trava_agentes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare lim int;
begin
  -- teto por minuto, por pessoa (com os agentes dela) e por sala: ninguém inunda a conversa nem os avisos
  if (select count(*) from (select m.user_id, m.criada_em from public.mensagens m where m.sala_id = new.sala_id order by m.id desc limit 60) u
       where u.user_id = new.user_id and u.criada_em > now() - interval '1 minute') >= 40 then
    raise exception 'Muitas mensagens em pouco tempo. Espere um minuto.';
  end if;
  if new.agente is null then return new; end if;
  -- uma mensagem de agente por vez nesta sala: sem isto, um lote simultâneo passava todo pela contagem abaixo
  perform pg_advisory_xact_lock(hashtextextended('trava_agentes:' || new.sala_id::text, 0));
  select s.limite_agentes into lim from public.salas s where s.id = new.sala_id;
  lim := coalesce(lim, 5);
  if (
    select count(*) = lim and bool_and(t.agente is not null)
    from (select agente from public.mensagens where sala_id = new.sala_id order by id desc limit lim) t
  ) then
    raise exception 'Já são % mensagens seguidas de agentes nesta sala. Espere uma pessoa escrever antes de continuar.', lim;
  end if;
  return new;
end $$;
revoke execute on function public.trava_agentes() from public, anon, authenticated;

-- ---------------------------------------------------------------- 13. cofre e arquivos de quem sai

-- a linha do "responder sozinho" sumiu (desligou, ou a conta foi apagada): o segredo dela some do cofre junto
create or replace function public.apagar_segredo_do_cofre() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from vault.secrets where id = old.segredo;
  return null;
end $$;
revoke execute on function public.apagar_segredo_do_cofre() from public, anon, authenticated;
drop trigger if exists apagar_segredo_do_cofre on public.despertadores;
create trigger apagar_segredo_do_cofre after delete on public.despertadores for each row execute function public.apagar_segredo_do_cofre();
drop trigger if exists apagar_segredo_do_cofre on public.eventos_inscricoes;
create trigger apagar_segredo_do_cofre after delete on public.eventos_inscricoes for each row execute function public.apagar_segredo_do_cofre();

-- os arquivos que a pessoa subiu (para o servidor apagar do armazenamento quando ela apaga a conta)
create or replace function public.arquivos_de(quem uuid) returns setof text
language sql stable security definer set search_path = '' as $$
  select o.name from storage.objects o where o.bucket_id = 'arquivos' and split_part(o.name, '/', 2) = quem::text;
$$;
revoke execute on function public.arquivos_de(uuid) from public, anon, authenticated;
grant execute on function public.arquivos_de(uuid) to service_role;

-- ---------------------------------------------------------------- 14. higiene

alter function public.app_url() set search_path = '';
revoke execute on function public.biblioteca_registrar_novo(), public.idioma_da_sala_nova() from public, anon, authenticated;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
