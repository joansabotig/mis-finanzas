import { Component, computed, effect, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';

type Mode = 'login' | 'signup' | 'reset';

export const MIN_PASSWORD = 8;

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <mat-card class="login" appearance="outlined">
      <img class="logo" src="logo.svg" alt="" width="72" height="72" />
      <div class="head">
        <h1>{{ title() }}</h1>
        <p class="muted">{{ subtitle() }}</p>
      </div>

      <mat-card-content>
        @if (!configured) {
          <p class="error">Falta configurar Supabase en <code>src/environments/environment.ts</code>.</p>
        }

        @if (sent()) {
          <div class="sent">
            <mat-icon>mark_email_read</mat-icon>
            <p>{{ sent() }}</p>
            <p class="muted small">¿No llegó? Revisá la carpeta de spam o promociones.</p>
            <button mat-stroked-button type="button" (click)="setMode('login')">Volver a iniciar sesión</button>
          </div>
        } @else {
          @if (googleLogin && mode() !== 'reset') {
            <button mat-stroked-button class="google" type="button" (click)="google()" [disabled]="loading() || !configured">
              <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
                <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.9-6.1z" />
                <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
              </svg>
              {{ mode() === 'signup' ? 'Registrarme con Google' : 'Continuar con Google' }}
            </button>
            <div class="or"><span>o con tu email</span></div>
          }

          <form (ngSubmit)="submit()">
            <mat-form-field appearance="outline">
              <mat-label>Email</mat-label>
              <input matInput type="email" name="email" autocomplete="username" [(ngModel)]="email" required />
            </mat-form-field>

            @if (mode() !== 'reset') {
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Contraseña</mat-label>
                <input
                  matInput
                  [type]="showPassword() ? 'text' : 'password'"
                  name="password"
                  [attr.autocomplete]="mode() === 'signup' ? 'new-password' : 'current-password'"
                  [(ngModel)]="password"
                  required
                />
                <button matSuffix mat-icon-button type="button" [attr.aria-label]="showPassword() ? 'Ocultar contraseña' : 'Mostrar contraseña'" (click)="showPassword.set(!showPassword())">
                  <mat-icon>{{ showPassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
                </button>
                @if (mode() === 'signup') { <mat-hint>Mínimo {{ minPassword }} caracteres.</mat-hint> }
              </mat-form-field>
            }

            @if (mode() === 'signup') {
              <mat-form-field appearance="outline" class="confirm">
                <mat-label>Repetí la contraseña</mat-label>
                <input matInput [type]="showPassword() ? 'text' : 'password'" name="password2" autocomplete="new-password" [(ngModel)]="password2" required />
              </mat-form-field>
            }

            @if (mode() === 'login') {
              <button mat-button type="button" class="forgot" (click)="setMode('reset')">¿Olvidaste tu contraseña?</button>
            }

            @if (error()) { <p class="error">{{ error() }}</p> }

            <button mat-flat-button type="submit" [disabled]="loading() || !configured">{{ submitLabel() }}</button>

            @if (mode() === 'signup') {
              <p class="muted small terms">Al crear tu cuenta aceptás la <a routerLink="/privacidad">política de privacidad</a>.</p>
            }
          </form>

          @if (mode() === 'reset') {
            <button mat-button class="switch" type="button" (click)="setMode('login')">Volver a iniciar sesión</button>
          } @else if (allowSignup) {
            <button mat-button class="switch" type="button" (click)="setMode(mode() === 'signup' ? 'login' : 'signup')">
              {{ mode() === 'signup' ? '¿Ya tenés cuenta? Iniciá sesión' : '¿No tenés cuenta? Registrate gratis' }}
            </button>
          }
        }
      </mat-card-content>
    </mat-card>
    <p class="footer muted small"><a routerLink="/privacidad">Privacidad</a></p>
  `,
  styles: `
    .login { max-width: 400px; margin: 8vh auto 0; width: calc(100% - 32px); box-sizing: border-box; padding-bottom: 8px; }
    .logo { display: block; margin: 20px auto 0; border-radius: 18px; }
    .head { text-align: center; padding: 8px 16px 0; }
    .head h1 { margin: 8px 0 4px; font: var(--mat-sys-headline-small); }
    .head p { margin: 0; }
    form { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
    .confirm { margin-top: 12px; }
    .google { width: 100%; margin-top: 16px; }
    .google svg { margin-right: 8px; vertical-align: middle; }
    .or { display: flex; align-items: center; gap: 8px; margin: 16px 0 4px; color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-small); }
    .or::before, .or::after { content: ''; flex: 1; border-top: 1px solid var(--mat-sys-outline-variant); }
    .forgot { align-self: flex-end; margin: -4px 0 4px; }
    .switch { width: 100%; margin-top: 8px; }
    .terms { text-align: center; margin: 8px 0 0; }
    .small { font: var(--mat-sys-body-small); }
    .sent { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 4px; padding: 16px 0; }
    .sent mat-icon { font-size: 48px; width: 48px; height: 48px; color: var(--mat-sys-primary); }
    .footer { text-align: center; margin: 16px; }
    .error { color: var(--mat-sys-error); }
  `,
})
export class Login implements OnInit {
  /** /registro abre directo en modo "crear cuenta" (data de la ruta). */
  readonly startMode = input<Mode>();

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly configured = inject(SupabaseService).isConfigured;
  protected readonly googleLogin = environment.googleLogin;
  protected readonly allowSignup = environment.allowSignup;
  protected readonly minPassword = MIN_PASSWORD;
  protected email = '';
  protected password = '';
  protected password2 = '';
  protected readonly mode = signal<Mode>('login');
  protected readonly showPassword = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly sent = signal<string | null>(null);

  protected readonly title = computed(
    () => ({ login: 'Mis Finanzas', signup: 'Creá tu cuenta', reset: 'Recuperar contraseña' })[this.mode()],
  );
  protected readonly subtitle = computed(
    () =>
      ({
        login: 'Tus cuentas, gastos y tarjetas en un solo lugar',
        signup: 'Gratis. Tus datos son privados: solo vos los ves.',
        reset: 'Te enviamos un link para crear una contraseña nueva.',
      })[this.mode()],
  );
  protected readonly submitLabel = computed(
    () => ({ login: 'Ingresar', signup: 'Crear cuenta', reset: 'Enviar link' })[this.mode()],
  );

  constructor() {
    // Al volver de Google o de confirmar el email, la sesión llega sola: entramos directo.
    effect(() => {
      if (this.auth.session() && !this.auth.recovering()) this.router.navigateByUrl('/');
    });
  }

  ngOnInit() {
    if (this.startMode() === 'signup' && this.allowSignup) this.mode.set('signup');
  }

  protected setMode(mode: Mode) {
    this.mode.set(mode);
    this.error.set(null);
    this.sent.set(null);
    this.password2 = '';
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
    const email = this.email.trim();
    this.error.set(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return this.error.set('Escribí un email válido.');

    if (this.mode() === 'reset') {
      this.loading.set(true);
      const err = await this.auth.sendPasswordReset(email);
      this.loading.set(false);
      if (err) this.error.set(err);
      else this.sent.set(`Si existe una cuenta con ${email}, te llega un email con el link para crear una contraseña nueva.`);
      return;
    }

    if (!this.password) return this.error.set('Escribí tu contraseña.');

    if (this.mode() === 'signup') {
      if (this.password.length < MIN_PASSWORD) return this.error.set(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
      if (this.password !== this.password2) return this.error.set('Las contraseñas no coinciden.');
      this.loading.set(true);
      const res = await this.auth.signUp(email, this.password);
      this.loading.set(false);
      if (res === 'confirm') this.sent.set(`¡Listo! Te enviamos un email a ${email}. Abrí el link para activar tu cuenta.`);
      else if (res) this.error.set(res);
      else this.router.navigateByUrl('/');
      return;
    }

    this.loading.set(true);
    const err = await this.auth.signIn(email, this.password);
    this.loading.set(false);
    if (err) this.error.set(err);
    else this.router.navigateByUrl('/');
  }
}
