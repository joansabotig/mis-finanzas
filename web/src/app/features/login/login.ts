import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatInputModule],
  template: `
    <mat-card class="login" appearance="outlined">
      <mat-card-header><mat-card-title>Mis Finanzas</mat-card-title></mat-card-header>
      <mat-card-content>
        @if (!configured) {
          <p class="error">Falta configurar Supabase en <code>src/environments/environment.ts</code>.</p>
        }
        <form (ngSubmit)="submit()">
          <mat-form-field appearance="outline">
            <mat-label>Email</mat-label>
            <input matInput type="email" name="email" autocomplete="username" [(ngModel)]="email" required />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Contraseña</mat-label>
            <input matInput type="password" name="password" autocomplete="current-password" [(ngModel)]="password" required />
          </mat-form-field>
          @if (error()) { <p class="error">{{ error() }}</p> }
          <button mat-flat-button type="submit" [disabled]="loading() || !configured">Ingresar</button>
        </form>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .login { max-width: 380px; margin: 15vh auto 0; width: calc(100% - 32px); box-sizing: border-box; }
    form { display: flex; flex-direction: column; gap: 4px; margin-top: 16px; }
    .error { color: var(--mat-sys-error); }
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly configured = inject(SupabaseService).isConfigured;
  protected email = '';
  protected password = '';
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  async submit() {
    this.loading.set(true);
    this.error.set(null);
    const err = await this.auth.signIn(this.email.trim(), this.password);
    this.loading.set(false);
    if (err) this.error.set('No se pudo ingresar: ' + err);
    else this.router.navigateByUrl('/');
  }
}
