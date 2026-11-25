import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth.service';
import { MIN_PASSWORD } from './login';

/** Destino del link "olvidé mi contraseña": la sesión llega en la URL y acá se elige la clave nueva. */
@Component({
  selector: 'app-reset-password',
  imports: [FormsModule, RouterLink, MatButtonModule, MatCardModule, MatFormFieldModule, MatInputModule],
  template: `
    <mat-card class="box" appearance="outlined">
      <img class="logo" src="logo.svg" alt="" width="56" height="56" />
      <h1>Nueva contraseña</h1>
      @if (checking()) {
        <p class="muted">Verificando el link…</p>
      } @else if (!valid()) {
        <p class="error">El link no es válido o ya venció. Pedí uno nuevo desde "¿Olvidaste tu contraseña?".</p>
        <a mat-flat-button routerLink="/login">Ir a iniciar sesión</a>
      } @else {
        <form (ngSubmit)="save()">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Contraseña nueva</mat-label>
            <input matInput type="password" name="p1" autocomplete="new-password" [(ngModel)]="p1" required />
            <mat-hint>Mínimo {{ min }} caracteres.</mat-hint>
          </mat-form-field>
          <mat-form-field appearance="outline" class="second">
            <mat-label>Repetila</mat-label>
            <input matInput type="password" name="p2" autocomplete="new-password" [(ngModel)]="p2" required />
          </mat-form-field>
          @if (error()) { <p class="error">{{ error() }}</p> }
          <button mat-flat-button type="submit" [disabled]="saving()">Guardar contraseña</button>
        </form>
      }
    </mat-card>
  `,
  styles: `
    .box { max-width: 400px; margin: 10vh auto 0; width: calc(100% - 32px); box-sizing: border-box; padding: 16px; text-align: center; }
    .logo { display: block; margin: 4px auto 0; border-radius: 14px; }
    h1 { font: var(--mat-sys-headline-small); margin: 8px 0 16px; }
    form { display: flex; flex-direction: column; gap: 4px; text-align: left; }
    .second { margin-top: 12px; }
    .error { color: var(--mat-sys-error); }
  `,
})
export class ResetPassword implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  protected readonly min = MIN_PASSWORD;
  protected p1 = '';
  protected p2 = '';
  protected readonly checking = signal(true);
  protected readonly valid = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  async ngOnInit() {
    await this.auth.ready;
    // El intercambio del código del link puede terminar un instante después.
    for (let i = 0; i < 10 && !this.auth.session(); i++) await new Promise((r) => setTimeout(r, 300));
    this.valid.set(!!this.auth.session());
    this.checking.set(false);
  }

  protected async save() {
    this.error.set(null);
    if (this.p1.length < MIN_PASSWORD) return this.error.set(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
    if (this.p1 !== this.p2) return this.error.set('Las contraseñas no coinciden.');
    this.saving.set(true);
    const err = await this.auth.updatePassword(this.p1);
    this.saving.set(false);
    if (err) return this.error.set(err);
    this.snack.open('Contraseña actualizada', undefined, { duration: 2500 });
    this.router.navigateByUrl('/');
  }
}
