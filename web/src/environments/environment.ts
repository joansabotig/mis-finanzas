// Datos públicos del proyecto Supabase (Project Settings → API).
// La "anon / publishable key" puede ir en el front: los datos los protege RLS.
// ⚠ Nunca pongas acá la "service_role / secret key".
export const environment = {
  supabaseUrl: 'https://bdidzjcfbknlbthmyptj.supabase.co',
  supabaseAnonKey: 'sb_publishable_5efFuwre_JvSCGK6B_0CxA_oToVJYt-',
  /** Mostrar "Continuar con Google" (requiere configurar el proveedor en Supabase, ver SETUP.md §8). */
  googleLogin: true,
  /** Permitir que cualquiera cree una cuenta (requiere habilitar sign-ups en Supabase). */
  allowSignup: true,
  /** Site key pública de Cloudflare Turnstile (captcha). Vacía = sin captcha. */
  turnstileSiteKey: '0x4AAAAAAGTN10mrJmKjYo_S',
  /** Email de contacto que se muestra en la política de privacidad (vacío = no se muestra). */
  contactEmail: '',
};
