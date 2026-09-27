-- A date remains one close. AM/PM are its auditable operating parts.
-- Capital paid by each partner is money, never a physical bread allocation.
alter table public.daily_closures
  add column shift_payload jsonb check (shift_payload is null or jsonb_typeof(shift_payload) = 'object');

do $$
declare constraint_row record;
begin
  for constraint_row in
    select conname from pg_constraint
     where conrelid = 'public.purchase_lines'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%payer_type%'
  loop
    execute format('alter table public.purchase_lines drop constraint %I', constraint_row.conname);
  end loop;
end;
$$;
alter table public.purchase_lines add constraint purchase_lines_payer_type_check
  check (payer_type in ('owner', 'business_cash', 'joint'));
alter table public.purchase_lines add constraint purchase_lines_payer_check
  check ((payer_type = 'owner' and owner_id is not null)
      or (payer_type in ('business_cash', 'joint') and owner_id is null));

create table public.purchase_capital_contributions (
  business_id uuid not null,
  daily_closure_id uuid not null,
  owner_id uuid not null,
  amount_cents bigint not null check (amount_cents >= 0),
  primary key (daily_closure_id, owner_id),
  foreign key (daily_closure_id, business_id) references public.daily_closures(id, business_id) on delete cascade,
  foreign key (owner_id, business_id) references public.owners(id, business_id)
);
create index purchase_capital_contributions_business_idx on public.purchase_capital_contributions(business_id);
alter table public.purchase_capital_contributions enable row level security;
revoke all on table public.purchase_capital_contributions from anon, authenticated;
grant select on table public.purchase_capital_contributions to authenticated;
create policy purchase_capital_contributions_select_own on public.purchase_capital_contributions
  for select to authenticated using (business_id = (select public.current_business_id()));

create table public.daily_shift_facts (
  business_id uuid not null,
  daily_closure_id uuid not null,
  shift text not null check (shift in ('AM', 'PM')),
  purchased_quantity integer not null check (purchased_quantity >= 0),
  sold_quantity integer not null check (sold_quantity >= 0),
  gifted_quantity integer not null check (gifted_quantity >= 0),
  consumed_quantity integer not null check (consumed_quantity >= 0),
  sales_cents bigint not null check (sales_cents >= 0),
  purchase_cost_cents bigint not null check (purchase_cost_cents >= 0),
  commission_cents bigint not null check (commission_cents >= 0),
  expenses_cents bigint not null check (expenses_cents >= 0),
  profit_cents bigint not null,
  primary key (daily_closure_id, shift),
  foreign key (daily_closure_id, business_id) references public.daily_closures(id, business_id) on delete cascade,
  check (purchased_quantity = sold_quantity + gifted_quantity + consumed_quantity),
  check (profit_cents = sales_cents - purchase_cost_cents - commission_cents - expenses_cents)
);
create index daily_shift_facts_business_idx on public.daily_shift_facts(business_id);
alter table public.daily_shift_facts enable row level security;
revoke all on table public.daily_shift_facts from anon, authenticated;
grant select on table public.daily_shift_facts to authenticated;
create policy daily_shift_facts_select_own on public.daily_shift_facts
  for select to authenticated using (business_id = (select public.current_business_id()));

create function public.save_daily_shift_details(p_closure_id uuid, p_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  business_uuid uuid;
  partner_count integer;
  contribution_total bigint;
  purchase_total bigint;
  item jsonb;
  product_row record;
  shift_name text;
  product_uuid uuid;
  bought bigint;
  sold bigint;
  gifted bigint;
  consumed bigint;
  delivered bigint;
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
  foreach shift_name in array array['AM', 'PM'] loop
    for product_row in
      select distinct value->>'productId' as product_id from jsonb_array_elements(p_payload->'purchases')
      union select distinct value->>'productId' from jsonb_array_elements(p_payload->'sales')
      union select distinct value->>'productId' from jsonb_array_elements(p_payload->'leftovers')
    loop
      product_uuid := product_row.product_id::uuid;
      select coalesce(sum((value->>'quantity')::bigint), 0) into bought
        from jsonb_array_elements(p_payload->'purchases')
       where value->>'shift' = shift_name and (value->>'productId')::uuid = product_uuid;
      select coalesce(sum((value->>'quantity')::bigint), 0) into sold
        from jsonb_array_elements(p_payload->'sales')
       where value->>'shift' = shift_name and (value->>'productId')::uuid = product_uuid;
      select coalesce(sum((value->>'giftedQuantity')::bigint), 0),
             coalesce(sum((value->>'consumedQuantity')::bigint), 0)
        into gifted, consumed from jsonb_array_elements(p_payload->'leftovers')
       where value->>'shift' = shift_name and (value->>'productId')::uuid = product_uuid;
      if bought <> sold + gifted + consumed then
        raise exception 'Bread does not reconcile for shift % and product %', shift_name, product_uuid;
      end if;
      select coalesce(sum((value->>'deliveredQuantity')::bigint), 0) into delivered
        from jsonb_array_elements(p_payload->'courierRuns')
       where value->>'shift' = shift_name and (value->>'productId')::uuid = product_uuid;
      if delivered > sold then raise exception 'Courier units exceed sales in shift %', shift_name; end if;
    end loop;
  end loop;
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
revoke all on function public.save_daily_shift_details(uuid, jsonb) from public, anon, authenticated;

create function public.normalize_shift_close(p_payload jsonb, p_payer uuid)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  result jsonb;
  normalized_purchases jsonb;
  normalized_leftovers jsonb;
begin
  select coalesce(jsonb_agg(value || jsonb_build_object('payer', jsonb_build_object('type', 'owner', 'ownerId', p_payer)) order by ordinality), '[]'::jsonb)
    into normalized_purchases from jsonb_array_elements(p_payload->'purchases') with ordinality;
  select coalesce(jsonb_agg(jsonb_build_object('productId', product_id, 'giftedQuantity', gifted, 'consumedQuantity', consumed)), '[]'::jsonb)
    into normalized_leftovers from (
      select value->>'productId' as product_id,
             sum((value->>'giftedQuantity')::bigint) as gifted,
             sum((value->>'consumedQuantity')::bigint) as consumed
        from jsonb_array_elements(p_payload->'leftovers') group by value->>'productId'
    ) as grouped;
  result := jsonb_set(p_payload, '{purchases}', normalized_purchases);
  return jsonb_set(result, '{leftovers}', normalized_leftovers);
end;
$$;
revoke all on function public.normalize_shift_close(jsonb, uuid) from public, anon, authenticated;

create function public.create_daily_closure_v2(p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  payer_uuid uuid;
  closing_uuid uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select id into payer_uuid from public.owners where business_id = public.current_business_id() and active order by sort_order limit 1;
  if payer_uuid is null then raise exception 'No active owner'; end if;
  closing_uuid := public.create_daily_closure(public.normalize_shift_close(p_payload, payer_uuid));
  perform public.save_daily_shift_details(closing_uuid, p_payload);
  perform public.recalculate_settlements_from(public.current_business_id(), (p_payload->>'operatingDate')::date);
  return closing_uuid;
end;
$$;
revoke all on function public.create_daily_closure_v2(jsonb) from public, anon;
grant execute on function public.create_daily_closure_v2(jsonb) to authenticated;

create function public.update_daily_closure_v2(p_closure_id uuid, p_expected_updated_at timestamptz, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  payer_uuid uuid;
  closing_uuid uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select id into payer_uuid from public.owners where business_id = public.current_business_id() and active order by sort_order limit 1;
  if payer_uuid is null then raise exception 'No active owner'; end if;
  closing_uuid := public.update_daily_closure(p_closure_id, p_expected_updated_at, public.normalize_shift_close(p_payload, payer_uuid));
  perform public.save_daily_shift_details(closing_uuid, p_payload);
  perform public.recalculate_settlements_from(public.current_business_id(), (p_payload->>'operatingDate')::date);
  return closing_uuid;
end;
$$;
revoke all on function public.update_daily_closure_v2(uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.update_daily_closure_v2(uuid, timestamptz, jsonb) to authenticated;
revoke execute on function public.create_daily_closure(jsonb) from authenticated;
revoke execute on function public.update_daily_closure(uuid, timestamptz, jsonb) from authenticated;

-- Credit collections and historical edits also use this calculation. For new
-- closes, purchase funding comes from exact cash contributions; old closes
-- retain their original per-line funding until reviewed and migrated.
create or replace function public.recalculate_settlements_from(p_business uuid, p_start date)
returns void language plpgsql set search_path = '' as $$
declare
  closing record;
  owner_ids uuid[];
  owner_shares bigint[];
  owner_count integer;
  share_total bigint;
  owner_index integer;
  prior_capital bigint[];
  contributed bigint[];
  owed bigint[];
  repaid bigint[];
  economic_shares bigint[];
  cash_shares bigint[];
  prior_date date;
  prior_value bigint;
  contribution_value bigint;
  sales_total bigint;
  purchase_cost bigint;
  commission_total bigint;
  expense_total bigint;
  credit_total bigint;
  collections_total bigint;
  cash_paid_purchases bigint;
  cash_paid_expenses bigint;
  cash_available bigint;
  repay_total bigint;
  cash_profit_total bigint;
  profit_total bigint;
  has_split_capital boolean;
begin
  for closing in
    select id, operating_date, opening_business_cash_cents, reserved_business_cash_cents
      from public.daily_closures
     where business_id = p_business and status = 'closed' and operating_date >= p_start
     order by operating_date
  loop
    select count(*), coalesce(sum(s.profit_share_bps), 0),
           array_agg(s.owner_id order by o.sort_order),
           array_agg(s.profit_share_bps::bigint order by o.sort_order)
      into owner_count, share_total, owner_ids, owner_shares
      from public.settlements s join public.owners o on o.id = s.owner_id
     where s.daily_closure_id = closing.id and s.business_id = p_business;
    if owner_count <> 2 or share_total <> 10000 then
      raise exception 'The close must have two owner settlements totalling 100 percent';
    end if;
    select exists (select 1 from public.purchase_capital_contributions where daily_closure_id = closing.id)
      into has_split_capital;
    prior_capital := array[0::bigint, 0::bigint];
    contributed := array[0::bigint, 0::bigint];
    for owner_index in 1..2 loop
      select s.capital_pending_cents into prior_value
        from public.settlements s join public.daily_closures d on d.id = s.daily_closure_id
       where s.business_id = p_business and s.owner_id = owner_ids[owner_index]
         and d.status = 'closed' and d.operating_date < closing.operating_date
       order by d.operating_date desc limit 1;
      prior_capital[owner_index] := coalesce(prior_value, 0);
      if has_split_capital then
        select coalesce(sum(amount_cents), 0) into contribution_value
          from public.purchase_capital_contributions
         where daily_closure_id = closing.id and owner_id = owner_ids[owner_index];
      else
        select coalesce(sum(quantity::bigint * unit_cost_cents), 0) into contribution_value
          from public.purchase_lines
         where daily_closure_id = closing.id and payer_type = 'owner' and owner_id = owner_ids[owner_index];
      end if;
      select contribution_value + coalesce(sum(amount_cents), 0) into contribution_value
        from public.expenses
       where daily_closure_id = closing.id and payer_type = 'owner' and owner_id = owner_ids[owner_index];
      contributed[owner_index] := contribution_value;
    end loop;
    select coalesce(sum(quantity::bigint * unit_price_cents), 0) into sales_total
      from public.sale_batches where daily_closure_id = closing.id;
    select coalesce(sum(quantity::bigint * unit_cost_cents), 0),
           coalesce(sum(quantity::bigint * unit_cost_cents) filter (where payer_type = 'business_cash'), 0)
      into purchase_cost, cash_paid_purchases from public.purchase_lines where daily_closure_id = closing.id;
    select coalesce(sum(delivered_quantity::bigint * commission_per_unit_cents + additional_commission_cents), 0)
      into commission_total from public.courier_runs where daily_closure_id = closing.id;
    select coalesce(sum(amount_cents), 0), coalesce(sum(amount_cents) filter (where payer_type = 'business_cash'), 0)
      into expense_total, cash_paid_expenses from public.expenses where daily_closure_id = closing.id;
    select coalesce(sum(amount_cents), 0) into credit_total from public.credits where daily_closure_id = closing.id;
    if credit_total > sales_total then raise exception 'Credits exceed sales on %', closing.operating_date; end if;
    select max(operating_date) into prior_date from public.daily_closures
     where business_id = p_business and status = 'closed' and operating_date < closing.operating_date;
    select coalesce(sum(amount_cents), 0) into collections_total from public.credit_payments
     where business_id = p_business and payment_date <= closing.operating_date
       and (prior_date is null or payment_date > prior_date);
    cash_available := closing.opening_business_cash_cents + sales_total - credit_total + collections_total
      - cash_paid_purchases - commission_total - cash_paid_expenses - closing.reserved_business_cash_cents;
    if cash_available < 0 then raise exception 'Insufficient cash to settle %', closing.operating_date; end if;
    profit_total := sales_total - purchase_cost - commission_total - expense_total;
    owed := array[prior_capital[1] + contributed[1], prior_capital[2] + contributed[2]];
    repay_total := least(cash_available, owed[1] + owed[2]);
    repaid := public.allocate_two_cents(repay_total, owed[1], owed[2]);
    cash_profit_total := cash_available - repay_total;
    economic_shares := public.allocate_two_cents(profit_total, owner_shares[1], owner_shares[2]);
    cash_shares := public.allocate_two_cents(cash_profit_total, owner_shares[1], owner_shares[2]);
    for owner_index in 1..2 loop
      update public.settlements set
        economic_profit_share_cents = economic_shares[owner_index],
        capital_brought_forward_cents = prior_capital[owner_index],
        capital_contributed_cents = contributed[owner_index],
        capital_reimbursed_cents = repaid[owner_index],
        capital_pending_cents = owed[owner_index] - repaid[owner_index],
        cash_profit_distributed_cents = cash_shares[owner_index],
        total_cash_due_cents = repaid[owner_index] + cash_shares[owner_index]
       where daily_closure_id = closing.id and owner_id = owner_ids[owner_index];
    end loop;
    update public.daily_closures set updated_at = now() where id = closing.id;
  end loop;
end;
$$;
