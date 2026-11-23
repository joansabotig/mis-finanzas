import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DataService } from '../../core/data.service';
import { Category, CATEGORY_GROUPS, CategoryKind } from '../../core/models';

@Component({
  selector: 'app-categories-list',
  imports: [RouterLink, MatButtonModule, MatButtonToggleModule, MatIconModule, MatProgressBarModule],
  template: `
    @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
    <div class="page">
      <mat-button-toggle-group class="kind" [value]="kind()" (change)="kind.set($event.value)">
        <mat-button-toggle value="expense">Gastos</mat-button-toggle>
        <mat-button-toggle value="income">Ingresos</mat-button-toggle>
      </mat-button-toggle-group>

      @if (error()) { <p class="error">{{ error() }}</p> }

      <div class="rows">
        @for (c of visible(); track c.id) {
          <a class="row" [routerLink]="['/categorias', c.id]">
            <mat-icon [class.inactive]="!c.is_active">{{ c.icon || 'label' }}</mat-icon>
            <span class="grow" [class.inactive]="!c.is_active">
              <span class="main">{{ c.name }}</span>
              <span class="sub">{{ groupLabel(c) }}@if (!c.is_active) { · desactivada }</span>
            </span>
            <mat-icon class="muted">chevron_right</mat-icon>
          </a>
        } @empty {
          @if (!loading()) { <p class="empty">No hay categorías.</p> }
        }
      </div>

      <a mat-stroked-button class="new" routerLink="/categorias/nueva" [queryParams]="{ tipo: kind() }">
        <mat-icon>add</mat-icon> Nueva categoría
      </a>
    </div>
  `,
  styles: `
    .kind { width: 100%; margin-bottom: 16px; }
    .kind mat-button-toggle { flex: 1; }
    .new { width: 100%; margin-top: 24px; }
  `,
})
export class CategoriesList implements OnInit {
  private readonly data = inject(DataService);
  protected readonly kind = signal<CategoryKind>('expense');
  private readonly all = signal<Category[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly visible = computed(() =>
    this.all()
      .filter((c) => c.kind === this.kind())
      .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name)),
  );

  async ngOnInit() {
    try {
      this.all.set(await this.data.categories(true));
    } catch (e) {
      this.error.set('Error cargando categorías: ' + (e as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected groupLabel(c: Category) {
    return CATEGORY_GROUPS.find((g) => g.value === c.grp)?.label ?? 'Sin grupo';
  }
}
