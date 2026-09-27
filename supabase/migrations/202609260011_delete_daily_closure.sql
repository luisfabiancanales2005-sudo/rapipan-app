-- Delete an editable close atomically and recalculate later partner settlements.
-- Imported Excel facts are not daily_closures and cannot be deleted here.
create function public.delete_daily_closure(p_closure_id uuid, p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  business_uuid uuid;
  closing record;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  business_uuid := public.current_business_id();
  if business_uuid is null then raise exception 'No business assigned'; end if;
  perform pg_advisory_xact_lock(hashtextextended(business_uuid::text, 0));

  select id, operating_date, updated_at, shift_payload into closing
    from public.daily_closures
   where id = p_closure_id and business_id = business_uuid and status = 'closed'
   for update;
  if not found then raise exception 'Closed day not found'; end if;
  if closing.shift_payload is null then raise exception 'Imported history cannot be deleted here'; end if;
  if p_expected_updated_at is null or closing.updated_at <> p_expected_updated_at then
    raise exception 'The close changed since it was opened; reload before deleting';
  end if;
  if exists (
    select 1 from public.credits c
    where c.daily_closure_id = closing.id
      and (c.status = 'paid' or exists (select 1 from public.credit_payments p where p.credit_id = c.id))
  ) then
    raise exception 'A day with collected credits cannot be deleted';
  end if;

  delete from public.daily_closures where id = closing.id;
  perform public.recalculate_settlements_from(business_uuid, closing.operating_date);
  return closing.id;
end;
$$;
revoke all on function public.delete_daily_closure(uuid, timestamptz) from public, anon;
grant execute on function public.delete_daily_closure(uuid, timestamptz) to authenticated;
