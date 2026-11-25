-- =====================================================================
-- Migración 3: permitir pagos de gastos fijos en $0
-- (ej. una suscripción bonificada que igual se quiere marcar como pagada).
-- Los movimientos comunes siguen exigiendo monto mayor a 0.
-- =====================================================================
alter table public.transactions drop constraint if exists amount_sign;
alter table public.transactions add constraint amount_sign check (
  type = 'adjustment'
  or amount > 0
  or (amount = 0 and recurring_id is not null)
);
