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

### Fase 0 — Setup (½ día)
- [ ] `git init`, repo privado en GitHub.
- [ ] Crear proyecto en Supabase (región São Paulo, la más cercana).
- [ ] `ng new money --standalone --routing --style=scss` + `ng add @angular/pwa` + `ng add @angular/material`.
- [ ] Conectar el repo a Cloudflare Pages → deploy automático.
- [ ] **Instalar la PWA "Hola mundo" en tu Android** para validar el circuito completo desde el día 1.

### Fase 1 — MVP usable (1–2 semanas a ritmo tranquilo)
- [ ] Migraciones SQL: tablas, vista de saldos, políticas RLS.
- [ ] Login (Google o email) + guard de rutas.
- [ ] ABM de cuentas y categorías.
- [ ] Carga rápida de gastos/ingresos.
- [ ] Lista de movimientos del mes (editar/borrar).
- [ ] Dashboard con saldos por cuenta y patrimonio total.
- [ ] **Carga inicial**: tus cuentas con el saldo actual del Excel como `initial_balance`.
- 🎯 *A partir de acá dejás de usar el Excel para el día a día.*

### Fase 2 — Paridad con el Excel
- [ ] Plantilla de gastos fijos + checklist mensual con "Pagar".
- [ ] Transferencias y compra de dólares (ARS → USD con cotización).
- [ ] Cotización automática (dolarapi) con opción de valor manual.
- [ ] Resumen mensual: Total / Fijos / Variables / Casa / Inversión.
- [ ] Ajuste de saldo para conciliar.

### Fase 3 — Mejor que el Excel
- [ ] Reportes y gráficos por categoría y evolución mensual.
- [ ] Proyección mensual + metas de ahorro.
- [ ] Rendimiento estimado de inversiones (% mensual por cuenta).
- [ ] **Importar historial** de la hoja Gastos (script Node que lee el .xlsx y genera los movimientos, en una cuenta "Histórico" que no afecta saldos) → para tener los reportes desde el primer mes.
- [ ] Backup semanal automático con GitHub Actions.

### Fase 4 — Extras (opcional)
- [ ] Modo offline: cola de movimientos en IndexedDB que se sincroniza al volver la conexión.
- [ ] Recordatorios de vencimiento de fijos (notificaciones push).
- [ ] Atajo "agregar gasto" desde el ícono de la app (shortcuts del manifest).
- [ ] Empaquetar para Play Store (TWA).

---

## 6. Estructura del proyecto

```
App money/
├─ PLAN.md
├─ web/                     # Angular PWA
│  ├─ src/app/
│  │  ├─ core/              # supabase client, auth, guards, servicios
│  │  ├─ features/
│  │  │  ├─ dashboard/
│  │  │  ├─ transactions/   # lista + alta rápida
│  │  │  ├─ recurring/      # gastos fijos del mes
│  │  │  ├─ accounts/
│  │  │  ├─ reports/
│  │  │  └─ settings/
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

## 7. Decisiones pendientes (a confirmar antes de arrancar)

1. **Stack**: Supabase (recomendado) o API en .NET.
2. **Login**: con Google (más cómodo en Android) o email + contraseña.
3. **Cotización por defecto** para el patrimonio total: oficial, blue o MEP.
4. **Historial**: ¿importar todos los meses de la hoja Gastos, o arrancar de cero desde este mes?
5. **Categorías iniciales**: Supermercado, Nafta, Comida y salidas, Servicios, Suscripciones, Seguros, Impuestos, Casa, Hobbies, Compras, Otros.
