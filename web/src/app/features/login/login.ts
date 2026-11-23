import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <mat-card class="login" appearance="outlined">
      <mat-card-header>
        <mat-card-title>Mis Finanzas</mat-card-title>
        <mat-card-subtitle>{{ mode() === 'signup' ? 'Creá tu cuenta gratis' : 'Tus cuentas, gastos y tarjetas en un solo lugar' }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (!configured) {
          <p class="error">Falta configurar Supabase en <code>src/environments/environment.ts</code>.</p>
        }

        @if (googleLogin) {
          <button mat-stroked-button class="google" type="button" (click)="google()" [disabled]="loading() || !configured">
            <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
              <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.9-6.1z" />
              <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
            </svg>
            Continuar con Google
          </button>
          <div class="or"><span>o con tu email</span></div>
        }

        <form (ngSubmit)="submit()">
          <mat-form-field appearance="outline">
            <mat-label>Email</mat-label>
            <input matInput type="email" name="email" autocomplete="username" [(ngModel)]="email" required />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Contraseña</mat-label>
            <input matInput type="password" name="password" [attr.autocomplete]="mode() === 'signup' ? 'new-password' : 'current-password'" [(ngModel)]="password" required />
          </mat-form-field>
          @if (error()) { <p class="error">{{ error() }}</p> }
          @if (info()) { <p class="info">{{ info() }}</p> }
          <button mat-flat-button type="submit" [disabled]="loading() || !configured">
            {{ mode() === 'signup' ? 'Crear cuenta' : 'Ingresar' }}
          </button>
        </form>

        @if (allowSignup) {
          <button mat-button class="switch" type="button" (click)="toggleMode()">
            {{ mode() === 'signup' ? '¿Ya tenés cuenta? Iniciá sesión' : '¿No tenés cuenta? Creala gratis' }}
          </button>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .login { max-width: 380px; margin: 12vh auto 0; width: calc(100% - 32px); box-sizing: border-box; }
    form { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
    .google { width: 100%; margin-top: 16px; }
    .google svg { margin-right: 8px; vertical-align: middle; }
    .or { display: flex; align-items: center; gap: 8px; margin: 16px 0 4px; color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-small); }
    .or::before, .or::after { content: ''; flex: 1; border-top: 1px solid var(--mat-sys-outline-variant); }
    .switch { width: 100%; margin-top: 8px; }
    .error { color: var(--mat-sys-error); }
    .info { color: var(--mat-sys-primary); }
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly configured = inject(SupabaseService).isConfigured;
  protected readonly googleLogin = environment.googleLogin;
  protected readonly allowSignup = environment.allowSignup;
  protected email = '';
  protected password = '';
  protected readonly mode = signal<'login' | 'signup'>('login');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly info = signal<string | null>(null);

  constructor() {
    // Al volver de Google (OAuth) la sesión llega sola: entramos directo.
    effect(() => {
      if (this.auth.session()) this.router.navigateByUrl('/');
    });
  }

  protected toggleMode() {
    this.mode.set(this.mode() === 'login' ? 'signup' : 'login');
    this.error.set(null);
    this.info.set(null);
  }

  protected async google() {
    this.error.set(null);
    this.loading.set(true);
    const err = await this.auth.signInWithGoogle();
    if (err) {
      this.error.set(err);
      this.loading.set(false);
    }
  }

  async submit() {
    this.loading.set(true);
    this.error.set(null);
    this.info.set(null);
    const email = this.email.trim();
    if (this.mode() === 'signup') {
      const res = await this.auth.signUp(email, this.password);
      this.loading.set(false);
      if (res === 'confirm') this.info.set('Te enviamos un email para confirmar la cuenta. Abrilo y volvé a entrar.');
      else if (res) this.error.set(res);
      else this.router.navigateByUrl('/');
      return;
    }
    const err = await this.auth.signIn(email, this.password);
    this.loading.set(false);
    if (err) this.error.set(err);
    else this.router.navigateByUrl('/');
  }
}
