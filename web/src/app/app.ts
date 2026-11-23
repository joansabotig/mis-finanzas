import { Component, inject, signal } from '@angular/core';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { filter } from 'rxjs';
import { AuthService } from './core/auth.service';
import { injectGoBack } from './core/nav';

interface RouteInfo {
  title: string;
  back?: string;
  fab?: boolean;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatToolbarModule, MatButtonModule, MatIconModule, MatSnackBarModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly goBack = injectGoBack();
  protected readonly route = signal<RouteInfo>({ title: 'Mis Finanzas' });

  protected readonly tabs = [
    { path: '/', icon: 'home', label: 'Inicio', exact: true },
    { path: '/movimientos', icon: 'receipt_long', label: 'Movimientos', exact: false },
    { path: '/cuentas', icon: 'account_balance_wallet', label: 'Cuentas', exact: false },
    { path: '/categorias', icon: 'category', label: 'Categorías', exact: false },
  ];

  constructor() {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      let snap: ActivatedRouteSnapshot = this.router.routerState.snapshot.root;
      while (snap.firstChild) snap = snap.firstChild;
      this.route.set({ title: 'Mis Finanzas', ...(snap.data as Partial<RouteInfo>) });
    });

    // Cuando Cloudflare publica una versión nueva, el service worker la baja y avisamos.
    const sw = inject(SwUpdate);
    if (sw.isEnabled) {
      sw.versionUpdates.pipe(filter((e) => e.type === 'VERSION_READY')).subscribe(() => {
        this.snack
          .open('Hay una versión nueva de la app', 'Actualizar')
          .onAction()
          .subscribe(() => document.location.reload());
      });
    }
  }

  protected back() {
    this.goBack(this.route().back ?? '/');
  }

  protected add() {
    // Desde la lista filtrada por una cuenta, el movimiento nuevo arranca con esa cuenta.
    const cuenta = this.router.routerState.snapshot.root.queryParamMap.get('cuenta');
    this.router.navigate(['/movimientos/nuevo'], { queryParams: cuenta ? { cuenta } : {} });
  }

  protected async logout() {
    await this.auth.signOut();
    this.router.navigateByUrl('/login');
  }
}
