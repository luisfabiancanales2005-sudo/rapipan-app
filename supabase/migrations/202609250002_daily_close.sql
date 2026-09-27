-- Atomic daily close for the static GitHub Pages client.
-- The browser may preview figures, but this function validates and recalculates
-- every quantity and cent inside PostgreSQL before anything is committed.

alter table public.settlements
  add column capital_brought_forward_cents bigint not null default 0
  check (capital_brought_forward_cents >= 0);

alter table public.settlements drop constraint settlements_check;
alter table public.settlements
  add constraint settlements_capital_reconciles check (
    capital_brought_forward_cents + capital_contributed_cents =
    capital_reimbursed_cents + capital_pending_cents
  );

create function public.allocate_two_cents(p_total bigint, p_weight_one bigint, p_weight_two bigint)
returns bigint[] language plpgsql immutable set search_path = '' as $$
declare
  weight_total numeric := p_weight_one::numeric + p_weight_two::numeric;
  amount numeric := abs(p_total::numeric);
  first_base bigint;
  second_base bigint;
  first_remainder numeric;
  second_remainder numeric;
  sign_value integer := case when p_total < 0 then -1 else 1 end;
begin
  if p_weight_one < 0 or p_weight_two < 0 then
    raise exception 'Allocation weights cannot be negative';
  end if;
  if weight_total = 0 then
    if p_total <> 0 then raise exception 'Cannot allocate without weights'; end if;
    return array[0::bigint, 0::bigint];
  end if;

  first_base := floor(amount * p_weight_one / weight_total)::bigint;
  second_base := floor(amount * p_weight_two / weight_total)::bigint;
  first_remainder := mod(amount * p_weight_one, weight_total);
  second_remainder := mod(amount * p_weight_two, weight_total);
  if first_base + second_base < amount then
    if first_remainder >= second_remainder then
      first_base := first_base + 1;
    else
      second_base := second_base + 1;
    end if;
  end if;
  return array[first_base * sign_value, second_base * sign_value];
end;
$$;
revoke all on function public.allocate_two_cents(bigint, bigint, bigint) from public, anon, authenticated;

create function public.create_daily_closure(p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  business_uuid uuid;
  closing_uuid uuid;
  operating_day date;
  opening_cash bigint;
  reserved_cash bigint;
  line jsonb;
  item record;
  payer_name text;
  payer_owner uuid;
  product_uuid uuid;
  purchased_qty bigint;
  sold_qty bigint;
  gifted_qty bigint;
  consumed_qty bigint;
  delivered_qty bigint;
  purchase_cost bigint := 0;
  sales_total bigint := 0;
  commission_total bigint := 0;
  expense_total bigint := 0;
  cash_paid_purchases bigint := 0;
  cash_paid_expenses bigint := 0;
  credit_total bigint := 0;
  credit_data jsonb;
  previous_close_date date;
  credit_collections bigint := 0;
  cash_before bigint;
  available_cash bigint;
  profit_total bigint;
  repay_total bigint;
  cash_profit_total bigint;
  owner_count integer;
  share_total integer;
  owner_ids uuid[];
  owner_shares bigint[];
  prior_capital bigint[] := array[0::bigint, 0::bigint];
  contributed bigint[] := array[0::bigint, 0::bigint];
  owed bigint[];
  repayments bigint[];
  economic_shares bigint[];
  cash_shares bigint[];
  owner_index integer;
  prior_value bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  business_uuid := public.current_business_id();
  if business_uuid is null then raise exception 'No business assigned to this user'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid daily close payload';
  end if;

  operating_day := (p_payload->>'operatingDate')::date;
  if operating_day is null then raise exception 'Operating date is required'; end if;
  opening_cash := (p_payload->>'openingBusinessCashCents')::bigint;
  reserved_cash := (p_payload->>'reservedBusinessCashCents')::bigint;
  if opening_cash is null or reserved_cash is null or opening_cash < 0 or reserved_cash < 0 then
    raise exception 'Cash amounts must be non-negative';
  end if;
  if length(coalesce(p_payload->>'notes', '')) > 1000 then
    raise exception 'Notes are too long';
  end if;

  -- Serialize closes for this business, including concurrent users.
  perform pg_advisory_xact_lock(hashtextextended(business_uuid::text, 0));
  if exists (
    select 1 from public.daily_closures
     where business_id = business_uuid and operating_date = operating_day
  ) then
    raise exception 'A close already exists for this date';
  end if;
  if exists (
    select 1 from public.daily_closures
     where business_id = business_uuid and operating_date > operating_day and status = 'closed'
  ) then
    raise exception 'A later close exists; register historical dates in order';
  end if;
  select max(operating_date) into previous_close_date from public.daily_closures
    where business_id = business_uuid and status = 'closed' and operating_date < operating_day;
  select coalesce(sum(amount_cents), 0) into credit_collections from public.credit_payments
    where business_id = business_uuid and payment_date <= operating_day
      and (previous_close_date is null or payment_date > previous_close_date);

  select count(*), coalesce(sum(profit_share_bps), 0),
         array_agg(id order by sort_order), array_agg(profit_share_bps::bigint order by sort_order)
    into owner_count, share_total, owner_ids, owner_shares
    from public.owners
   where business_id = business_uuid and active;
  if owner_count <> 2 or share_total <> 10000 then
    raise exception 'Two active owners must share 100 percent';
  end if;

  for owner_index in 1..2 loop
    select s.capital_pending_cents into prior_value
      from public.settlements s
      join public.daily_closures d on d.id = s.daily_closure_id
     where s.business_id = business_uuid
       and s.owner_id = owner_ids[owner_index]
       and d.operating_date < operating_day
     order by d.operating_date desc
     limit 1;
    prior_capital[owner_index] := coalesce(prior_value, 0);
  end loop;

  insert into public.daily_closures (
    business_id, operating_date, status, opening_business_cash_cents,
    reserved_business_cash_cents, notes, closed_at
  ) values (
    business_uuid, operating_day, 'draft', opening_cash, reserved_cash,
    nullif(btrim(coalesce(p_payload->>'notes', '')), ''), null
  ) returning id into closing_uuid;

  if jsonb_typeof(p_payload->'purchases') <> 'array' or jsonb_array_length(p_payload->'purchases') = 0 then
    raise exception 'At least one purchase is required';
  end if;
  for line in select value from jsonb_array_elements(p_payload->'purchases') loop
    product_uuid := (line->>'productId')::uuid;
    if not exists (select 1 from public.products where id = product_uuid and business_id = business_uuid and active) then
      raise exception 'Product is not active in this business';
    end if;
    payer_name := line->'payer'->>'type';
    payer_owner := case when payer_name = 'owner' then (line->'payer'->>'ownerId')::uuid else null end;
    if payer_name not in ('owner', 'business_cash') or (payer_name = 'owner' and not payer_owner = any(owner_ids)) then
      raise exception 'Invalid purchase payer';
    end if;
    insert into public.purchase_lines (
      business_id, daily_closure_id, product_id, quantity, unit_cost_cents, payer_type, owner_id
    ) values (
      business_uuid, closing_uuid, product_uuid, (line->>'quantity')::integer,
      (line->>'unitCostCents')::bigint, payer_name, payer_owner
    );
    purchase_cost := purchase_cost + (line->>'quantity')::bigint * (line->>'unitCostCents')::bigint;
    if payer_name = 'business_cash' then
      cash_paid_purchases := cash_paid_purchases + (line->>'quantity')::bigint * (line->>'unitCostCents')::bigint;
    else
      for owner_index in 1..2 loop
        if owner_ids[owner_index] = payer_owner then
          contributed[owner_index] := contributed[owner_index] + (line->>'quantity')::bigint * (line->>'unitCostCents')::bigint;
        end if;
      end loop;
    end if;
  end loop;

  if p_payload ? 'sales' and jsonb_typeof(p_payload->'sales') <> 'array' then
    raise exception 'Sales must be a list';
  end if;
  for line in select value from jsonb_array_elements(coalesce(p_payload->'sales', '[]'::jsonb)) loop
    product_uuid := (line->>'productId')::uuid;
    if not exists (select 1 from public.products where id = product_uuid and business_id = business_uuid and active) then
      raise exception 'Product is not active in this business';
    end if;
    insert into public.sale_batches (
      business_id, daily_closure_id, product_id, quantity, unit_price_cents
    ) values (
      business_uuid, closing_uuid, product_uuid, (line->>'quantity')::integer,
      (line->>'unitPriceCents')::bigint
    );
    sales_total := sales_total + (line->>'quantity')::bigint * (line->>'unitPriceCents')::bigint;
  end loop;

  if p_payload ? 'leftovers' and jsonb_typeof(p_payload->'leftovers') <> 'array' then
    raise exception 'Leftovers must be a list';
  end if;
  for line in select value from jsonb_array_elements(coalesce(p_payload->'leftovers', '[]'::jsonb)) loop
    insert into public.leftover_lines (
      business_id, daily_closure_id, product_id, gifted_quantity, consumed_quantity
    ) values (
      business_uuid, closing_uuid, (line->>'productId')::uuid,
      (line->>'giftedQuantity')::integer, (line->>'consumedQuantity')::integer
    );
  end loop;

  for item in
    select product_id from public.purchase_lines where daily_closure_id = closing_uuid
    union select product_id from public.sale_batches where daily_closure_id = closing_uuid
    union select product_id from public.leftover_lines where daily_closure_id = closing_uuid
  loop
    select coalesce(sum(quantity), 0) into purchased_qty from public.purchase_lines
      where daily_closure_id = closing_uuid and product_id = item.product_id;
    select coalesce(sum(quantity), 0) into sold_qty from public.sale_batches
      where daily_closure_id = closing_uuid and product_id = item.product_id;
    select coalesce(sum(gifted_quantity), 0), coalesce(sum(consumed_quantity), 0)
      into gifted_qty, consumed_qty from public.leftover_lines
      where daily_closure_id = closing_uuid and product_id = item.product_id;
    if purchased_qty <> sold_qty + gifted_qty + consumed_qty then
      raise exception 'Purchased units do not reconcile for product %', item.product_id;
    end if;
  end loop;

  if p_payload ? 'courierRuns' and jsonb_typeof(p_payload->'courierRuns') <> 'array' then
    raise exception 'Courier runs must be a list';
  end if;
  for line in select value from jsonb_array_elements(coalesce(p_payload->'courierRuns', '[]'::jsonb)) loop
    product_uuid := (line->>'productId')::uuid;
    if not exists (select 1 from public.couriers where id = (line->>'courierId')::uuid and business_id = business_uuid and active) then
      raise exception 'Courier is not active in this business';
    end if;
    insert into public.courier_runs (
      business_id, daily_closure_id, product_id, courier_id,
      delivered_quantity, commission_per_unit_cents, additional_commission_cents
    ) values (
      business_uuid, closing_uuid, product_uuid, (line->>'courierId')::uuid,
      (line->>'deliveredQuantity')::integer, (line->>'commissionPerUnitCents')::bigint,
      (line->>'additionalCommissionCents')::bigint
    );
    commission_total := commission_total +
      (line->>'deliveredQuantity')::bigint * (line->>'commissionPerUnitCents')::bigint +
      (line->>'additionalCommissionCents')::bigint;
  end loop;
  for item in select product_id, sum(delivered_quantity) as delivered
    from public.courier_runs where daily_closure_id = closing_uuid group by product_id
  loop
    select coalesce(sum(quantity), 0) into sold_qty from public.sale_batches
      where daily_closure_id = closing_uuid and product_id = item.product_id;
    if item.delivered > sold_qty then raise exception 'Courier units exceed sold units'; end if;
  end loop;

  if p_payload ? 'expenses' and jsonb_typeof(p_payload->'expenses') <> 'array' then
    raise exception 'Expenses must be a list';
  end if;
  for line in select value from jsonb_array_elements(coalesce(p_payload->'expenses', '[]'::jsonb)) loop
    payer_name := line->'payer'->>'type';
    payer_owner := case when payer_name = 'owner' then (line->'payer'->>'ownerId')::uuid else null end;
    if payer_name not in ('owner', 'business_cash') or (payer_name = 'owner' and not payer_owner = any(owner_ids)) then
      raise exception 'Invalid expense payer';
    end if;
    insert into public.expenses (
      business_id, daily_closure_id, concept, amount_cents, payer_type, owner_id
    ) values (
      business_uuid, closing_uuid, btrim(line->>'concept'), (line->>'amountCents')::bigint,
      payer_name, payer_owner
    );
    expense_total := expense_total + (line->>'amountCents')::bigint;
    if payer_name = 'business_cash' then
      cash_paid_expenses := cash_paid_expenses + (line->>'amountCents')::bigint;
    else
      for owner_index in 1..2 loop
        if owner_ids[owner_index] = payer_owner then
          contributed[owner_index] := contributed[owner_index] + (line->>'amountCents')::bigint;
        end if;
      end loop;
    end if;
  end loop;

  credit_data := p_payload->'credit';
  if credit_data is not null and jsonb_typeof(credit_data) <> 'null' then
    credit_total := (credit_data->>'amountCents')::bigint;
    if credit_total is null or credit_total <= 0 or credit_total > sales_total then
      raise exception 'Credit exceeds sales or is invalid';
    end if;
    if length(coalesce(credit_data->>'reference', '')) > 200 then
      raise exception 'Credit reference is too long';
    end if;
    insert into public.credits (business_id, daily_closure_id, reference, amount_cents, status)
      values (business_uuid, closing_uuid, nullif(btrim(credit_data->>'reference'), ''), credit_total, 'pending');
  end if;

  profit_total := sales_total - purchase_cost - commission_total - expense_total;
  cash_before := opening_cash + sales_total - credit_total + credit_collections
    - cash_paid_purchases - commission_total - cash_paid_expenses;
  available_cash := cash_before - reserved_cash;
  if available_cash < 0 then raise exception 'Business cash is insufficient for expenses or reserve'; end if;

  owed := array[
    prior_capital[1] + contributed[1],
    prior_capital[2] + contributed[2]
  ];
  repay_total := least(available_cash, owed[1] + owed[2]);
  repayments := public.allocate_two_cents(repay_total, owed[1], owed[2]);
  cash_profit_total := available_cash - repay_total;
  economic_shares := public.allocate_two_cents(profit_total, owner_shares[1], owner_shares[2]);
  cash_shares := public.allocate_two_cents(cash_profit_total, owner_shares[1], owner_shares[2]);

  for owner_index in 1..2 loop
    insert into public.settlements (
      business_id, daily_closure_id, owner_id, profit_share_bps,
      economic_profit_share_cents, capital_brought_forward_cents,
      capital_contributed_cents, capital_reimbursed_cents,
      capital_pending_cents, cash_profit_distributed_cents, total_cash_due_cents
    ) values (
      business_uuid, closing_uuid, owner_ids[owner_index], owner_shares[owner_index],
      economic_shares[owner_index], prior_capital[owner_index],
      contributed[owner_index], repayments[owner_index],
      owed[owner_index] - repayments[owner_index], cash_shares[owner_index],
      repayments[owner_index] + cash_shares[owner_index]
    );
  end loop;

  update public.daily_closures
     set status = 'closed', closed_at = now()
   where id = closing_uuid;
  return closing_uuid;
end;
$$;
revoke all on function public.create_daily_closure(jsonb) from public, anon;
grant execute on function public.create_daily_closure(jsonb) to authenticated;
