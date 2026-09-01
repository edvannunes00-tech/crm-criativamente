// ============================================================
// Cliente Supabase único, compartilhado por toda a aplicação.
// Importa o SDK oficial via ESM CDN — nenhuma etapa de build
// necessária, funciona direto no navegador.
//
// A "publishable key" é segura em público por design: a proteção
// real é a RLS de cada tabela/view/função no banco (Fases 1-8A).
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://wdhioclskicixdhkolce.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_COrSf3tJY9fMKalhJ83g3w_p5Zhk6yh';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  db: {
    // Todo o CRM vive no schema "crm" (decisão da Fase 1) — sem isso,
    // o cliente procuraria as tabelas/funções em "public" e falharia.
    schema: 'crm',
  },
});
