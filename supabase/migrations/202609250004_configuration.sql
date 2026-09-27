-- Configuration is changed atomically by an authenticated member of this business.
-- Catalog rows are deactivated, never deleted, so historical closures keep their links.
create function public.save_business_configuration(p_expected_updated_at timestamptz, p_payload jsonb)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  business_uuid uuid;
  business_row record;
  item jsonb;
  item_id uuid;
  affected integer;
  name_value text;
  cost_value bigint;
  price_value bigint;
  commission_value bigint;
  share_total integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  business_uuid := public.current_business_id();
  if business_uuid is null then raise exception 'No business assigned'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Invalid configuration'; end if;
  perform pg_advisory_xact_lock(hashtextextended(business_uuid::text, 0));
  select id, updated_at into business_row from public.businesses where id = business_uuid for update;
  if not found then raise exception 'Business not found'; end if;
  if p_expected_updated_at is null or business_row.updated_at <> p_expected_updated_at then
    raise exception 'Configuration changed; reload before saving';
  end if;

  name_value := btrim(p_payload->>'name');
  cost_value := (p_payload->>'usualCostCents')::bigint;
  price_value := (p_payload->>'usualPriceCents')::bigint;
  commission_value := (p_payload->>'usualCourierCommissionCents')::bigint;
  if name_value is null or length(name_value) not between 1 and 100
     or cost_value is null or cost_value < 0
     or price_value is null or price_value < 0
     or commission_value is null or commission_value < 0 then
    raise exception 'Invalid business name or default amounts';
  end if;
  if coalesce(jsonb_typeof(p_payload->'owners'), '') <> 'array'
     or coalesce(jsonb_typeof(p_payload->'products'), '') <> 'array'
     or coalesce(jsonb_typeof(p_payload->'couriers'), '') <> 'array'
     or jsonb_array_length(p_payload->'owners') <> 2 then
    raise exception 'Invalid catalog lists';
  end if;
  select count(distinct value->>'id'), coalesce(sum((value->>'shareBps')::integer), 0)
    into affected, share_total from jsonb_array_elements(p_payload->'owners');
  if affected <> 2 or share_total <> 10000 then raise exception 'Two different owners must share 100 percent'; end if;

  update public.businesses set name = name_value where id = business_uuid;
  insert into public.business_settings (business_id, usual_cost_cents, usual_price_cents, usual_courier_commission_cents)
    values (business_uuid, cost_value, price_value, commission_value)
    on conflict (business_id) do update set usual_cost_cents = excluded.usual_cost_cents,
      usual_price_cents = excluded.usual_price_cents,
      usual_courier_commission_cents = excluded.usual_courier_commission_cents;

  for item in select value from jsonb_array_elements(p_payload->'owners') loop
    item_id := (item->>'id')::uuid;
    name_value := btrim(item->>'name');
    if name_value is null or length(name_value) not between 1 and 100 then raise exception 'Invalid owner name'; end if;
    update public.owners set name = name_value, profit_share_bps = (item->>'shareBps')::integer
      where id = item_id and business_id = business_uuid and active;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'Owner not found'; end if;
  end loop;

  for item in select value from jsonb_array_elements(p_payload->'products') loop
    name_value := btrim(item->>'name');
    cost_value := (item->>'defaultCostCents')::bigint;
    price_value := (item->>'defaultPriceCents')::bigint;
    if name_value is null or length(name_value) not between 1 and 100
       or cost_value is null or cost_value < 0 or price_value is null or price_value < 0
       or jsonb_typeof(item->'active') <> 'boolean' then raise exception 'Invalid product'; end if;
    if item->>'id' is null then
      insert into public.products (business_id, name, active, default_cost_cents, default_price_cents)
        values (business_uuid, name_value, (item->>'active')::boolean, cost_value, price_value);
    else
      item_id := (item->>'id')::uuid;
      update public.products set name = name_value, active = (item->>'active')::boolean,
        default_cost_cents = cost_value, default_price_cents = price_value
        where id = item_id and business_id = business_uuid;
      get diagnostics affected = row_count;
      if affected <> 1 then raise exception 'Product not found'; end if;
    end if;
  end loop;
  if not exists (select 1 from public.products where business_id = business_uuid and active) then
    raise exception 'At least one product must remain active';
  end if;

  for item in select value from jsonb_array_elements(p_payload->'couriers') loop
    name_value := btrim(item->>'name');
    commission_value := (item->>'defaultCommissionCents')::bigint;
    if name_value is null or length(name_value) not between 1 and 100
       or commission_value is null or commission_value < 0
       or jsonb_typeof(item->'active') <> 'boolean' then raise exception 'Invalid courier'; end if;
    if item->>'id' is null then
      insert into public.couriers (business_id, name, active, default_commission_cents)
        values (business_uuid, name_value, (item->>'active')::boolean, commission_value);
    else
      item_id := (item->>'id')::uuid;
      update public.couriers set name = name_value, active = (item->>'active')::boolean,
        default_commission_cents = commission_value where id = item_id and business_id = business_uuid;
      get diagnostics affected = row_count;
      if affected <> 1 then raise exception 'Courier not found'; end if;
    end if;
  end loop;
  select updated_at into business_row from public.businesses where id = business_uuid;
  return business_row.updated_at;
end;
$$;
revoke all on function public.save_business_configuration(timestamptz, jsonb) from public, anon;
grant execute on function public.save_business_configuration(timestamptz, jsonb) to authenticated;
