import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';

/** Política de privacidad (pública). Google la exige para el login con Google. */
@Component({
  selector: 'app-privacy',
  imports: [RouterLink, MatButtonModule],
  template: `
    <article class="page">
      @if (!auth.session()) { <a mat-button routerLink="/login">← Volver</a> }
      <h1>Política de privacidad</h1>
      <p class="muted">Última actualización: {{ updated }}</p>

      <h2>Qué es Mis Finanzas</h2>
      <p>Una aplicación para registrar tus cuentas, gastos, ingresos, tarjetas y gastos fijos. Es gratuita y la usás desde el navegador o instalada en tu celular.</p>

      <h2>Qué datos guardamos</h2>
      <ul>
        <li><b>Datos de tu cuenta:</b> email y, si entrás con Google, tu nombre y foto de perfil que Google comparte al iniciar sesión.</li>
        <li><b>Lo que cargás vos:</b> cuentas, saldos, movimientos, categorías, tarjetas y gastos fijos.</li>
        <li>No pedimos ni guardamos claves de bancos, números de tarjeta ni documentos.</li>
      </ul>

      <h2>Para qué los usamos</h2>
      <p>Solo para mostrarte tu información y que la app funcione. <b>No vendemos ni compartimos tus datos</b> con terceros, no mostramos publicidad y no los usamos para nada más.</p>

      <h2>Quién puede verlos</h2>
      <p>Solo vos. Cada registro está asociado a tu usuario y la base de datos aplica reglas de seguridad por fila: ningún otro usuario puede leer ni modificar tus datos.</p>

      <h2>Dónde se guardan</h2>
      <p>En <a href="https://supabase.com" target="_blank" rel="noopener">Supabase</a> (base de datos PostgreSQL en servidores de São Paulo, Brasil). La app se publica en Cloudflare. La cotización del dólar se consulta a dolarapi.com sin enviar datos tuyos.</p>

      <h2>Datos en tu dispositivo</h2>
      <p>El navegador guarda tu sesión iniciada y algunas preferencias (por ejemplo, la última cuenta que usaste). No usamos cookies de publicidad ni de seguimiento.</p>

      <h2>Tus derechos</h2>
      <p>
        Podés descargar todos tus movimientos desde <b>Más → Exportar movimientos (CSV)</b> y pedir que borremos tu cuenta y todos tus datos
        @if (contact) { escribiendo a <a [href]="'mailto:' + contact">{{ contact }}</a>. } @else { desde la app. }
        Según la Ley 25.326 de Protección de Datos Personales, tenés derecho a acceder, rectificar y suprimir tus datos. La Agencia de Acceso a la Información Pública es el órgano de control de esa ley.
      </p>

      <h2>Cambios</h2>
      <p>Si cambiamos esta política, lo vas a ver en esta página con su nueva fecha.</p>
    </article>
  `,
  styles: `
    h1 { font: var(--mat-sys-headline-small); margin: 8px 0 4px; }
    h2 { font: var(--mat-sys-title-medium); margin: 20px 0 4px; }
    p, li { font: var(--mat-sys-body-medium); line-height: 1.5; }
    ul { padding-left: 20px; }
  `,
})
export class Privacy {
  protected readonly auth = inject(AuthService);
  protected readonly contact = environment.contactEmail;
  protected readonly updated = '24 de noviembre de 2026';
}
