-- Management API imports are performed by an operator, not a partner session.
alter table public.legacy_imports alter column imported_by drop not null;
alter table public.legacy_imports add column import_method text not null default 'authenticated_rpc'
  check (import_method in ('authenticated_rpc', 'management_api'));
alter table public.legacy_imports add constraint legacy_imports_method_actor_check
  check ((import_method = 'authenticated_rpc' and imported_by is not null)
      or (import_method = 'management_api' and imported_by is null));
