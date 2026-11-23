import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

/** data.title = título del toolbar; data.back = a dónde vuelve la flecha (si no hay, es una pestaña principal). */
export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/login/login').then((m) => m.Login) },
  {
    path: '',
    canActivate: [authGuard],
    children: [
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
        path: 'cuentas',
        loadComponent: () => import('./features/accounts/accounts-list').then((m) => m.AccountsList),
        data: { title: 'Cuentas', fab: true },
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
        path: 'categorias',
        loadComponent: () => import('./features/categories/categories-list').then((m) => m.CategoriesList),
        data: { title: 'Categorías' },
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
