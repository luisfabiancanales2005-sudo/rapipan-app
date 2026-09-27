-- Historical edits and credit collections remain atomic on static hosting.
-- No browser role receives direct INSERT, UPDATE or DELETE grants on tables.

create function public.recalculate_settlements_from(p_business uuid, p_start date)
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

    prior_capital := array[0::bigint, 0::bigint];
    contributed := array[0::bigint, 0::bigint];
    for owner_index in 1..2 loop
      select s.capital_pending_cents into prior_value
        from public.settlements s join public.daily_closures d on d.id = s.daily_closure_id
       where s.business_id = p_business and s.owner_id = owner_ids[owner_index]
         and d.status = 'closed' and d.operating_date < closing.operating_date
       order by d.operating_date desc limit 1;
      prior_capital[owner_index] := coalesce(prior_value, 0);
      select coalesce(sum(value_cents), 0) into contribution_value from (
        select quantity::bigint * unit_cost_cents as value_cents from public.purchase_lines
         where daily_closure_id = closing.id and payer_type = 'owner' and owner_id = owner_ids[owner_index]
        union all
        select amount_cents from public.expenses
         where daily_closure_id = closing.id and payer_type = 'owner' and owner_id = owner_ids[owner_index]
      ) as contributions;
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
revoke all on function public.recalculate_settlements_from(uuid, date) from public, anon, authenticated;

create function public.record_credit_payment(p_credit_id uuid, p_payment_date date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  business_uuid uuid;
  credit_row record;
  already_paid bigint;
  remaining bigint;
  payment_uuid uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  business_uuid := public.current_business_id();
  if business_uuid is null then raise exception 'No business assigned'; end if;
  if p_payment_date is null or p_payment_date > (now() at time zone 'America/Lima')::date then
    raise exception 'Payment date must not be in the future';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(business_uuid::text, 0));
  select c.id, c.amount_cents, c.status, d.operating_date into credit_row
    from public.credits c join public.daily_closures d on d.id = c.daily_closure_id
   where c.id = p_credit_id and c.business_id = business_uuid for update of c;
  if not found then raise exception 'Credit not found'; end if;
  if p_payment_date < credit_row.operating_date then
    raise exception 'Payment cannot precede the original sale';
  end if;
  select coalesce(sum(amount_cents), 0) into already_paid from public.credit_payments
   where credit_id = p_credit_id and business_id = business_uuid;
  remaining := credit_row.amount_cents - already_paid;
  if remaining <= 0 or credit_row.status = 'paid' then raise exception 'Credit is already paid'; end if;
  insert into public.credit_payments (business_id, credit_id, payment_date, amount_cents)
    values (business_uuid, p_credit_id, p_payment_date, remaining)
    returning id into payment_uuid;
  update public.credits set status = 'paid' where id = p_credit_id;
  perform public.recalculate_settlements_from(business_uuid, p_payment_date);
  return payment_uuid;
end;
$$;
revoke all on function public.record_credit_payment(uuid, date) from public, anon;
grant execute on function public.record_credit_payment(uuid, date) to authenticated;

create function public.update_daily_closure(p_closure_id uuid, p_expected_updated_at timestamptz, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  business_uuid uuid;
  closing record;
  line jsonb;
  item record;
  product_uuid uuid;
  courier_uuid uuid;
  owner_uuid uuid;
  payer_name text;
  sales_total bigint;
  credit_total bigint;
  credit_count integer;
  credit_row record;
  paid_total bigint;
  incoming_credit bigint;
  purchased_qty bigint;
  sold_qty bigint;
  gifted_qty bigint;
  consumed_qty bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  business_uuid := public.current_business_id();
  if business_uuid is null then raise exception 'No business assigned'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Invalid payload'; end if;
  perform pg_advisory_xact_lock(hashtextextended(business_uuid::text, 0));
  select id, operating_date, updated_at into closing from public.daily_closures
   where id = p_closure_id and business_id = business_uuid and status = 'closed' for update;
  if not found then raise exception 'Closed day not found'; end if;
  if p_expected_updated_at is null or closing.updated_at <> p_expected_updated_at then
    raise exception 'The close changed since it was opened; reload before editing';
  end if;
  if (p_payload->>'operatingDate')::date is null
     or (p_payload->>'operatingDate')::date <> closing.operating_date then
    raise exception 'The operating date cannot be edited';
  end if;
  if (p_payload->>'openingBusinessCashCents')::bigint is null
     or (p_payload->>'reservedBusinessCashCents')::bigint is null
     or (p_payload->>'openingBusinessCashCents')::bigint < 0
     or (p_payload->>'reservedBusinessCashCents')::bigint < 0
     or length(coalesce(p_payload->>'notes', '')) > 1000 then
    raise exception 'Invalid cash or notes';
  end if;
  if coalesce(jsonb_typeof(p_payload->'purchases'), '') <> 'array' then raise exception 'Purchases must be a list'; end if;
  if jsonb_array_length(p_payload->'purchases') = 0 then raise exception 'At least one purchase is required'; end if;
  if coalesce(jsonb_typeof(p_payload->'sales'), '') <> 'array'
     or coalesce(jsonb_typeof(p_payload->'leftovers'), '') <> 'array'
     or coalesce(jsonb_typeof(p_payload->'courierRuns'), '') <> 'array'
     or coalesce(jsonb_typeof(p_payload->'expenses'), '') <> 'array' then
    raise exception 'Closure lines must be lists';
  end if;

  -- Preserve the credit identity and its payments while replacing the other lines.
  update public.credits set sale_batch_id = null where daily_closure_id = closing.id;
  delete from public.courier_runs where daily_closure_id = closing.id;
  delete from public.leftover_lines where daily_closure_id = closing.id;
  delete from public.expenses where daily_closure_id = closing.id;
  delete from public.purchase_lines where daily_closure_id = closing.id;
  delete from public.sale_batches where daily_closure_id = closing.id;

  for line in select value from jsonb_array_elements(p_payload->'purchases') loop
    product_uuid := (line->>'productId')::uuid;
    if not exists (select 1 from public.products where id = product_uuid and business_id = business_uuid) then
      raise exception 'Product does not belong to this business';
    end if;
    payer_name := line->'payer'->>'type';
    owner_uuid := case when payer_name = 'owner' then (line->'payer'->>'ownerId')::uuid else null end;
    if payer_name is null or payer_name not in ('owner', 'business_cash')
       or (payer_name = 'owner' and not exists (select 1 from public.owners where id = owner_uuid and business_id = business_uuid)) then
      raise exception 'Invalid purchase payer';
    end if;
    insert into public.purchase_lines (business_id, daily_closure_id, product_id, quantity, unit_cost_cents, payer_type, owner_id)
      values (business_uuid, closing.id, product_uuid, (line->>'quantity')::integer,
        (line->>'unitCostCents')::bigint, payer_name, owner_uuid);
  end loop;
  for line in select value from jsonb_array_elements(p_payload->'sales') loop
    product_uuid := (line->>'productId')::uuid;
    if not exists (select 1 from public.products where id = product_uuid and business_id = business_uuid) then
      raise exception 'Product does not belong to this business';
    end if;
    insert into public.sale_batches (business_id, daily_closure_id, product_id, quantity, unit_price_cents)
      values (business_uuid, closing.id, product_uuid, (line->>'quantity')::integer, (line->>'unitPriceCents')::bigint);
  end loop;
  for line in select value from jsonb_array_elements(p_payload->'leftovers') loop
    insert into public.leftover_lines (business_id, daily_closure_id, product_id, gifted_quantity, consumed_quantity)
      values (business_uuid, closing.id, (line->>'productId')::uuid,
        (line->>'giftedQuantity')::integer, (line->>'consumedQuantity')::integer);
  end loop;
  for item in
    select product_id from public.purchase_lines where daily_closure_id = closing.id
    union select product_id from public.sale_batches where daily_closure_id = closing.id
    union select product_id from public.leftover_lines where daily_closure_id = closing.id
  loop
    select coalesce(sum(quantity), 0) into purchased_qty from public.purchase_lines
      where daily_closure_id = closing.id and product_id = item.product_id;
    select coalesce(sum(quantity), 0) into sold_qty from public.sale_batches
      where daily_closure_id = closing.id and product_id = item.product_id;
    select coalesce(sum(gifted_quantity), 0), coalesce(sum(consumed_quantity), 0) into gifted_qty, consumed_qty
      from public.leftover_lines where daily_closure_id = closing.id and product_id = item.product_id;
    if purchased_qty <> sold_qty + gifted_qty + consumed_qty then raise exception 'Purchased units do not reconcile'; end if;
  end loop;
  for line in select value from jsonb_array_elements(p_payload->'courierRuns') loop
    courier_uuid := (line->>'courierId')::uuid;
    if not exists (select 1 from public.couriers where id = courier_uuid and business_id = business_uuid) then
      raise exception 'Courier does not belong to this business';
    end if;
    insert into public.courier_runs (business_id, daily_closure_id, product_id, courier_id,
      delivered_quantity, commission_per_unit_cents, additional_commission_cents)
      values (business_uuid, closing.id, (line->>'productId')::uuid, courier_uuid,
        (line->>'deliveredQuantity')::integer, (line->>'commissionPerUnitCents')::bigint,
        (line->>'additionalCommissionCents')::bigint);
  end loop;
  for item in select product_id, sum(delivered_quantity) as delivered from public.courier_runs
    where daily_closure_id = closing.id group by product_id
  loop
    select coalesce(sum(quantity), 0) into sold_qty from public.sale_batches
      where daily_closure_id = closing.id and product_id = item.product_id;
    if item.delivered > sold_qty then raise exception 'Courier units exceed sold units'; end if;
  end loop;
  for line in select value from jsonb_array_elements(p_payload->'expenses') loop
    payer_name := line->'payer'->>'type';
    owner_uuid := case when payer_name = 'owner' then (line->'payer'->>'ownerId')::uuid else null end;
    if payer_name is null or payer_name not in ('owner', 'business_cash')
       or (payer_name = 'owner' and not exists (select 1 from public.owners where id = owner_uuid and business_id = business_uuid)) then
      raise exception 'Invalid expense payer';
    end if;
    insert into public.expenses (business_id, daily_closure_id, concept, amount_cents, payer_type, owner_id)
      values (business_uuid, closing.id, btrim(line->>'concept'), (line->>'amountCents')::bigint, payer_name, owner_uuid);
  end loop;

  select coalesce(sum(quantity::bigint * unit_price_cents), 0) into sales_total
    from public.sale_batches where daily_closure_id = closing.id;
  select count(*), coalesce(sum(amount_cents), 0) into credit_count, credit_total
    from public.credits where daily_closure_id = closing.id;
  if credit_count > 1 then
    if coalesce(p_payload->>'preserveCredits', '') <> 'true' then
      raise exception 'Multiple credits on this day must be preserved during editing';
    end if;
  else
    select id, amount_cents into credit_row from public.credits where daily_closure_id = closing.id limit 1;
    if credit_count = 1 then
      select coalesce(sum(amount_cents), 0) into paid_total from public.credit_payments where credit_id = credit_row.id;
    else
      paid_total := 0;
    end if;
    if p_payload->'credit' is null or jsonb_typeof(p_payload->'credit') = 'null' then
      if paid_total > 0 then raise exception 'A paid credit cannot be removed'; end if;
      if credit_count = 1 then delete from public.credits where id = credit_row.id; end if;
      credit_total := 0;
    else
      incoming_credit := (p_payload->'credit'->>'amountCents')::bigint;
      if incoming_credit is null or incoming_credit <= 0 then raise exception 'Invalid credit amount'; end if;
      if length(coalesce(p_payload->'credit'->>'reference', '')) > 200 then raise exception 'Credit reference is too long'; end if;
      if credit_count = 1 then
        if paid_total > 0 and incoming_credit <> credit_row.amount_cents then
          raise exception 'The amount of a collected credit cannot change';
        end if;
        update public.credits set amount_cents = incoming_credit,
          reference = nullif(btrim(p_payload->'credit'->>'reference'), '')
          where id = credit_row.id;
      else
        insert into public.credits (business_id, daily_closure_id, amount_cents, reference, status)
          values (business_uuid, closing.id, incoming_credit,
            nullif(btrim(p_payload->'credit'->>'reference'), ''), 'pending');
      end if;
      credit_total := incoming_credit;
    end if;
  end if;
  if credit_total > sales_total then raise exception 'Credits exceed sales'; end if;
  update public.daily_closures set
    opening_business_cash_cents = (p_payload->>'openingBusinessCashCents')::bigint,
    reserved_business_cash_cents = (p_payload->>'reservedBusinessCashCents')::bigint,
    notes = nullif(btrim(coalesce(p_payload->>'notes', '')), '')
   where id = closing.id;
  perform public.recalculate_settlements_from(business_uuid, closing.operating_date);
  return closing.id;
end;
$$;
revoke all on function public.update_daily_closure(uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.update_daily_closure(uuid, timestamptz, jsonb) to authenticated;
