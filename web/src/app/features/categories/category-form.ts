import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DataService } from '../../core/data.service';
import { CATEGORY_GROUPS, CategoryGroup, CategoryKind } from '../../core/models';
import { injectGoBack } from '../../core/nav';

/** Íconos de Material Icons sugeridos para categorías. */
const ICONS = [
  'shopping_cart', 'restaurant', 'local_gas_station', 'directions_car', 'two_wheeler', 'home', 'bolt',
  'water_drop', 'wifi', 'phone_iphone', 'subscriptions', 'shield', 'account_balance', 'receipt_long',
  'local_hospital', 'medication', 'school', 'pets', 'sports_volleyball', 'phishing', 'fitness_center',
  'flight', 'celebration', 'card_giftcard', 'checkroom', 'shopping_bag', 'build', 'savings',
  'payments', 'add_card', 'trending_up', 'work', 'more_horiz',
];

@Component({
  selector: 'app-category-form',
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  template: `
    @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
    <form class="page form" (ngSubmit)="save()">
      <mat-button-toggle-group name="kind" class="kind" [(ngModel)]="kind" [disabled]="!!id()">
        <mat-button-toggle value="expense">Gasto</mat-button-toggle>
        <mat-button-toggle value="income">Ingreso</mat-button-toggle>
      </mat-button-toggle-group>

      <mat-form-field appearance="outline">
        <mat-label>Nombre</mat-label>
        <input matInput name="name" autocomplete="off" [(ngModel)]="name" required />
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Grupo</mat-label>
        <mat-select name="grp" [(ngModel)]="grp">
          <mat-option [value]="null">Sin grupo</mat-option>
          @for (g of groups; track g.value) { <mat-option [value]="g.value">{{ g.label }}</mat-option> }
        </mat-select>
        <mat-hint>Se usa para el resumen del mes (fijos, variables, casa, inversión).</mat-hint>
      </mat-form-field>

      <div class="field-label">Ícono</div>
      <div class="icons">
        @for (i of icons; track i) {
          <button type="button" mat-icon-button [class.selected]="icon() === i" (click)="icon.set(i)" [attr.aria-label]="i">
            <mat-icon>{{ i }}</mat-icon>
          </button>
        }
      </div>

      <mat-slide-toggle name="active" [(ngModel)]="isActive">Categoría activa</mat-slide-toggle>

      @if (error()) { <p class="error">{{ error() }}</p> }
      <div class="actions">
        <button mat-flat-button type="submit" [disabled]="saving() || loading()">Guardar</button>
      </div>
    </form>
  `,
  styles: `
    .kind { width: 100%; margin-bottom: 16px; }
    .kind mat-button-toggle { flex: 1; }
    .icons { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 16px; }
    .icons .selected { background: var(--mat-sys-primary-container); color: var(--mat-sys-on-primary-container); }
    mat-slide-toggle { margin: 4px 0; }
  `,
})
export class CategoryForm implements OnInit {
  readonly id = input<string>();
  /** ?tipo=income al crear desde la pestaña Ingresos */
  readonly tipo = input<string>();

  private readonly data = inject(DataService);
  private readonly snack = inject(MatSnackBar);
  private readonly goBack = injectGoBack();
  protected readonly groups = CATEGORY_GROUPS;
  protected readonly icons = ICONS;

  protected readonly kind = signal<CategoryKind>('expense');
  protected readonly name = signal('');
  protected readonly grp = signal<CategoryGroup | null>('variable');
  protected readonly icon = signal<string>('more_horiz');
  protected readonly isActive = signal(true);
  private color: string | null = null;

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  async ngOnInit() {
    const id = this.id();
    if (!id) {
      if (this.tipo() === 'income') {
        this.kind.set('income');
        this.grp.set(null);
      }
      return;
    }
    this.loading.set(true);
    try {
      const c = await this.data.category(id);
      this.kind.set(c.kind);
      this.name.set(c.name);
      this.grp.set(c.grp);
      this.icon.set(c.icon ?? 'more_horiz');
      this.isActive.set(c.is_active);
      this.color = c.color;
    } catch (e) {
      this.error.set('Error cargando la categoría: ' + (e as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected async save() {
    const name = this.name().trim();
    if (!name) return this.error.set('Poné un nombre.');
    this.error.set(null);
    this.saving.set(true);
    try {
      await this.data.saveCategory(this.id(), {
        name,
        kind: this.kind(),
        grp: this.grp(),
        icon: this.icon(),
        color: this.color,
        is_active: this.isActive(),
      });
      this.snack.open('Categoría guardada', undefined, { duration: 2000 });
      this.goBack('/categorias');
    } catch (e) {
      const msg = (e as Error).message;
      this.error.set(msg.includes('duplicate') ? 'Ya existe una categoría con ese nombre.' : 'No se pudo guardar: ' + msg);
    } finally {
      this.saving.set(false);
    }
  }
}
