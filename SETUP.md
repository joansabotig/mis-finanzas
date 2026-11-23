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

## 8. Login con Google y registro de otros usuarios (para cuando sea pública)

La app ya es **multiusuario**: cada fila tiene `user_id` y las políticas RLS impiden ver datos ajenos. Al registrarse, un trigger crea la cuenta "Efectivo" y categorías básicas.

**Google:**
1. <https://console.cloud.google.com> → proyecto nuevo → **APIs y servicios → Pantalla de consentimiento de OAuth** (Externo, nombre "Mis Finanzas", tu email de soporte).
2. **Credenciales → Crear credenciales → ID de cliente OAuth → Aplicación web**:
   - Orígenes autorizados: `https://mis-finanzas-a8l.pages.dev` y `http://localhost:4200`
   - URI de redirección: `https://bdidzjcfbknlbthmyptj.supabase.co/auth/v1/callback`
3. Supabase → **Authentication → Sign In / Providers → Google**: activalo y pegá el *Client ID* y *Client Secret*.
4. Supabase → **Authentication → URL Configuration**: *Site URL* = `https://mis-finanzas-a8l.pages.dev`; en *Redirect URLs* agregá `http://localhost:4200`.
5. En [web/src/environments/environment.ts](web/src/environments/environment.ts): `googleLogin: true`.

**Registro abierto** (cualquiera puede crear cuenta): Supabase → Authentication → activá **Allow new users to sign up** y poné `allowSignup: true` en `environment.ts`. Antes de abrirlo al público, configurá un SMTP propio (Authentication → Emails → SMTP, ej. Resend o Brevo gratis): el de Supabase solo manda ~2 emails por hora.

## Notas

- **Supabase pausa proyectos gratis tras 7 días sin uso.** Si pasa, se reactiva desde el panel con un clic.
- Angular está en la **v21** porque tu Node es 22.16 (Angular 22 pide Node ≥ 22.22). Si actualizás Node, se migra con `npx ng update @angular/core @angular/cli`.
