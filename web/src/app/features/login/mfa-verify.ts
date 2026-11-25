import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../core/auth.service';

/** Segundo paso del login: código de 6 dígitos de la app de autenticación. */
@Component({
  selector: 'app-mfa-verify',
  imports: [FormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatInputModule],
  template: `
    <mat-card class="box" appearance="outlined">
      <img class="logo" src="logo.svg" alt="" width="56" height="56" />
      <h1>Verificación en dos pasos</h1>
      <p class="muted">Abrí tu app de autenticación (Google Authenticator, Authy…) y escribí el código de <b>Mis Finanzas</b>.</p>
      <form (ngSubmit)="verify()">
        <mat-form-field appearance="outline" class="code">
          <mat-label>Código de 6 dígitos</mat-label>
          <input matInput name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" [(ngModel)]="code" required />
        </mat-form-field>
        @if (error()) { <p class="error">{{ error() }}</p> }
        <button mat-flat-button type="submit" [disabled]="loading()">Verificar</button>
      </form>
      <button mat-button class="other" (click)="logout()">Usar otra cuenta</button>
      <p class="muted small">¿Perdiste el acceso a tu app de autenticación? Escribinos desde el email de tu cuenta para recuperarla.</p>
    </mat-card>
  `,
  styles: `
    .box { max-width: 400px; margin: 10vh auto 0; width: calc(100% - 32px); box-sizing: border-box; padding: 16px; text-align: center; }
    .logo { display: block; margin: 4px auto 0; border-radius: 14px; }
    h1 { font: var(--mat-sys-headline-small); margin: 8px 0; }
    form { display: flex; flex-direction: column; gap: 4px; margin-top: 12px; }
    .code input { font-size: 24px; letter-spacing: 6px; text-align: center; }
    .other { margin-top: 8px; }
    .small { font: var(--mat-sys-body-small); }
    .error { color: var(--mat-sys-error); }
  `,
})
export class MfaVerify implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected code = '';
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  private factorId: string | null = null;

  async ngOnInit() {
    await this.auth.ready;
    if (!this.auth.session()) return void this.router.navigateByUrl('/login');
    if (!(await this.auth.needsSecondFactor())) return void this.router.navigateByUrl('/');
    this.factorId = (await this.auth.totpFactors())[0]?.id ?? null;
  }

  protected async verify() {
    const code = this.code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(code)) return this.error.set('El código tiene 6 dígitos.');
    if (!this.factorId) return this.error.set('No encontramos tu verificación en dos pasos. Volvé a iniciar sesión.');
    this.loading.set(true);
    this.error.set(null);
    const err = await this.auth.verifyTotp(this.factorId, code);
    this.loading.set(false);
    if (err) {
      this.error.set(err);
      this.code = '';
      return;
    }
    this.router.navigateByUrl('/');
  }

  protected async logout() {
    await this.auth.signOut();
    this.router.navigateByUrl('/login');
  }
}
