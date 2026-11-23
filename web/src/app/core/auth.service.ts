import { Injectable, inject, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

/** Traduce los errores más comunes de Supabase Auth. */
function friendly(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Email o contraseña incorrectos.';
  if (/email not confirmed/i.test(message)) return 'Tenés que confirmar tu email: revisá tu casilla.';
  if (/signups? not allowed|signup is disabled/i.test(message)) return 'El registro de nuevos usuarios está cerrado por ahora.';
  if (/provider is not enabled/i.test(message)) return 'El inicio con Google todavía no está habilitado.';
  if (/password should be at least/i.test(message)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/user already registered/i.test(message)) return 'Ya existe una cuenta con ese email: iniciá sesión.';
  return message;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly sb = inject(SupabaseService);
  readonly session = signal<Session | null>(null);
  readonly ready: Promise<void>;

  constructor() {
    const auth = this.sb.client.auth;
    this.ready = this.sb.isConfigured
      ? auth.getSession().then(({ data }) => this.session.set(data.session))
      : Promise.resolve();
    auth.onAuthStateChange((_event, session) => this.session.set(session));
  }

  async signIn(email: string, password: string): Promise<string | null> {
    const { error } = await this.sb.client.auth.signInWithPassword({ email, password });
    return error ? friendly(error.message) : null;
  }

  /** Devuelve null si quedó logueado, 'confirm' si hay que confirmar el email, o un mensaje de error. */
  async signUp(email: string, password: string): Promise<string | 'confirm' | null> {
    const { data, error } = await this.sb.client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: location.origin },
    });
    if (error) return friendly(error.message);
    return data.session ? null : 'confirm';
  }

  async signInWithGoogle(): Promise<string | null> {
    const { error } = await this.sb.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin },
    });
    return error ? friendly(error.message) : null;
  }

  async signOut(): Promise<void> {
    await this.sb.client.auth.signOut();
  }
}
