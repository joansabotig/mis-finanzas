import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

/**
 * data.title = título del toolbar; data.back = a dónde vuelve la flecha
 * (sin back = pestaña principal con barra inferior); data.fab = muestra el botón "+".
 */
export const routes: Routes = [
  // ---- Públicas ----
  { path: 'login', loadComponent: () => import('./features/login/login').then((m) => m.Login) },
  {
    path: 'registro',
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
    data: { startMode: 'signup' },
  },
  {
    path: 'restablecer',
    loadComponent: () => import('./features/login/reset-password').then((m) => m.ResetPassword),
  },
  {
    path: 'verificar',
    loadComponent: () => import('./features/login/mfa-verify').then((m) => m.MfaVerify),
  },
  {
    path: 'privacidad',
    loadComponent: () => import('./features/legal/privacy').then((m) => m.Privacy),
    data: { title: 'Privacidad', back: '/mas' },
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      // ---- Pestañas ----
      {
        path: '',
        loadComponent: () => import('./features/home/home').then((m) => m.Home),
        data: { title: 'Mis Finanzas', fab: true },
      },
      {
        path: 'movimientos',
        loadComponent: () => import('./features/transactions/transactions-list').then((m) => m.TransactionsList),
        data: { title: 'Movimientos', fab: true },
      },
      {
        path: 'fijos',
        loadComponent: () => import('./features/recurring/recurring-list').then((m) => m.RecurringList),
        data: { title: 'Fijos del mes', fab: true },
      },
      {
        path: 'reportes',
        loadComponent: () => import('./features/reports/reports').then((m) => m.Reports),
        data: { title: 'Reportes' },
      },
      {
        path: 'mas',
        loadComponent: () => import('./features/more/more').then((m) => m.More),
        data: { title: 'Más' },
      },

      // ---- Pantallas internas ----
      {
        path: 'movimientos/nuevo',
        loadComponent: () => import('./features/transactions/transaction-form').then((m) => m.TransactionForm),
        data: { title: 'Nuevo movimiento', back: '/movimientos' },
      },
      {
        path: 'movimientos/:id',
        loadComponent: () => import('./features/transactions/transaction-form').then((m) => m.TransactionForm),
        data: { title: 'Editar movimiento', back: '/movimientos' },
      },
      {
        path: 'fijos/nuevo',
        loadComponent: () => import('./features/recurring/recurring-form').then((m) => m.RecurringForm),
        data: { title: 'Nuevo fijo', back: '/fijos' },
      },
      {
        path: 'fijos/:id',
        loadComponent: () => import('./features/recurring/recurring-form').then((m) => m.RecurringForm),
        data: { title: 'Editar fijo', back: '/fijos' },
      },
      {
        path: 'cuentas',
        loadComponent: () => import('./features/accounts/accounts-list').then((m) => m.AccountsList),
        data: { title: 'Cuentas y tarjetas', back: '/mas' },
      },
      {
        path: 'cuentas/nueva',
        loadComponent: () => import('./features/accounts/account-form').then((m) => m.AccountForm),
        data: { title: 'Nueva cuenta', back: '/cuentas' },
      },
      {
        path: 'cuentas/:id',
        loadComponent: () => import('./features/accounts/account-form').then((m) => m.AccountForm),
        data: { title: 'Editar cuenta', back: '/cuentas' },
      },
      {
        path: 'seguridad',
        loadComponent: () => import('./features/security/security').then((m) => m.Security),
        data: { title: 'Seguridad y datos', back: '/mas' },
      },
      {
        path: 'categorias',
        loadComponent: () => import('./features/categories/categories-list').then((m) => m.CategoriesList),
        data: { title: 'Categorías', back: '/mas' },
      },
      {
        path: 'categorias/nueva',
        loadComponent: () => import('./features/categories/category-form').then((m) => m.CategoryForm),
        data: { title: 'Nueva categoría', back: '/categorias' },
      },
      {
        path: 'categorias/:id',
        loadComponent: () => import('./features/categories/category-form').then((m) => m.CategoryForm),
        data: { title: 'Editar categoría', back: '/categorias' },
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
