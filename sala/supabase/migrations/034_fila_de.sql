-- "Esperando você" fora do app: número no ícone, notificação e widget.
-- O aviso (função avisar, com a chave de serviço) precisa da fila de cada pessoa para mandar junto do push:
-- quantas coisas esperam por ela e as três primeiras. fila_de(quem) é a mesma regra de minha_fila, para uma
-- pessoa dada; só o servidor chama. minha_fila() passa a ser fila_de(auth.uid()), sem mudar o que devolve.

create or replace function public.fila_de(quem uuid)
returns table (sala_id uuid, sala text, tipo text, ref bigint, titulo text, desde timestamptz, prazo timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, s.nome, 'proposta', p.id,
         left(btrim(regexp_replace(split_part(btrim(p.texto), E'\n', 1), '[*_`#>]', '', 'g')), 140), p.criada_em, null::timestamptz
  from public.membros m
  join public.salas s on s.id = m.sala_id
  join public.mensagens p on p.sala_id = s.id and p.tipo = 'proposta' and p.estado = 'pendente' and not p.apagada
  where m.user_id = quem and m.papel in ('dono', 'membro')
    and not (p.user_id = quem and p.agente is null)
    and quem = any(public.faltam_na_proposta(p.id))
  union all
  select s.id, s.nome, 'tarefa', t.id, t.titulo, t.criada_em, t.prazo
  from public.membros m
  join public.salas s on s.id = m.sala_id
  join public.tarefas t on t.sala_id = s.id and t.estado = 'aberta' and t.responsavel = quem and t.responsavel_agente is null
  where m.user_id = quem and t.prazo is not null and t.prazo < now() + interval '2 days'
  order by 7 nulls first, 6;
$$;
revoke execute on function public.fila_de(uuid) from public, anon, authenticated;
grant execute on function public.fila_de(uuid) to service_role;

create or replace function public.minha_fila()
returns table (sala_id uuid, sala text, tipo text, ref bigint, titulo text, desde timestamptz, prazo timestamptz)
language sql stable security definer set search_path = '' as $$
  select * from public.fila_de(auth.uid());
$$;
