import { Injectable, inject, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

/** Traduce los errores más comunes de Supabase Auth. */
export function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Email o contraseña incorrectos.';
  if (/email not confirmed/i.test(message)) return 'Todavía no confirmaste tu email: revisá tu casilla (y la carpeta de spam).';
  if (/signups? not allowed|signup is disabled/i.test(message)) return 'El registro de nuevos usuarios está cerrado por ahora.';
  if (/provider is not enabled/i.test(message)) return 'El inicio con Google todavía no está habilitado.';
  if (/password should be at least|weak password/i.test(message)) return 'La contraseña es muy débil: usá al menos 8 caracteres.';
  if (/user already registered/i.test(message)) return 'Ya existe una cuenta con ese email: iniciá sesión.';
  if (/rate limit|too many/i.test(message)) return 'Demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.';
  if (/invalid email|unable to validate email/i.test(message)) return 'El email no es válido.';
  if (/same.*password|different from the old/i.test(message)) return 'La contraseña nueva tiene que ser distinta de la anterior.';
  return message;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly sb = inject(SupabaseService);
  readonly session = signal<Session | null>(null);
  /** true cuando el usuario entró desde un link de "olvidé mi contraseña". */
  readonly recovering = signal(false);
  readonly ready: Promise<void>;

  constructor() {
    const auth = this.sb.client.auth;
    this.ready = this.sb.isConfigured
      ? auth.getSession().then(({ data }) => this.session.set(data.session))
      : Promise.resolve();
    auth.onAuthStateChange((event, session) => {
      this.session.set(session);
      if (event === 'PASSWORD_RECOVERY') this.recovering.set(true);
    });
  }

  private redirect(path = '/') {
    return location.origin + path;
  }

  async signIn(email: string, password: string): Promise<string | null> {
    const { error } = await this.sb.client.auth.signInWithPassword({ email, password });
    return error ? friendlyAuthError(error.message) : null;
  }

  /** Devuelve null si quedó logueado, 'confirm' si hay que confirmar el email, o un mensaje de error. */
  async signUp(email: string, password: string): Promise<string | 'confirm' | null> {
    const { data, error } = await this.sb.client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: this.redirect('/') },
    });
    if (error) return friendlyAuthError(error.message);
    // Si el email ya existía, Supabase no da error (para no revelar cuentas) pero devuelve un usuario sin identidades.
    if (data.user && data.user.identities?.length === 0) return 'Ya existe una cuenta con ese email: iniciá sesión o recuperá tu contraseña.';
    return data.session ? null : 'confirm';
  }

  async signInWithGoogle(): Promise<string | null> {
    const { error } = await this.sb.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: this.redirect('/'), queryParams: { prompt: 'select_account' } },
    });
    return error ? friendlyAuthError(error.message) : null;
  }

  async sendPasswordReset(email: string): Promise<string | null> {
    const { error } = await this.sb.client.auth.resetPasswordForEmail(email, { redirectTo: this.redirect('/restablecer') });
    return error ? friendlyAuthError(error.message) : null;
  }

  async updatePassword(password: string): Promise<string | null> {
    const { error } = await this.sb.client.auth.updateUser({ password });
    if (!error) this.recovering.set(false);
    return error ? friendlyAuthError(error.message) : null;
  }

  async signOut(): Promise<void> {
    await this.sb.client.auth.signOut();
  }
}
