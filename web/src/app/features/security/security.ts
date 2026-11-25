import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth.service';
import { BackupFile, BackupSummary, backupFileName, buildBackup, inspectBackup } from '../../core/backup';
import { DataService } from '../../core/data.service';
import { RateService } from '../../core/rate.service';

@Component({
  selector: 'app-security',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule],
  template: `
    @if (busy()) { <mat-progress-bar mode="indeterminate" /> }
    <div class="page">
      <!-- ================= Verificación en dos pasos ================= -->
      <section>
        <h2><mat-icon>verified_user</mat-icon> Verificación en dos pasos</h2>
        @if (factorId()) {
          <p class="ok"><mat-icon>check_circle</mat-icon> Activada. Al iniciar sesión te vamos a pedir el código de tu app de autenticación.</p>
          @if (confirmDisable()) {
            <p class="muted small">¿Seguro? Tu cuenta va a quedar protegida solo con la contraseña.</p>
            <div class="row-actions">
              <button mat-stroked-button (click)="confirmDisable.set(false)">Cancelar</button>
              <button mat-flat-button class="danger" (click)="disableMfa()" [disabled]="busy()">Desactivar</button>
            </div>
          } @else {
            <button mat-stroked-button (click)="confirmDisable.set(true)">Desactivar</button>
          }
        } @else if (enrolling(); as e) {
          <ol class="steps">
            <li>Instalá una app de autenticación: <b>Google Authenticator</b>, <b>Microsoft Authenticator</b> o <b>Authy</b>.</li>
            <li>En la app, tocá <b>+</b> y escaneá este código:</li>
          </ol>
          <img class="qr" [src]="e.qr" alt="Código QR para la app de autenticación" width="200" height="200" />
          <p class="muted small center">¿No podés escanear? Cargá esta clave a mano:<br /><code class="secret">{{ e.secret }}</code></p>
          <ol class="steps" start="3"><li>Escribí el código de 6 dígitos que muestra la app:</li></ol>
          <form class="inline" (ngSubmit)="confirmMfa()">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Código</mat-label>
              <input matInput name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" [(ngModel)]="code" />
            </mat-form-field>
            <button mat-flat-button type="submit" [disabled]="busy()">Activar</button>
          </form>
          <button mat-button (click)="enrolling.set(null)">Cancelar</button>
        } @else {
          <p class="muted">Además de tu contraseña, te pedimos un código que cambia cada 30 segundos en tu celular. Si alguien consigue tu contraseña, igual no puede entrar.</p>
          <button mat-flat-button (click)="startMfa()" [disabled]="busy()"><mat-icon>add_moderator</mat-icon> Activar</button>
        }
        @if (mfaError()) { <p class="error">{{ mfaError() }}</p> }
      </section>

      <!-- ================= Backup ================= -->
      <section>
        <h2><mat-icon>backup</mat-icon> Copia de seguridad</h2>
        <p class="muted">Descargá un archivo con todas tus cuentas, movimientos, categorías y fijos. Guardalo en un lugar seguro: con él podés recuperar todo, incluso en una cuenta nueva.</p>
        <button mat-flat-button (click)="downloadBackup()" [disabled]="busy()"><mat-icon>download</mat-icon> Descargar backup</button>

        <h3>Restaurar un backup</h3>
        <p class="muted small">Reemplaza <b>todos</b> tus datos actuales por los del archivo. Si algo falla, no se cambia nada.</p>
        <input #file type="file" accept="application/json,.json" hidden (change)="pickBackup(file.files?.[0]); file.value = ''" />
        <button mat-stroked-button (click)="file.click()" [disabled]="busy()"><mat-icon>upload_file</mat-icon> Elegir archivo…</button>
        @if (restoreSummary(); as s) {
          <div class="confirm">
            <p>Backup del <b>{{ s.exportedAt.slice(0, 10) }}</b>: {{ s.accounts }} cuentas, {{ s.categories }} categorías, {{ s.recurring }} fijos y {{ s.transactions }} movimientos.</p>
            <p class="small">Para confirmar escribí <b>RESTAURAR</b>:</p>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <input matInput [(ngModel)]="restoreWord" autocomplete="off" />
            </mat-form-field>
            <div class="row-actions">
              <button mat-stroked-button (click)="cancelRestore()">Cancelar</button>
              <button mat-flat-button class="danger" (click)="restore()" [disabled]="busy() || restoreWord.trim().toUpperCase() !== 'RESTAURAR'">Restaurar</button>
            </div>
          </div>
        }
        @if (backupError()) { <p class="error">{{ backupError() }}</p> }
      </section>

      <!-- ================= Eliminar cuenta ================= -->
      <section class="danger-zone">
        <h2><mat-icon>delete_forever</mat-icon> Eliminar mi cuenta</h2>
        <p class="muted">Borra tu usuario y <b>todos</b> tus datos de forma permanente. No se puede deshacer: descargá un backup antes si querés conservarlos.</p>
        @if (confirmDelete()) {
          <p class="small">Para confirmar escribí <b>ELIMINAR</b>:</p>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <input matInput [(ngModel)]="deleteWord" autocomplete="off" />
          </mat-form-field>
          <div class="row-actions">
            <button mat-stroked-button (click)="confirmDelete.set(false)">Cancelar</button>
            <button mat-flat-button class="danger" (click)="deleteAccount()" [disabled]="busy() || deleteWord.trim().toUpperCase() !== 'ELIMINAR'">Eliminar definitivamente</button>
          </div>
        } @else {
          <button mat-stroked-button class="danger-outline" (click)="confirmDelete.set(true)">Eliminar mi cuenta…</button>
        }
        @if (deleteError()) { <p class="error">{{ deleteError() }}</p> }
      </section>
    </div>
  `,
  styles: `
    section { padding: 8px 0 20px; border-bottom: 1px solid var(--mat-sys-outline-variant); }
    section:last-child { border-bottom: 0; }
    h2 { display: flex; align-items: center; gap: 8px; font: var(--mat-sys-title-medium); margin: 12px 0 8px; }
    h3 { font: var(--mat-sys-title-small); margin: 20px 0 4px; }
    p { margin: 4px 0 12px; }
    .small { font: var(--mat-sys-body-small); }
    .center { text-align: center; }
    .ok { display: flex; gap: 8px; align-items: flex-start; color: #1b873f; }
    .steps { padding-left: 20px; margin: 4px 0; }
    .qr { display: block; margin: 8px auto; background: #fff; border-radius: 8px; padding: 8px; }
    .secret { word-break: break-all; user-select: all; font-size: 13px; }
    .inline { display: flex; gap: 8px; align-items: center; }
    .inline mat-form-field { flex: 1; }
    .row-actions { display: flex; gap: 8px; margin-top: 8px; }
    .confirm { margin-top: 12px; padding: 12px; border-radius: 12px; background: var(--mat-sys-surface-container); }
    .danger { background: var(--mat-sys-error) !important; color: var(--mat-sys-on-error) !important; }
    .danger-outline { color: var(--mat-sys-error); }
    .error { color: var(--mat-sys-error); }
  `,
})
export class Security implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly data = inject(DataService);
  private readonly rates = inject(RateService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  protected readonly busy = signal(false);
  protected readonly factorId = signal<string | null>(null);
  protected readonly enrolling = signal<{ factorId: string; qr: string; secret: string } | null>(null);
  protected readonly confirmDisable = signal(false);
  protected readonly mfaError = signal<string | null>(null);
  protected code = '';

  protected readonly restoreSummary = signal<BackupSummary | null>(null);
  private pendingBackup: BackupFile | null = null;
  protected restoreWord = '';
  protected readonly backupError = signal<string | null>(null);

  protected readonly confirmDelete = signal(false);
  protected deleteWord = '';
  protected readonly deleteError = signal<string | null>(null);

  async ngOnInit() {
    try {
      this.factorId.set((await this.auth.totpFactors())[0]?.id ?? null);
    } catch (e) {
      this.mfaError.set((e as Error).message);
    }
  }

  // ---------- Verificación en dos pasos ----------
  protected async startMfa() {
    this.mfaError.set(null);
    this.busy.set(true);
    try {
      this.enrolling.set(await this.auth.enrollTotp());
      this.code = '';
    } catch (e) {
      this.mfaError.set('No se pudo empezar: ' + (e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async confirmMfa() {
    const e = this.enrolling();
    if (!e) return;
    if (!/^\d{6}$/.test(this.code.replace(/\s/g, ''))) return this.mfaError.set('El código tiene 6 dígitos.');
    this.busy.set(true);
    const err = await this.auth.verifyTotp(e.factorId, this.code);
    this.busy.set(false);
    if (err) return this.mfaError.set(err);
    this.mfaError.set(null);
    this.enrolling.set(null);
    this.factorId.set(e.factorId);
    this.snack.open('Verificación en dos pasos activada', undefined, { duration: 3000 });
  }

  protected async disableMfa() {
    const id = this.factorId();
    if (!id) return;
    this.busy.set(true);
    const err = await this.auth.disableTotp(id);
    this.busy.set(false);
    this.confirmDisable.set(false);
    if (err) return this.mfaError.set(err);
    this.factorId.set(null);
    this.snack.open('Verificación en dos pasos desactivada', undefined, { duration: 3000 });
  }

  // ---------- Backup ----------
  protected async downloadBackup() {
    this.backupError.set(null);
    this.busy.set(true);
    try {
      const { tables, settings } = await this.data.backupTables();
      const backup = buildBackup(tables, settings);
      const blob = new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = backupFileName();
      a.click();
      URL.revokeObjectURL(a.href);
      this.snack.open(`Backup descargado: ${backup.data.transactions.length} movimientos`, undefined, { duration: 3000 });
    } catch (e) {
      this.backupError.set('No se pudo generar el backup: ' + (e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async pickBackup(file: File | undefined) {
    this.backupError.set(null);
    this.restoreSummary.set(null);
    if (!file) return;
    try {
      const result = inspectBackup(JSON.parse(await file.text()));
      if ('error' in result) return this.backupError.set(result.error);
      this.pendingBackup = result.backup;
      this.restoreWord = '';
      this.restoreSummary.set(result.summary);
    } catch {
      this.backupError.set('No se pudo leer el archivo: no es un JSON válido.');
    }
  }

  protected cancelRestore() {
    this.pendingBackup = null;
    this.restoreSummary.set(null);
  }

  protected async restore() {
    if (!this.pendingBackup) return;
    this.busy.set(true);
    try {
      const r = await this.data.restoreBackup(this.pendingBackup);
      this.rates.invalidate();
      this.cancelRestore();
      this.snack.open(`Backup restaurado: ${r.accounts} cuentas y ${r.transactions} movimientos`, 'OK', { duration: 5000 });
    } catch (e) {
      const msg = (e as Error).message;
      this.backupError.set(
        /restore_my_data/.test(msg)
          ? 'Falta aplicar la migración 4 en Supabase (ver SETUP.md).'
          : /duplicate key/.test(msg)
            ? 'Este backup pertenece a otra cuenta que todavía existe: no se puede restaurar acá.'
            : 'No se pudo restaurar (no se cambió nada): ' + msg,
      );
    } finally {
      this.busy.set(false);
    }
  }

  // ---------- Eliminar cuenta ----------
  protected async deleteAccount() {
    this.deleteError.set(null);
    this.busy.set(true);
    try {
      await this.data.deleteMyAccount();
      await this.auth.signOut();
      this.snack.open('Tu cuenta y todos tus datos fueron eliminados.', 'OK', { duration: 6000 });
      this.router.navigateByUrl('/login');
    } catch (e) {
      const msg = (e as Error).message;
      this.deleteError.set(
        /delete_my_account/.test(msg) ? 'Falta aplicar la migración 4 en Supabase (ver SETUP.md).' : 'No se pudo eliminar: ' + msg,
      );
    } finally {
      this.busy.set(false);
    }
  }
}
