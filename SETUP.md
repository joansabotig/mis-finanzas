# Puesta en marcha (Fase 0)

Pasos que tenés que hacer vos (crear cuentas y contraseñas). Todo es gratis.

## 1. Supabase (base de datos + login)

1. Entrá a <https://supabase.com>, creá una cuenta y un **New project**.
   - Región: **South America (São Paulo)**.
   - Guardá la contraseña de la base en tu gestor de contraseñas.
2. **SQL Editor → New query**: pegá todo [supabase/migrations/20261123000000_init.sql](supabase/migrations/20261123000000_init.sql) → **Run**.
3. **Authentication → Users → Add user → Create new user**: tu email + contraseña, marcando *Auto Confirm User*.
4. **Authentication → Sign In / Providers**: desactivá **Allow new users to sign up** (así nadie más puede registrarse).
5. Abrí [supabase/seed.local.sql](supabase/seed.local.sql), reemplazá `TU_EMAIL` por el email del paso 3, pegalo en el SQL Editor → **Run**. Carga tus cuentas con los saldos del Excel, categorías y gastos fijos.
   *(Este archivo está en `.gitignore`: tiene tus saldos reales y no se sube a GitHub.)*
6. **Project Settings → API** (o *Data API / API Keys*): copiá
   - **Project URL** → `supabaseUrl`
   - **anon / publishable key** → `supabaseAnonKey`

   en [web/src/environments/environment.ts](web/src/environments/environment.ts).
   ⚠ Nunca uses la *service_role / secret key* en el front.

## 2. Probar en tu PC

```powershell
cd "E:\App money\web"
npm start
```

Abrí <http://localhost:4200>, ingresá con tu usuario y deberías ver tus cuentas y el patrimonio total.

> Si `npm install` falla con `Cannot read properties of null (reading 'edgesOut')`, es un bug de npm 10.9: usá `npx npm@11.6.2 install`.

## 3. GitHub

1. Creá un repo **privado** (ej. `mis-finanzas`) sin README.
2. Desde `E:\App money`:

```powershell
git add .
git commit -m "Fase 0: Angular PWA + Supabase"
git remote add origin https://github.com/<tu-usuario>/mis-finanzas.git
git push -u origin main
```

## 4. Cloudflare Pages (hosting con HTTPS)

1. <https://dash.cloudflare.com> → **Workers & Pages → Create → Pages → Connect to Git** → elegí el repo.
2. Configuración del build:
   | Campo | Valor |
   |---|---|
   | Framework preset | None |
   | Root directory | `web` |
   | Build command | `npx ng build` |
   | Build output directory | `dist/web/browser` |
   | Variable de entorno | `NODE_VERSION` = `22.16.0` |
3. **Save and Deploy**. Te da una URL `https://<algo>.pages.dev`. Cada `git push` vuelve a desplegar.

## 5. Instalar en Android

1. Abrí la URL `.pages.dev` en **Chrome**.
2. Menú ⋮ → **Instalar app** (o "Agregar a pantalla principal").
3. Queda con ícono propio y se abre a pantalla completa.

## 6. Migración 2: tarjetas, cuotas y cotización automática

Necesaria para tarjetas de crédito, compras en cuotas, la cotización automática del dólar y los datos iniciales de usuarios nuevos. Es **aditiva**: no borra ni cambia datos.

1. Supabase → **SQL Editor → New query**.
2. Pegá [supabase/migrations/20261123010000_tarjetas_cuotas_usuarios.sql](supabase/migrations/20261123010000_tarjetas_cuotas_usuarios.sql) → **Run**.
   ```powershell
   Get-Content "E:\App money\supabase\migrations\20261123010000_tarjetas_cuotas_usuarios.sql" -Raw -Encoding UTF8 | Set-Clipboard
   ```
3. Si aparece el aviso de "destructive operation", es por el `drop view` (se recrea igual con columnas nuevas): confirmá.

Sin esta migración la app funciona igual, pero no deja crear tarjetas ni cargar cuotas, y la cotización queda en manual.

### 6.b Migración 3: gastos fijos en $0

Permite marcar como pagado un gasto fijo con monto $0 (por ejemplo, una suscripción bonificada). Los movimientos comunes siguen exigiendo monto mayor a 0. Pegá [supabase/migrations/20261125000000_fijos_en_cero.sql](supabase/migrations/20261125000000_fijos_en_cero.sql) en el SQL Editor → **Run**.

## 7. Importar el historial de la planilla (opcional)

Trae todos los meses de la hoja **Gastos** (feb-2022 en adelante), clasificados por categoría, a una cuenta oculta **"Histórico (planilla)"**: no cambia ningún saldo, pero alimenta **Reportes** y la **búsqueda**.

1. Descargá la planilla como `.xlsx` (Archivo → Descargar → Microsoft Excel).
2. Generá el SQL (el último bloque de la hoja es el mes que indiques):
   ```powershell
   node tools/import-excel/build-sql.mjs "C:\ruta\planilla.xlsx" 2026-11 tu-email@gmail.com
   ```
   Muestra una tabla de control por mes y escribe `supabase/import-historial.local.sql` (excluido de git).
3. Pegá ese archivo en el SQL Editor → **Run**. Se puede repetir: borra lo importado antes y vuelve a cargar.

> Ya generé uno con tu planilla actual, con `TU_EMAIL` como placeholder: reemplazalo por tu email antes de correrlo.

## 8. Registro de usuarios: email + contraseña y Google ✅ (configurado el 24/11/2026)

La app es **multiusuario**: cada fila tiene `user_id` y las políticas RLS impiden ver datos ajenos. Al registrarse, un trigger crea la cuenta "Efectivo" y categorías básicas. Link para compartir: <https://mis-finanzas-a8l.pages.dev/registro>.

Qué quedó configurado (por si hay que rehacerlo o cambiar de dominio):

**Google Cloud** — proyecto `mis-finanzas-515802`, Google Auth Platform:
- Marca: nombre "Mis Finanzas", página principal `https://mis-finanzas-a8l.pages.dev`, privacidad `https://mis-finanzas-a8l.pages.dev/privacidad`.
- Público: usuarios externos, **en producción** (sin logo ni permisos sensibles no requiere verificación; subir un logo sí la pide).
- Cliente OAuth "Mis Finanzas Web" (aplicación web): orígenes `https://mis-finanzas-a8l.pages.dev` y `http://localhost:4200`; redirección `https://bdidzjcfbknlbthmyptj.supabase.co/auth/v1/callback`.

**Supabase → Authentication:**
- *Sign In / Providers*: Google habilitado con el Client ID/Secret; registro de usuarios nuevos y "Confirmar email" activados.
- *URL Configuration*: Site URL `https://mis-finanzas-a8l.pages.dev`; Redirect URLs `https://mis-finanzas-a8l.pages.dev/**` y `http://localhost:4200/**`.
- *Emails → SMTP*: Brevo (`smtp-relay.brevo.com`, puerto 587), remitente "Mis Finanzas". Límite de Supabase: 30 emails/hora (ajustable en *Rate Limits*); Brevo gratis: 300/día.
- *Emails → Templates*: "Confirmar registro" y "Restablecer contraseña" en español, copias en [supabase/email-templates](supabase/email-templates).

**App:** `googleLogin: true` y `allowSignup: true` en [web/src/environments/environment.ts](web/src/environments/environment.ts).

> Para lanzarlo en serio: un dominio propio (ej. `misfinanzas.com.ar`) mejora la entrega de emails (hoy salen "desde un Gmail" y pueden caer en spam) y se ve más profesional en la pantalla de Google. Al cambiar de dominio hay que actualizar las URLs de arriba en Google y en Supabase.

## 9. Seguridad (configurado el 26/11/2026)

- **Migración 4** ([supabase/migrations/20261126000000_seguridad.sql](supabase/migrations/20261126000000_seguridad.sql)): valida que cuentas, categorías y fijos de cada movimiento sean del mismo usuario; exige sesión con verificación en dos pasos (aal2) a quien la tenga activada; funciones `delete_my_account()` y `restore_my_data()`.
- **Migración 5** ([supabase/migrations/20261127000000_mfa_politica_fix.sql](supabase/migrations/20261127000000_mfa_politica_fix.sql)): **obligatoria después de la 4**. La política de dos pasos de la 4 leía `auth.mfa_factors` sin permiso y bloqueaba todas las consultas; la 5 la reemplaza por la función `mfa_level_ok()`.
- **Verificación en dos pasos (TOTP)**: el usuario la activa en *Más → Seguridad y datos*. Supabase la trae habilitada por defecto (*Authentication → Multifactor*). Si alguien pierde el celular: Supabase → *Authentication → Users* → el usuario → borrar su factor MFA.
- **Captcha**: Cloudflare Turnstile, widget "Mis Finanzas" (hostnames `mis-finanzas-a8l.pages.dev` y `localhost`). La *site key* está en `environment.ts`; la *secret key* va en Supabase → *Authentication → Attack Protection* (proveedor "Turnstile de Cloudflare"). Si se cambia de dominio, agregarlo al widget.
- **Cabeceras de seguridad**: [web/public/_headers](web/public/_headers) (CSP, HSTS, X-Frame-Options, etc.). Si la app empieza a usar otro servicio externo, hay que sumarlo a la CSP o el navegador lo bloquea.
- **Backup**: *Más → Seguridad y datos → Descargar backup* (JSON). Restaurar reemplaza todos los datos en una sola transacción.
- **Pendiente tuyo**: verificación en dos pasos en tus cuentas de Supabase, GitHub, Google, Cloudflare y Brevo.

## Notas

- **Supabase pausa proyectos gratis tras 7 días sin uso.** Si pasa, se reactiva desde el panel con un clic.
- Angular está en la **v21** porque tu Node es 22.16 (Angular 22 pide Node ≥ 22.22). Si actualizás Node, se migra con `npx ng update @angular/core @angular/cli`.
