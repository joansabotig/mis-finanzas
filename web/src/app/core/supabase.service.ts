import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly isConfigured =
    !environment.supabaseUrl.includes('TU_PROYECTO') && !environment.supabaseAnonKey.startsWith('TU_');

  readonly client: SupabaseClient = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
    // PKCE: los links de confirmación, Google y recuperación vuelven con ?code=… y la sesión se arma sola.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
}
