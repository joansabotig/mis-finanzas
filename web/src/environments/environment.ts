// Datos públicos del proyecto Supabase (Project Settings → API).
// La "anon / publishable key" puede ir en el front: los datos los protege RLS.
// ⚠ Nunca pongas acá la "service_role / secret key".
export const environment = {
  supabaseUrl: 'https://bdidzjcfbknlbthmyptj.supabase.co',
  supabaseAnonKey: 'sb_publishable_5efFuwre_JvSCGK6B_0CxA_oToVJYt-',
  /** Mostrar "Continuar con Google" (requiere configurar el proveedor en Supabase, ver SETUP.md). */
  googleLogin: false,
  /** Permitir que cualquiera cree una cuenta (requiere habilitar sign-ups en Supabase). */
  allowSignup: false,
};
