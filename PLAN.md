# Plan: App de finanzas personales (PWA)

> Basado en la planilla de finanzas que uso hoy (hojas **Saldos** y **Gastos**). Los nombres de cuentas y conceptos son ejemplos.

---

## 1. Qué hace hoy tu Excel (y qué tiene que cubrir la app)

**Hoja Saldos**
- Cuentas en **USD**: efectivo, broker, exchange cripto, banco.
- Cuentas en **ARS**: banco, billeteras virtuales, efectivo, broker, plazo fijo, fondo común de inversión, *préstamo a un amigo* (plata que me deben), *deuda* (saldo negativo).
- **Existencia actual** = USD × valor del dólar + ARS.
- **Ingresos**: fijos (sueldo, trabajo extra), pasivos, y rendimiento estimado de inversiones (% mensual de billetera, plazo fijo y broker).
- **Gastos estimados**: fijos + variables (nafta, supermercado, comida y otros).
- **Ganancia mensual** = ingresos − gastos, y **destino de la ganancia** (compra de dólares, inversiones, metas de ahorro) → lo que "queda".

**Hoja Gastos** (un bloque de columnas por mes)
- Resumen del mes: Total, Fijos, Variables, Casa, Inversión.
- **Gastos fijos**: monto, fecha, concepto y "ok" cuando ya está pago (servicios, suscripciones, seguros, impuestos…).
- **Gastos variables**: monto, fecha, concepto (supermercado, nafta, salidas, compras…).

**Lo que falta en el Excel y la app va a resolver**
- Cada gasto/ingreso **impacta en una cuenta**, entonces el saldo de cada cuenta se calcula solo (hoy se actualiza a mano).
- Cargar un gasto desde el celular en 5 segundos.
- Categorías consistentes → reportes por categoría y por mes sin fórmulas.
- Transferencias entre cuentas y compra de dólares (ARS → USD) como un solo movimiento.

---

## 2. Stack recomendado

### Opción recomendada: Angular PWA + Supabase (costo $0, sin servidor propio)

| Pieza | Tecnología | Por qué |
|---|---|---|
| Frontend | **Angular** (última versión, standalone + signals) con `@angular/pwa` | Ya lo sabés. `ng add @angular/pwa` genera service worker y manifest → se instala en Android como app. |
| UI | **Angular Material** (o PrimeNG) | Componentes mobile-friendly listos. |
| Base de datos | **Supabase** (PostgreSQL administrado) | SQL real (lo sabés), vistas y funciones para calcular saldos. Plan gratis: 500 MB, sobra para años. |
| Autenticación | **Supabase Auth** (login con Google o email) | Sin escribir backend de login. Seguridad con *Row Level Security*: cada fila solo la ve su dueño. |
| Hosting del front | **Cloudflare Pages** (o Netlify / Firebase Hosting) | Gratis, HTTPS automático (obligatorio para PWA), deploy automático en cada `git push`. |
| Código | **GitHub** (repo privado) | Gratis; GitHub Actions para backups. |
| Cotización dólar | **dolarapi.com** (gratis) | Oficial / blue / MEP / tarjeta, para reemplazar la celda "valor dólar". |
| Gráficos | ng2-charts (Chart.js) | Simple. |

**Ventajas:** $0, sin "cold start" (la app abre al instante, no hay un servidor que se duerma), no dependés del servidor Windows que no es tuyo, cero mantenimiento de infraestructura.

**Contras / a tener en cuenta:**
- Supabase gratis **pausa el proyecto si pasa 1 semana sin uso** → como lo vas a usar a diario, no es problema; y se reactiva desde el panel.
- El plan gratis no tiene backups automáticos restaurables → hacemos un **backup semanal con GitHub Actions** (`pg_dump` a un artefacto/privado). Gratis.
- La lógica "de negocio" vive en SQL (vistas/funciones) y en Angular, no en C#.

### Alternativa: Angular PWA + API ASP.NET Core (C#)
Si preferís usar C#:
- API **ASP.NET Core Minimal API + EF Core** → **Azure App Service F1 (gratis)** o Render (Docker, gratis).
- Base: **Azure SQL Database free offer** (serverless gratis) o Postgres en Neon/Supabase.
- Contras: los planes gratis de .NET **se duermen** (primer request 10–60 s, molesto en el celular), F1 tiene 60 min de CPU/día, y tenés que escribir auth (JWT) vos.
- También se podría hostear en tu servidor Windows (IIS), pero dependés de alguien más.

👉 **Mi recomendación: Opción Supabase.** Para una app personal de un solo usuario, un backend propio agrega costo y mantenimiento sin aportar mucho. Si más adelante querés lógica pesada en C#, se puede sumar una API sin rehacer el front.

### ¿Y en Android?
1. **PWA instalada** (fase 1): abrís la URL en Chrome → "Instalar app" → queda con ícono, pantalla completa y sin barra del navegador. Suficiente.
2. **Play Store** (opcional, más adelante): empaquetar la misma PWA como TWA con *Bubblewrap* (cuenta de desarrollador Google: USD 25 una vez). No hace falta para uso personal.

---

## 3. Modelo de datos (PostgreSQL)

```sql
-- Monedas: 'ARS', 'USD' (extensible a 'USDT')

create table accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users,
  name            text not null,                 -- "Banco", "Billetera", "Efectivo"
  type            text not null,                 -- bank | wallet | cash | investment | crypto | receivable | debt
  currency        text not null,                 -- ARS | USD
  initial_balance numeric(18,2) not null default 0,
  monthly_rate    numeric(8,5),                  -- % mensual estimado (MP, plazo fijo, Bull Market)
  include_in_total boolean not null default true,
  is_active       boolean not null default true,
  sort_order      int not null default 0
);

create table categories (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users,
  name      text not null,                       -- Supermercado, Nafta, Servicios, Salidas…
  kind      text not null,                       -- expense | income
  grp       text,                                -- fijo | variable | casa | inversion
  icon      text, color text
);

-- Plantilla de gastos fijos (lo que hoy copiás cada mes con "ok")
create table recurring_items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users,
  name             text not null,                -- Netflix, Luz, Monotributo…
  kind             text not null default 'expense', -- expense | income (Sueldo también puede ser recurrente)
  estimated_amount numeric(18,2),
  currency         text not null default 'ARS',
  category_id      uuid references categories,
  default_account_id uuid references accounts,
  due_day          int,                          -- día de vencimiento
  is_active        boolean not null default true
);

create table transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users,
  date           date not null default current_date,
  type           text not null,                  -- expense | income | transfer | adjustment
  account_id     uuid not null references accounts,
  amount         numeric(18,2) not null,         -- siempre positivo (en la moneda de account_id)
  to_account_id  uuid references accounts,       -- solo transfer
  to_amount      numeric(18,2),                  -- transfer entre monedas (compra de dólares)
  category_id    uuid references categories,
  description    text,
  recurring_id   uuid references recurring_items,-- si es el pago de un gasto fijo
  period         char(7),                        -- 'YYYY-MM' al que corresponde el fijo
  created_at     timestamptz not null default now()
);

create table exchange_rates (
  date date primary key, source text, buy numeric(18,2), sell numeric(18,2)
);

-- Fase 3: metas de ahorro / destino de la ganancia
create table savings_goals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users,
  name text not null,            -- Ahorro vacaciones, auto, casa
  monthly_allocation numeric(18,2), target_amount numeric(18,2), currency text default 'ARS'
);
```

**Saldo de una cuenta** = `initial_balance` + ingresos − gastos − transferencias salientes + transferencias entrantes (`to_amount`) ± ajustes → una **vista SQL `account_balances`**, así nunca se desincroniza.

**Gasto fijo "ok"**: el checklist del mes = `recurring_items` LEFT JOIN `transactions` del `period` actual. Tocar "Pagar" crea la transacción (con monto editable y cuenta) → queda tildado y descuenta del saldo.

**Deudas / préstamos**: plata prestada a alguien es una cuenta tipo `receivable`; una deuda es una cuenta tipo `debt` con saldo negativo. Así entran en el patrimonio total igual que hoy.

**Seguridad**: RLS en todas las tablas con `user_id = auth.uid()`, y desactivar el registro de nuevos usuarios una vez creado el tuyo.

---

## 4. Pantallas

1. **Inicio (dashboard)**
   - Patrimonio total en ARS y USD (con la cotización elegida).
   - Saldo de cada cuenta, agrupado ARS / USD.
   - Mes actual: ingresos, fijos pagados vs pendientes, variables, y **"queda"**.
2. **Cargar movimiento** (botón flotante "+", pensado para el celular)
   - Monto (teclado numérico), Gasto / Ingreso / Transferencia, cuenta (recuerda la última), categoría (chips con las más usadas), descripción, fecha = hoy.
3. **Gastos fijos del mes**: checklist estilo tu columna "ok", con vencimiento, monto estimado y botón "Pagar".
4. **Movimientos**: lista por mes con filtros (cuenta, categoría, tipo), buscar, editar, borrar.
5. **Cuentas**: alta/edición, transferencias, compra de dólares, **ajuste de saldo** (para conciliar con el homebanking).
6. **Reportes**: gasto por categoría del mes, evolución mensual (fijos vs variables, como tu fila de totales), ingresos vs gastos.
7. **Presupuesto / Proyección** (equivalente a la parte de arriba de Saldos): ingresos fijos + rendimiento estimado − fijos − variables estimados = ganancia, y reparto en metas de ahorro.
8. **Configuración**: categorías, plantilla de gastos fijos, cotización del dólar, exportar CSV.

---

## 5. Fases de trabajo

### Fase 0 — Setup ✅
- [x] Repo en GitHub, proyecto Supabase, Angular 21 + PWA + Material, deploy en Cloudflare Pages.

### Fase 1 — MVP usable ✅
- [x] Migración SQL inicial (tablas, vista de saldos, RLS), login, guard de rutas.
- [x] ABM de cuentas y categorías, carga rápida, lista de movimientos, dashboard.
- [x] Carga inicial de cuentas y saldos desde la planilla.

### Fase 2 — Paridad con la planilla ✅
- [x] Checklist mensual de gastos/ingresos fijos con "Pagar" precargado.
- [x] Transferencias, compra de dólares (monto destino + tipo de cambio implícito), pago de tarjeta.
- [x] Cotización automática (dolarapi: oficial/blue/MEP/tarjeta/cripto) o manual.
- [x] Reportes por categoría, por tipo (fijo/variable/casa/inversión) y por medio de pago.
- [x] Ajuste de saldo para conciliar con el banco.

### Fase 3 — Mejor que la planilla (en curso)
- [x] Tarjetas de crédito: cierre/vencimiento, resumen a pagar, consumos del período, deuda total.
- [x] Compras en cuotas.
- [x] Historial: búsqueda por texto en todos los meses + filtros por categoría y cuenta.
- [x] Evolución de ingresos vs gastos (6 meses).
- [x] Importador del historial de la planilla (`tools/import-excel`).
- [x] Exportar movimientos a CSV.
- [ ] Presupuesto mensual por categoría con aviso al pasarse.
- [ ] Proyección mensual + metas de ahorro (la tabla `savings_goals` ya existe).
- [ ] Rendimiento estimado de inversiones (el % mensual por cuenta ya se guarda).
- [ ] Consumos en dólares dentro de la tarjeta (resumen en ARS + USD).
- [ ] Backup semanal automático con GitHub Actions.

### Fase 4 — App pública
- [x] Multiusuario: RLS por `user_id` + datos iniciales por trigger al registrarse.
- [x] Login con Google y registro por email (detrás de flags, ver SETUP.md §8).
- [ ] SMTP propio para los emails de registro (Resend/Brevo) y dominio propio.
- [ ] Onboarding: asistente para crear las primeras cuentas, tarjetas y fijos.
- [ ] Política de privacidad y términos. En Argentina, la Ley 25.326 de datos personales pide inscribir la base de datos ante la AAIP.
- [ ] Borrar la cuenta y descargar los datos desde la app (derechos de acceso y supresión).
- [ ] Límites del plan gratis de Supabase (500 MB, 50.000 usuarios activos/mes) → plan pago al crecer.
- [ ] Modelo de negocio: freemium (gratis con lo básico; premium con importación de resúmenes, presupuestos, cuentas compartidas en pareja).
- [ ] Modo offline (cola en IndexedDB), recordatorios push de vencimientos, Play Store (TWA).

---

## 6. Estructura del proyecto

```
App money/
├─ PLAN.md
├─ web/                     # Angular PWA
│  ├─ src/app/
│  │  ├─ core/              # supabase client, auth, guards, servicios
│  │  ├─ features/
│  │  │  ├─ home/
│  │  │  ├─ transactions/   # lista + alta rápida
│  │  │  ├─ recurring/      # gastos fijos del mes
│  │  │  ├─ accounts/
│  │  │  ├─ reports/
│  │  │  ├─ categories/
│  │  │  └─ more/           # cotización, exportar CSV, sesión
│  │  └─ shared/            # pipes de moneda, componentes comunes
│  ├─ ngsw-config.json
│  └─ public/manifest.webmanifest
├─ supabase/
│  └─ migrations/           # SQL versionado (tablas, vistas, RLS)
├─ tools/
│  └─ import-excel/         # script de importación del historial
└─ .github/workflows/       # deploy / backup
```

---

## 7. Decisiones tomadas

1. **Stack**: Angular PWA + Supabase + Cloudflare Pages.
2. **Login**: email + contraseña; Google listo para activar (SETUP.md §8).
3. **Cotización**: configurable en Más → manual por defecto, o automática (oficial/blue/MEP/tarjeta/cripto).
4. **Historial**: importador incluido; correrlo es opcional (SETUP.md §7).
5. **Categorías**: las de la planilla, más Auto y moto, Salud y Viajes al importar.

## 8. Ideas tomadas de apps similares

- **Firefly III / Actual Budget** (open source): transacciones recurrentes, tarjetas como cuentas de deuda, reglas de clasificación, presupuestos → acá: fijos del mes, tarjetas con resumen, importador con reglas por palabra clave.
- **Apps argentinas** (billeteras, bancos digitales, Spendee/Monefy): cuotas, resumen de tarjeta (pagar el total, no el mínimo), dólar en sus distintas cotizaciones, carga rápida desde el celular → acá: cuotas, "A pagar / vence", cotización automática, botón "+".
