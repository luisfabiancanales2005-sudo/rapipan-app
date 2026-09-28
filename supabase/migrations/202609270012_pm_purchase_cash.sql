-- AM sales may fund part of PM bread purchases without becoming partner capital.
-- Keep the purchase cost in its operating shift; only cash funding changes.
create or replace function public.save_daily_shift_details(p_closure_id uuid, p_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  business_uuid uuid;
  partner_count integer;
  contribution_total bigint;
  purchase_total bigint;
  pm_purchase_total bigint;
  cash_from_am bigint;
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
  cash_from_am := coalesce((p_payload->>'businessPaidPurchasesCents')::bigint, 0);
  select coalesce(sum((value->>'quantity')::bigint * (value->>'unitCostCents')::bigint), 0)
    into pm_purchase_total from jsonb_array_elements(p_payload->'purchases')
   where value->>'shift' = 'PM';
  if cash_from_am < 0 or cash_from_am > pm_purchase_total then
    raise exception 'Business cash used for purchases must be between zero and the PM purchase cost';
  end if;
  if partner_count <> 2 or contribution_total + cash_from_am <> purchase_total then
    raise exception 'Partner contributions plus AM business cash must equal the total purchase cost';
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
    if has_split_capital then
      select coalesce((shift_payload->>'businessPaidPurchasesCents')::bigint, 0)
        into cash_paid_purchases from public.daily_closures where id = closing.id;
    end if;
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
