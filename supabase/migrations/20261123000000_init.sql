-- =====================================================================
-- Esquema inicial: cuentas, categorías, gastos fijos, movimientos,
-- cotizaciones, metas de ahorro + vista de saldos + RLS.
-- Ejecutar una vez en Supabase: SQL Editor → pegar → Run.
-- =====================================================================

-- ---------- Cuentas ----------
create table public.accounts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users on delete cascade,
  name             text not null,
  type             text not null check (type in ('bank','wallet','cash','investment','crypto','receivable','debt')),
  currency         text not null check (currency in ('ARS','USD')),
  initial_balance  numeric(18,2) not null default 0,
  monthly_rate     numeric(8,5),            -- % mensual estimado de rendimiento (0.0141 = 1,41 %)
  include_in_total boolean not null default true,
  is_active        boolean not null default true,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now()
);

-- ---------- Categorías ----------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  name       text not null,
  kind       text not null check (kind in ('expense','income')),
  grp        text check (grp in ('fijo','variable','casa','inversion')),
  icon       text,
  color      text,
  is_active  boolean not null default true,
  unique (user_id, name, kind)
);

-- ---------- Plantilla de gastos/ingresos fijos ----------
create table public.recurring_items (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users on delete cascade,
  name               text not null,
  kind               text not null default 'expense' check (kind in ('expense','income')),
  estimated_amount   numeric(18,2),
  currency           text not null default 'ARS' check (currency in ('ARS','USD')),
  category_id        uuid references public.categories on delete set null,
  default_account_id uuid references public.accounts on delete set null,
  due_day            int check (due_day between 1 and 31),
  is_active          boolean not null default true,
  sort_order         int not null default 0
);

-- ---------- Movimientos ----------
create table public.transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  date           date not null default current_date,
  type           text not null check (type in ('expense','income','transfer','adjustment')),
  account_id     uuid not null references public.accounts on delete restrict,
  amount         numeric(18,2) not null,     -- positivo; en 'adjustment' puede ser negativo
  to_account_id  uuid references public.accounts on delete restrict,
  to_amount      numeric(18,2),              -- transferencia entre monedas (ej. compra de dólares)
  category_id    uuid references public.categories on delete set null,
  description    text,
  recurring_id   uuid references public.recurring_items on delete set null,
  period         char(7) check (period ~ '^\d{4}-\d{2}$'),  -- 'YYYY-MM' del gasto fijo
  created_at     timestamptz not null default now(),
  constraint amount_sign check (type = 'adjustment' or amount > 0),
  constraint transfer_target check (
    (type = 'transfer' and to_account_id is not null and to_account_id <> account_id)
    or (type <> 'transfer' and to_account_id is null and to_amount is null)
  )
);

create index transactions_user_date_idx on public.transactions (user_id, date desc);
create index transactions_account_idx   on public.transactions (account_id);
create index transactions_to_account_idx on public.transactions (to_account_id);
create index transactions_recurring_idx on public.transactions (recurring_id, period);

-- ---------- Cotizaciones del dólar ----------
create table public.exchange_rates (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default auth.uid() references auth.users on delete cascade,
  date     date not null default current_date,
  source   text not null default 'manual',   -- manual | oficial | blue | mep
  rate     numeric(18,2) not null check (rate > 0),
  unique (user_id, date, source)
);

-- ---------- Metas de ahorro / destino de la ganancia ----------
create table public.savings_goals (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users on delete cascade,
  name               text not null,
  monthly_allocation numeric(18,2),
  target_amount      numeric(18,2),
  currency           text not null default 'ARS' check (currency in ('ARS','USD')),
  is_active          boolean not null default true
);

-- ---------- Vista: saldo actual de cada cuenta ----------
create view public.account_balances
with (security_invoker = true) as
select
  a.id, a.user_id, a.name, a.type, a.currency, a.initial_balance, a.monthly_rate,
  a.include_in_total, a.is_active, a.sort_order,
  a.initial_balance + coalesce(sum(
    case
      when t.account_id = a.id and t.type = 'income'     then  t.amount
      when t.account_id = a.id and t.type = 'expense'    then -t.amount
      when t.account_id = a.id and t.type = 'adjustment' then  t.amount
      when t.account_id = a.id and t.type = 'transfer'   then -t.amount
      when t.to_account_id = a.id and t.type = 'transfer' then coalesce(t.to_amount, t.amount)
      else 0
    end), 0)::numeric(18,2) as balance
from public.accounts a
left join public.transactions t
  on t.account_id = a.id or t.to_account_id = a.id
group by a.id;

-- ---------- Seguridad: cada usuario solo ve lo suyo ----------
alter table public.accounts        enable row level security;
alter table public.categories      enable row level security;
alter table public.recurring_items enable row level security;
alter table public.transactions    enable row level security;
alter table public.exchange_rates  enable row level security;
alter table public.savings_goals   enable row level security;

create policy "own rows" on public.accounts        for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.categories      for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.recurring_items for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.transactions    for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.exchange_rates  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.savings_goals   for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on
  public.accounts, public.categories, public.recurring_items,
  public.transactions, public.exchange_rates, public.savings_goals
to authenticated;
grant select on public.account_balances to authenticated;
revoke all on
  public.accounts, public.categories, public.recurring_items,
  public.transactions, public.exchange_rates, public.savings_goals, public.account_balances
from anon;
