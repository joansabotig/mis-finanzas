import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';
import { Login } from './login';

describe('Login (registro)', () => {
  let fixture: ComponentFixture<Login>;
  let auth: { session: ReturnType<typeof signal>; recovering: ReturnType<typeof signal>; signUp: ReturnType<typeof vi.fn>; sendPasswordReset: ReturnType<typeof vi.fn> };

  const el = () => fixture.nativeElement as HTMLElement;
  const type = (name: string, value: string) => {
    const input = el().querySelector(`input[name=${name}]`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const submit = async () => {
    (el().querySelector('button[type=submit]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    auth = {
      session: signal(null),
      recovering: signal(false),
      signUp: vi.fn().mockResolvedValue('confirm'),
      sendPasswordReset: vi.fn().mockResolvedValue(null),
    };
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: SupabaseService, useValue: { isConfigured: true } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Login);
    fixture.componentRef.setInput('startMode', 'signup');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('en /registro muestra Google, confirmación de contraseña y la política de privacidad', () => {
    expect(el().querySelector('h1')?.textContent).toContain('Creá tu cuenta');
    expect(el().querySelector('.google')?.textContent).toContain('Registrarme con Google');
    expect(el().querySelector('input[name=password2]')).not.toBeNull();
    expect(el().querySelector('.terms a')?.getAttribute('href')).toBe('/privacidad');
  });

  it('valida largo mínimo y que las contraseñas coincidan', async () => {
    type('email', 'nuevo@ejemplo.com');
    type('password', 'corta');
    type('password2', 'corta');
    await submit();
    expect(el().querySelector('.error')?.textContent).toContain('al menos 8');

    type('password', 'unaClaveLarga1');
    type('password2', 'otraClaveLarga1');
    await submit();
    expect(el().querySelector('.error')?.textContent).toContain('no coinciden');
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('registra y pide confirmar el email', async () => {
    type('email', 'nuevo@ejemplo.com');
    type('password', 'unaClaveLarga1');
    type('password2', 'unaClaveLarga1');
    await submit();
    expect(auth.signUp).toHaveBeenCalledWith('nuevo@ejemplo.com', 'unaClaveLarga1');
    expect(el().querySelector('.sent')?.textContent).toContain('Te enviamos un email a nuevo@ejemplo.com');
  });

  it('desde iniciar sesión permite pedir el link para recuperar la contraseña', async () => {
    (el().querySelector('.switch') as HTMLButtonElement).click();
    fixture.detectChanges();
    (el().querySelector('.forgot') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el().querySelector('h1')?.textContent).toContain('Recuperar contraseña');
    expect(el().querySelector('input[name=password]')).toBeNull();
    type('email', 'yo@ejemplo.com');
    await submit();
    expect(auth.sendPasswordReset).toHaveBeenCalledWith('yo@ejemplo.com');
    expect(el().querySelector('.sent')).not.toBeNull();
  });
});
