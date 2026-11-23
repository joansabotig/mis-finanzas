import { Location } from '@angular/common';
import { inject } from '@angular/core';
import { Router } from '@angular/router';

/**
 * Devuelve una función que vuelve a la pantalla anterior de la app;
 * si se entró directo por URL (no hay historial propio), navega a `fallback`.
 * Llamar en el constructor o en un inicializador de campo.
 */
export function injectGoBack() {
  const location = inject(Location);
  const router = inject(Router);
  return (fallback = '/') => {
    const navigationId = (history.state as { navigationId?: number } | null)?.navigationId ?? 1;
    if (navigationId > 1) location.back();
    else router.navigateByUrl(fallback);
  };
}
