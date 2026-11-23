-- =====================================================================
-- Migración 2: tarjetas de crédito, compras en cuotas, preferencias de
-- usuario y datos iniciales para usuarios nuevos (app multiusuario).
-- Es aditiva: no borra ni modifica datos existentes.
-- =====================================================================

-- ---------- Tarjetas de crédito ----------
alter table public.accounts drop constraint if exists accounts_type_check;
alter table public.accounts add constraint accounts_type_check
  check (type in ('bank','wallet','cash','investment','crypto','receivable','debt','credit_card'));

alter table public.accounts
  add column if not exists closing_day  int check (closing_day between 1 and 31),  -- día de cierre del resumen
  add column if not exists due_day      int check (due_day between 1 and 31),      -- día de vencimiento
  add column if not exists credit_limit numeric(18,2);

-- ---------- Compras en cuotas ----------
alter table public.transactions
  add column if not exists installment_group  uuid,   -- mismo valor en todas las cuotas de una compra
  add column if not exists installment_number int check (installment_number >= 1),
  add column if not exists installment_total  int check (installment_total >= 1);

create index if not exists transactions_installment_idx on public.transactions (installment_group);
create index if not exists transactions_category_idx on public.transactions (category_id);

-- ---------- La vista de saldos expone las columnas nuevas ----------
drop view if exists public.account_balances;
create view public.account_balances
with (security_invoker = true) as
select
  a.id, a.user_id, a.name, a.type, a.currency, a.initial_balance, a.monthly_rate,
  a.include_in_total, a.is_active, a.sort_order,
  a.closing_day, a.due_day, a.credit_limit,
  a.initial_balance + coalesce(sum(
    case
      when t.account_id = a.id and t.type = 'income'      then  t.amount
      when t.account_id = a.id and t.type = 'expense'     then -t.amount
      when t.account_id = a.id and t.type = 'adjustment'  then  t.amount
      when t.account_id = a.id and t.type = 'transfer'    then -t.amount
      when t.to_account_id = a.id and t.type = 'transfer' then coalesce(t.to_amount, t.amount)
      else 0
    end), 0)::numeric(18,2) as balance
from public.accounts a
left join public.transactions t
  on t.account_id = a.id or t.to_account_id = a.id
group by a.id;

grant select on public.account_balances to authenticated;
revoke all on public.account_balances from anon;

-- ---------- Preferencias por usuario ----------
create table if not exists public.user_settings (
  user_id     uuid primary key default auth.uid() references auth.users on delete cascade,
  rate_source text not null default 'manual'
              check (rate_source in ('manual','oficial','blue','bolsa','tarjeta','cripto')),
  updated_at  timestamptz not null default now()
);

alter table public.user_settings enable row level security;
drop policy if exists "own rows" on public.user_settings;
create policy "own rows" on public.user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.user_settings to authenticated;
revoke all on public.user_settings from anon;

insert into public.user_settings (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- ---------- Datos iniciales para cada usuario nuevo ----------
-- Cuando alguien se registra (email o Google), arranca con una cuenta en
-- efectivo y categorías básicas, para poder cargar gastos de inmediato.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;

  insert into public.accounts (user_id, name, type, currency, sort_order)
  values (new.id, 'Efectivo', 'cash', 'ARS', 1);

  insert into public.categories (user_id, name, kind, grp, icon) values
    (new.id, 'Sueldo',           'income',  null,        'payments'),
    (new.id, 'Ingresos extra',   'income',  null,        'add_card'),
    (new.id, 'Rendimientos',     'income',  'inversion', 'trending_up'),
    (new.id, 'Servicios',        'expense', 'fijo',      'bolt'),
    (new.id, 'Suscripciones',    'expense', 'fijo',      'subscriptions'),
    (new.id, 'Seguros',          'expense', 'fijo',      'shield'),
    (new.id, 'Impuestos',        'expense', 'fijo',      'account_balance'),
    (new.id, 'Alquiler / Casa',  'expense', 'casa',      'home'),
    (new.id, 'Supermercado',     'expense', 'variable',  'shopping_cart'),
    (new.id, 'Transporte',       'expense', 'variable',  'local_gas_station'),
    (new.id, 'Comida y salidas', 'expense', 'variable',  'restaurant'),
    (new.id, 'Salud',            'expense', 'variable',  'local_hospital'),
    (new.id, 'Compras',          'expense', 'variable',  'shopping_bag'),
    (new.id, 'Otros',            'expense', 'variable',  'more_horiz'),
    (new.id, 'Inversión',        'expense', 'inversion', 'savings')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
