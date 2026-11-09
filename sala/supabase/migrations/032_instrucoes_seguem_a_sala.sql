-- Troca das instruções da sala conta como qualquer proposta: vale o número de aprovações da sala
-- (antes pedia o sim de todas as pessoas que escrevem, seja qual fosse a regra).
-- Aprovadores indicados continuam dizendo quem decide; a sala diz quantos.

create or replace function public.aprovacoes_da_proposta(proposta bigint) returns int
language sql stable security definer set search_path = '' as $$
  select case
    when p.aprovadores is not null then least(cardinality(p.aprovadores), public.aprovacoes_necessarias(p.sala_id))
    else public.aprovacoes_necessarias(p.sala_id) end
  from public.mensagens p where p.id = proposta;
$$;
grant execute on function public.aprovacoes_da_proposta(bigint) to authenticated, service_role;

-- trocas de instruções pendentes que já têm os votos que a regra nova pede: fecham como aprovadas
-- e trocam as instruções, no nome de quem votou por último (o mesmo que o decidir faria)
do $$
declare
  p record;
  ultimo uuid;
begin
  for p in
    select m.* from public.mensagens m
    where m.tipo = 'proposta' and m.estado = 'pendente' and not m.apagada and m.novo_contexto is not null
      and (select count(*) from public.votos v where v.proposta_id = m.id) >= public.aprovacoes_da_proposta(m.id)
  loop
    select v.user_id into ultimo from public.votos v where v.proposta_id = p.id order by v.ctid desc limit 1;
    update public.mensagens set estado = 'aprovada', decidida_por = ultimo, decidida_em = now() where id = p.id;
    insert into public.mensagens (sala_id, user_id, texto, tipo, estado, responde_a)
    values (p.sala_id, ultimo, 'Aprovada. O contexto da sala foi trocado pelo texto da proposta.', 'decisao', 'aprovada', p.id);
    update public.salas set contexto = btrim(p.novo_contexto) where id = p.sala_id;
    perform public._registrar(p.sala_id, ultimo, null, 'aprovou', left(split_part(btrim(p.texto), E'\n', 1), 200));
  end loop;
end $$;
