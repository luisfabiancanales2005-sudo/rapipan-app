-- Bread may be bought in AM and sold in PM. Units reconcile per product at
-- the daily close; a shift's purchase/sale difference is not a loss.
do $$
declare constraint_row record;
begin
  for constraint_row in
    select conname from pg_constraint
     where conrelid = 'public.daily_shift_facts'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%purchased_quantity%'
       and pg_get_constraintdef(oid) like '%sold_quantity%'
  loop
    execute format('alter table public.daily_shift_facts drop constraint %I', constraint_row.conname);
  end loop;
end;
$$;

create or replace function public.save_daily_shift_details(p_closure_id uuid, p_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  business_uuid uuid;
  partner_count integer;
  contribution_total bigint;
  purchase_total bigint;
  item jsonb;
  shift_name text;
  courier_row record;
  shift_purchased bigint;
  shift_sold bigint;
  shift_gifted bigint;
  shift_consumed bigint;
  shift_sales bigint;
  shift_cost bigint;
  shift_commission bigint;
  shift_expenses bigint;
begin
  select business_id into business_uuid from public.daily_closures where id = p_closure_id;
  if business_uuid is null or business_uuid <> public.current_business_id() then
    raise exception 'Close not found in this business';
  end if;
  if jsonb_typeof(p_payload->'capitalContributions') <> 'array'
     or jsonb_array_length(p_payload->'capitalContributions') <> 2 then
    raise exception 'Exactly two monetary capital contributions are required';
  end if;
  for item in select value from jsonb_array_elements(p_payload->'capitalContributions') loop
    if (item->>'amountCents')::bigint < 0 then raise exception 'Capital cannot be negative'; end if;
    if not exists (select 1 from public.owners where id = (item->>'ownerId')::uuid and business_id = business_uuid and active) then
      raise exception 'Invalid capital contributor';
    end if;
  end loop;
  select count(distinct value->>'ownerId'), sum((value->>'amountCents')::bigint)
    into partner_count, contribution_total
    from jsonb_array_elements(p_payload->'capitalContributions');
  select coalesce(sum(quantity::bigint * unit_cost_cents), 0) into purchase_total
    from public.purchase_lines where daily_closure_id = p_closure_id;
  if partner_count <> 2 or contribution_total <> purchase_total then
    raise exception 'The two cash contributions must equal the total purchase cost';
  end if;
  for item in
    select value from jsonb_array_elements(p_payload->'purchases')
    union all select value from jsonb_array_elements(p_payload->'sales')
    union all select value from jsonb_array_elements(p_payload->'leftovers')
    union all select value from jsonb_array_elements(p_payload->'courierRuns')
    union all select value from jsonb_array_elements(p_payload->'expenses')
  loop
    if coalesce(item->>'shift', '') not in ('AM', 'PM') then
      raise exception 'Each operating line must belong to AM or PM';
    end if;
  end loop;
  for courier_row in
    select value->>'shift' as shift, value->>'productId' as product_id,
           sum((value->>'deliveredQuantity')::bigint) as delivered
      from jsonb_array_elements(p_payload->'courierRuns')
     group by value->>'shift', value->>'productId'
  loop
    if courier_row.delivered > (
      select coalesce(sum((value->>'quantity')::bigint), 0)
        from jsonb_array_elements(p_payload->'sales')
       where value->>'shift' = courier_row.shift and value->>'productId' = courier_row.product_id
    ) then raise exception 'Courier units exceed sales in shift %', courier_row.shift; end if;
  end loop;
  delete from public.purchase_capital_contributions where daily_closure_id = p_closure_id;
  insert into public.purchase_capital_contributions (business_id, daily_closure_id, owner_id, amount_cents)
    select business_uuid, p_closure_id, (value->>'ownerId')::uuid, (value->>'amountCents')::bigint
      from jsonb_array_elements(p_payload->'capitalContributions');
  update public.purchase_lines set payer_type = 'joint', owner_id = null where daily_closure_id = p_closure_id;
  delete from public.daily_shift_facts where daily_closure_id = p_closure_id;
  foreach shift_name in array array['AM', 'PM'] loop
    select coalesce(sum((value->>'quantity')::bigint), 0),
           coalesce(sum((value->>'quantity')::bigint * (value->>'unitCostCents')::bigint), 0)
      into shift_purchased, shift_cost from jsonb_array_elements(p_payload->'purchases')
     where value->>'shift' = shift_name;
    select coalesce(sum((value->>'quantity')::bigint), 0),
           coalesce(sum((value->>'quantity')::bigint * (value->>'unitPriceCents')::bigint), 0)
      into shift_sold, shift_sales from jsonb_array_elements(p_payload->'sales')
     where value->>'shift' = shift_name;
    select coalesce(sum((value->>'giftedQuantity')::bigint), 0),
           coalesce(sum((value->>'consumedQuantity')::bigint), 0)
      into shift_gifted, shift_consumed from jsonb_array_elements(p_payload->'leftovers')
     where value->>'shift' = shift_name;
    select coalesce(sum((value->>'deliveredQuantity')::bigint * (value->>'commissionPerUnitCents')::bigint
                       + (value->>'additionalCommissionCents')::bigint), 0)
      into shift_commission from jsonb_array_elements(p_payload->'courierRuns')
     where value->>'shift' = shift_name;
    select coalesce(sum((value->>'amountCents')::bigint), 0)
      into shift_expenses from jsonb_array_elements(p_payload->'expenses')
     where value->>'shift' = shift_name;
    if shift_purchased + shift_sold + shift_gifted + shift_consumed + shift_commission + shift_expenses > 0 then
      insert into public.daily_shift_facts (
        business_id, daily_closure_id, shift, purchased_quantity, sold_quantity,
        gifted_quantity, consumed_quantity, sales_cents, purchase_cost_cents,
        commission_cents, expenses_cents, profit_cents
      ) values (
        business_uuid, p_closure_id, shift_name, shift_purchased, shift_sold,
        shift_gifted, shift_consumed, shift_sales, shift_cost,
        shift_commission, shift_expenses, shift_sales - shift_cost - shift_commission - shift_expenses
      );
    end if;
  end loop;
  update public.daily_closures set shift_payload = p_payload, updated_at = now() where id = p_closure_id;
end;
$$;
