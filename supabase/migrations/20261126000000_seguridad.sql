-- =====================================================================
-- Migración 4: seguridad
--  1. Cada movimiento/fijo solo puede apuntar a cuentas, categorías y fijos
--     del mismo usuario.
--  2. Verificación en dos pasos: si el usuario la activó, la base exige una
--     sesión verificada (aal2) para leer o escribir sus datos.
--  3. delete_my_account(): borra la cuenta y todos sus datos.
--  4. restore_my_data(): reemplaza todos los datos del usuario por un backup,
--     en una sola transacción (si algo falla, no se toca nada).
-- =====================================================================

-- ---------- 1. Referencias del mismo usuario ----------
create or replace function public.check_same_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.accounts a where a.id = new.account_id and a.user_id = new.user_id) then
    raise exception 'La cuenta no pertenece al usuario' using errcode = '42501';
  end if;
  if new.to_account_id is not null and not exists (
    select 1 from public.accounts a where a.id = new.to_account_id and a.user_id = new.user_id) then
    raise exception 'La cuenta de destino no pertenece al usuario' using errcode = '42501';
  end if;
  if new.category_id is not null and not exists (
    select 1 from public.categories c where c.id = new.category_id and c.user_id = new.user_id) then
    raise exception 'La categoría no pertenece al usuario' using errcode = '42501';
  end if;
  if new.recurring_id is not null and not exists (
    select 1 from public.recurring_items r where r.id = new.recurring_id and r.user_id = new.user_id) then
    raise exception 'El gasto fijo no pertenece al usuario' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Mismo control para la plantilla de gastos/ingresos fijos.
create or replace function public.check_recurring_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.default_account_id is not null and not exists (
    select 1 from public.accounts a where a.id = new.default_account_id and a.user_id = new.user_id) then
    raise exception 'La cuenta no pertenece al usuario' using errcode = '42501';
  end if;
  if new.category_id is not null and not exists (
    select 1 from public.categories c where c.id = new.category_id and c.user_id = new.user_id) then
    raise exception 'La categoría no pertenece al usuario' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_same_owner on public.transactions;
create trigger transactions_same_owner
  before insert or update on public.transactions
  for each row execute function public.check_same_owner();

drop trigger if exists recurring_same_owner on public.recurring_items;
create trigger recurring_same_owner
  before insert or update on public.recurring_items
  for each row execute function public.check_recurring_owner();

-- ---------- 2. Verificación en dos pasos a nivel base ----------
-- Política RESTRICTIVA (se suma a "own rows"): sin factores verificados alcanza
-- con aal1; con un factor verificado hace falta aal2.
do $$
declare t text;
begin
  foreach t in array array['accounts','categories','recurring_items','transactions','exchange_rates','savings_goals','user_settings'] loop
    execute format('drop policy if exists "mfa" on public.%I', t);
    execute format($p$
      create policy "mfa" on public.%I as restrictive for all to authenticated
      using (
        array[(select auth.jwt()->>'aal')] <@ (
          select case when count(id) > 0 then array['aal2'] else array['aal1','aal2'] end
          from auth.mfa_factors
          where user_id = (select auth.uid()) and status = 'verified'
        )
      )$p$, t);
  end loop;
end $$;

-- ---------- 3. Eliminar mi cuenta ----------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'No hay sesión' using errcode = '42501'; end if;
  if exists (select 1 from auth.mfa_factors f where f.user_id = me and f.status = 'verified')
     and coalesce(auth.jwt()->>'aal', '') <> 'aal2' then
    raise exception 'Verificá el código de dos pasos antes de eliminar la cuenta' using errcode = '42501';
  end if;

  -- Orden explícito: los movimientos referencian cuentas con ON DELETE RESTRICT.
  delete from public.transactions    where user_id = me;
  delete from public.recurring_items where user_id = me;
  delete from public.savings_goals   where user_id = me;
  delete from public.exchange_rates  where user_id = me;
  delete from public.accounts        where user_id = me;
  delete from public.categories      where user_id = me;
  delete from public.user_settings   where user_id = me;
  delete from auth.users             where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------- 4. Restaurar un backup ----------
-- security invoker: corre con los permisos del usuario, así RLS y los triggers
-- de arriba siguen aplicando. user_id siempre se fuerza al usuario actual.
create or replace function public.restore_my_data(payload jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  d  jsonb := payload->'data';
begin
  if me is null then raise exception 'No hay sesión' using errcode = '42501'; end if;
  if payload->>'app' is distinct from 'mis-finanzas' or d is null then
    raise exception 'El archivo no es un backup de Mis Finanzas';
  end if;

  delete from public.transactions    where user_id = me;
  delete from public.recurring_items where user_id = me;
  delete from public.savings_goals   where user_id = me;
  delete from public.exchange_rates  where user_id = me;
  delete from public.accounts        where user_id = me;
  delete from public.categories      where user_id = me;

  insert into public.categories (id, user_id, name, kind, grp, icon, color, is_active)
  select r.id, me, r.name, r.kind, r.grp, r.icon, r.color, coalesce(r.is_active, true)
  from jsonb_populate_recordset(null::public.categories, coalesce(d->'categories', '[]')) r;

  insert into public.accounts (id, user_id, name, type, currency, initial_balance, monthly_rate,
                               include_in_total, is_active, sort_order, closing_day, due_day, credit_limit)
  select r.id, me, r.name, r.type, r.currency, coalesce(r.initial_balance, 0), r.monthly_rate,
         coalesce(r.include_in_total, true), coalesce(r.is_active, true), coalesce(r.sort_order, 0),
         r.closing_day, r.due_day, r.credit_limit
  from jsonb_populate_recordset(null::public.accounts, coalesce(d->'accounts', '[]')) r;

  insert into public.recurring_items (id, user_id, name, kind, estimated_amount, currency, category_id,
                                      default_account_id, due_day, is_active, sort_order)
  select r.id, me, r.name, coalesce(r.kind, 'expense'), r.estimated_amount, coalesce(r.currency, 'ARS'),
         r.category_id, r.default_account_id, r.due_day, coalesce(r.is_active, true), coalesce(r.sort_order, 0)
  from jsonb_populate_recordset(null::public.recurring_items, coalesce(d->'recurring_items', '[]')) r;

  insert into public.transactions (id, user_id, date, type, account_id, amount, to_account_id, to_amount,
                                   category_id, description, recurring_id, period, created_at,
                                   installment_group, installment_number, installment_total)
  select r.id, me, r.date, r.type, r.account_id, r.amount, r.to_account_id, r.to_amount,
         r.category_id, r.description, r.recurring_id, r.period, coalesce(r.created_at, now()),
         r.installment_group, r.installment_number, r.installment_total
  from jsonb_populate_recordset(null::public.transactions, coalesce(d->'transactions', '[]')) r;

  insert into public.exchange_rates (id, user_id, date, source, rate)
  select r.id, me, r.date, coalesce(r.source, 'manual'), r.rate
  from jsonb_populate_recordset(null::public.exchange_rates, coalesce(d->'exchange_rates', '[]')) r;

  insert into public.savings_goals (id, user_id, name, monthly_allocation, target_amount, currency, is_active)
  select r.id, me, r.name, r.monthly_allocation, r.target_amount, coalesce(r.currency, 'ARS'), coalesce(r.is_active, true)
  from jsonb_populate_recordset(null::public.savings_goals, coalesce(d->'savings_goals', '[]')) r;

  if d->'user_settings'->>'rate_source' is not null then
    insert into public.user_settings (user_id, rate_source)
    values (me, d->'user_settings'->>'rate_source')
    on conflict (user_id) do update set rate_source = excluded.rate_source, updated_at = now();
  end if;

  return jsonb_build_object(
    'accounts',     (select count(*) from public.accounts where user_id = me),
    'categories',   (select count(*) from public.categories where user_id = me),
    'recurring',    (select count(*) from public.recurring_items where user_id = me),
    'transactions', (select count(*) from public.transactions where user_id = me)
  );
end;
$$;

revoke all on function public.restore_my_data(jsonb) from public, anon;
grant execute on function public.restore_my_data(jsonb) to authenticated;
