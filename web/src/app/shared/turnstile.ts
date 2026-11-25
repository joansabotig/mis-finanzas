import { AfterViewInit, Component, ElementRef, input, OnDestroy, output, viewChild } from '@angular/core';

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile no cargó')));
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('No se pudo cargar el captcha'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Captcha de Cloudflare Turnstile (gratis, casi siempre invisible: no hay que
 * elegir semáforos). Emite el token para mandarlo a Supabase Auth; cada token
 * sirve una sola vez, así que después de cada intento hay que llamar a reset().
 */
@Component({
  selector: 'app-turnstile',
  template: `<div #box class="box"></div>
    @if (failed) { <p class="error">No se pudo cargar la verificación anti-bots. Revisá tu conexión y recargá la página.</p> }`,
  styles: `
    .box { display: flex; justify-content: center; min-height: 65px; margin: 8px 0; }
    .error { color: var(--mat-sys-error); font: var(--mat-sys-body-small); text-align: center; }
  `,
})
export class Turnstile implements AfterViewInit, OnDestroy {
  readonly siteKey = input.required<string>();
  readonly token = output<string | null>();
  private readonly box = viewChild.required<ElementRef<HTMLElement>>('box');
  private api: TurnstileApi | null = null;
  private widgetId: string | null = null;
  protected failed = false;

  async ngAfterViewInit() {
    try {
      this.api = await loadTurnstile();
      this.widgetId = this.api.render(this.box().nativeElement, {
        sitekey: this.siteKey(),
        language: 'es',
        theme: 'light',
        callback: (t: string) => this.token.emit(t),
        'expired-callback': () => this.token.emit(null),
        'error-callback': () => this.token.emit(null),
      });
    } catch {
      this.failed = true;
    }
  }

  reset() {
    this.token.emit(null);
    if (this.api && this.widgetId) this.api.reset(this.widgetId);
  }

  ngOnDestroy() {
    if (this.api && this.widgetId) this.api.remove(this.widgetId);
  }
}
