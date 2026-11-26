-- Migración 5: corrige la política "mfa" de la migración 4.
-- La política leía auth.mfa_factors directamente, pero el rol "authenticated"
-- no tiene permiso sobre esa tabla (y no hay que dárselo: guarda los secretos
-- TOTP). Resultado: toda consulta fallaba con "permission denied for table
-- mfa_factors". Ahora la consulta la hace una función security definer que
-- solo devuelve true/false para el usuario de la sesión.

create or replace function public.mfa_level_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors
        where user_id = auth.uid() and status = 'verified'
      );
$$;

revoke execute on function public.mfa_level_ok() from public, anon;
grant execute on function public.mfa_level_ok() to authenticated;

-- Sin factores verificados alcanza con aal1; con un factor verificado hace falta aal2.
do $$
declare t text;
begin
  foreach t in array array['accounts','categories','recurring_items','transactions','exchange_rates','savings_goals','user_settings'] loop
    execute format('drop policy if exists "mfa" on public.%I', t);
    execute format(
      'create policy "mfa" on public.%I as restrictive for all to authenticated using ((select public.mfa_level_ok()))',
      t);
  end loop;
end $$;
