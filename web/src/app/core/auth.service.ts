import { Injectable, inject, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

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
    return error ? error.message : null;
  }

  async signOut(): Promise<void> {
    await this.sb.client.auth.signOut();
  }
}
