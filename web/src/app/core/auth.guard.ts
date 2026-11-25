import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  // inject() solo funciona antes del primer await.
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  if (!auth.session()) return router.createUrlTree(['/login']);
  // Con verificación en dos pasos activada, falta el código de esta sesión.
  if (await auth.needsSecondFactor()) return router.createUrlTree(['/verificar']);
  return true;
};
