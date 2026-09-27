-- Rapipan Admin: one business per authenticated profile, no public registration.
-- Apply to a new Supabase project. All money is stored as integer cents.

create extension if not exists pgcrypto;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  timezone text not null default 'America/Lima' check (timezone = 'America/Lima'),
  currency_code text not null default 'PEN' check (currency_code = 'PEN'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete restrict,
  display_name text not null check (length(btrim(display_name)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_business_id_idx on public.profiles(business_id);

create table public.business_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  usual_cost_cents bigint not null default 250 check (usual_cost_cents >= 0),
  usual_price_cents bigint not null default 450 check (usual_price_cents >= 0),
  usual_courier_commission_cents bigint not null default 100 check (usual_courier_commission_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.owners (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  profit_share_bps integer not null check (profit_share_bps between 0 and 10000),
  active boolean not null default true,
  sort_order integer not null check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, sort_order)
);

-- Validate the active owner's shares at transaction commit, so the two owners
-- can be inserted or edited together inside one transaction.
create function public.check_owner_shares() returns trigger
language plpgsql set search_path = '' as $$
declare
  target_business_id uuid;
  active_count integer;
  share_total integer;
begin
  if tg_op = 'DELETE' then
    target_business_id := old.business_id;
  else
    target_business_id := new.business_id;
  end if;
  select count(*), coalesce(sum(profit_share_bps), 0)
    into active_count, share_total
    from public.owners
   where business_id = target_business_id and active;
  if active_count <> 2 or share_total <> 10000 then
    raise exception 'Exactly two active owners must share 100 percent of profit';
  end if;
  return null;
end;
$$;

create constraint trigger owners_share_total
  after insert or update or delete on public.owners
  deferrable initially deferred
  for each row execute function public.check_owner_shares();

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  active boolean not null default true,
  default_cost_cents bigint not null default 250 check (default_cost_cents >= 0),
  default_price_cents bigint not null default 450 check (default_price_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, name)
);

create table public.couriers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  active boolean not null default true,
  default_commission_cents bigint not null default 100 check (default_commission_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, name)
);

create table public.daily_closures (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  operating_date date not null,
  status text not null default 'draft' check (status in ('draft', 'closed')),
  opening_business_cash_cents bigint not null default 0 check (opening_business_cash_cents >= 0),
  reserved_business_cash_cents bigint not null default 0 check (reserved_business_cash_cents >= 0),
  notes text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, operating_date),
  check ((status = 'draft' and closed_at is null) or (status = 'closed' and closed_at is not null))
);
create index daily_closures_business_date_idx on public.daily_closures(business_id, operating_date desc);

create table public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  daily_closure_id uuid not null,
  product_id uuid not null,
  quantity integer not null check (quantity > 0),
  unit_cost_cents bigint not null check (unit_cost_cents >= 0),
  payer_type text not null check (payer_type in ('owner', 'business_cash')),
  owner_id uuid,
  created_at timestamptz not null default now(),
  foreign key (daily_closure_id, business_id) references public.daily_closures(id, business_id) on delete cascade,
  foreign key (product_id, business_id) references public.products(id, business_id),
  foreign key (owner_id, business_id) references public.owners(id, business_id),
  check ((payer_type = 'owner' and owner_id is not null) or (payer_type = 'business_cash' and owner_id is null))
);
create index purchase_lines_closure_idx on public.purchase_lines(daily_closure_id);

create table public.sale_batches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  daily_closure_id uuid not null,
  product_id uuid not null,
  quantity integer not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  created_at timestamptz not null default now(),
  unique (id, business_id),
  foreign key (daily_closure_id, business_id) references public.daily_closures(id, business_id) on delete cascade,
  foreign key (product_id, business_id) references public.products(id, business_id)
);
create index sale_batches_closure_idx on public.sale_batches(daily_closure_id);

create table public.leftover_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  daily_closure_id uuid not null,
  product_id uuid not null,
  gifted_quantity integer not null default 0 check (gifted_quantity >= 0),
  consumed_quantity integer not null default 0 check (consumed_quantity >= 0),
  notes text,
  created_at timestamptz not null default now(),
  unique (daily_closure_id, product_id),
  foreign key (daily_closure_id, business_id) references public.daily_closures(id, business_id) on delete cascade,
  foreign key (product_id, business_id) references public.products(id, business_id)
);
create index leftover_lines_closure_idx on public.leftover_lines(daily_closure_id);

create table public.courier_runs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  daily_closure_id uuid not null,
  product_id uuid not null,
  courier_id uuid not null,
  delivered_quantity integer not null check (delivered_quantity >= 0),
  commission_per_unit_cents bigint not null check (commission_per_unit_cents >= 0),
  additional_commission_cents bigint not null default 0 check (additional_commission_cents >= 0),
  created_at timestamptz not null default now(),
  foreign key (daily_closure_id, business_id) references public.daily_closures(id, business_id) on delete cascade,
  foreign key (product_id, business_id) references public.products(id, business_id),
  foreign key (courier_id, business_id) references public.couriers(id, business_id),
  check (delivered_quantity > 0 or additional_commission_cents > 0)
);
create index courier_runs_closure_idx on public.courier_runs(daily_closure_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  daily_closure_id uuid not null,
  concept text not null check (length(btrim(concept)) between 1 and 120),
  amount_cents bigint not null check (amount_cents > 0),
  payer_type text not null check (payer_type in ('owner', 'business_cash')),
  owner_id uuid,
  created_at timestamptz not null default now(),
  foreign key (daily_closure_id, business_id) references public.daily_closures(id, business_id) on delete cascade,
  foreign key (owner_id, business_id) references public.owners(id, business_id),
  check ((payer_type = 'owner' and owner_id is not null) or (payer_type = 'business_cash' and owner_id is null))
);
create index expenses_closure_idx on public.expenses(daily_closure_id);

create table public.credits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  daily_closure_id uuid not null,
  sale_batch_id uuid,
  reference text,
  amount_cents bigint not null check (amount_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  foreign key (daily_closure_id, business_id) references public.daily_closures(id, business_id) on delete cascade,
  foreign key (sale_batch_id, business_id) references public.sale_batches(id, business_id)
);
create index credits_business_status_idx on public.credits(business_id, status);
create index credits_closure_idx on public.credits(daily_closure_id);

create table public.credit_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  credit_id uuid not null,
  payment_date date not null,
  amount_cents bigint not null check (amount_cents > 0),
  created_at timestamptz not null default now(),
  foreign key (credit_id, business_id) references public.credits(id, business_id) on delete cascade
);
create index credit_payments_business_date_idx on public.credit_payments(business_id, payment_date);
create index credit_payments_credit_idx on public.credit_payments(credit_id);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  daily_closure_id uuid not null,
  owner_id uuid not null,
  profit_share_bps integer not null check (profit_share_bps between 0 and 10000),
  economic_profit_share_cents bigint not null,
  capital_contributed_cents bigint not null check (capital_contributed_cents >= 0),
  capital_reimbursed_cents bigint not null check (capital_reimbursed_cents >= 0),
  capital_pending_cents bigint not null check (capital_pending_cents >= 0),
  cash_profit_distributed_cents bigint not null,
  total_cash_due_cents bigint not null,
  created_at timestamptz not null default now(),
  unique (daily_closure_id, owner_id),
  foreign key (daily_closure_id, business_id) references public.daily_closures(id, business_id) on delete cascade,
  foreign key (owner_id, business_id) references public.owners(id, business_id),
  check (capital_contributed_cents = capital_reimbursed_cents + capital_pending_cents),
  check (total_cash_due_cents = capital_reimbursed_cents + cash_profit_distributed_cents)
);
create index settlements_closure_idx on public.settlements(daily_closure_id);

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'businesses', 'profiles', 'business_settings', 'owners', 'products',
    'couriers', 'daily_closures', 'credits'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      table_name || '_updated_at', table_name
    );
  end loop;
end;
$$;

-- The definer function avoids recursive RLS on profiles. It reads only the
-- authenticated user's own profile and never accepts a user ID from the caller.
create function public.current_business_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.business_id from public.profiles as p where p.id = (select auth.uid())
$$;
revoke all on function public.current_business_id() from public, anon;
grant execute on function public.current_business_id() to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'businesses', 'profiles', 'business_settings', 'owners', 'products',
    'couriers', 'daily_closures', 'purchase_lines', 'sale_batches',
    'leftover_lines', 'courier_runs', 'expenses', 'credits',
    'credit_payments', 'settlements'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
  end loop;
end;
$$;

create policy profiles_select_self on public.profiles
  for select to authenticated using (id = (select auth.uid()));

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'businesses', 'business_settings', 'owners', 'products', 'couriers',
    'daily_closures', 'purchase_lines', 'sale_batches', 'leftover_lines',
    'courier_runs', 'expenses', 'credits', 'credit_payments', 'settlements'
  ] loop
    if table_name = 'businesses' then
      execute 'create policy businesses_select_own on public.businesses for select to authenticated using (id = (select public.current_business_id()))';
    else
      execute format(
        'create policy %I on public.%I for select to authenticated using (business_id = (select public.current_business_id()))',
        table_name || '_select_own_business', table_name
      );
    end if;
  end loop;
end;
$$;

-- Writes are deliberately closed at this checkpoint. The daily close and
-- payment RPCs will be added with their validation in checkpoints 3 and 5.
-- Never place a service-role key in the exported GitHub Pages application.
