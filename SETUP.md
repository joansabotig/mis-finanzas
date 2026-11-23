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

## Notas

- **Supabase pausa proyectos gratis tras 7 días sin uso.** Si pasa, se reactiva desde el panel con un clic.
- Angular está en la **v21** porque tu Node es 22.16 (Angular 22 pide Node ≥ 22.22). Si actualizás Node, se migra con `npx ng update @angular/core @angular/cli`.
