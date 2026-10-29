// ============================================================
// Edge Function: google-calendar-eventos
// ------------------------------------------------------------
// Busca os eventos do Google Agenda do usuario logado, num
// intervalo de datas, usando o refresh_token guardado.
//
// verify_jwt fica DESLIGADO no deploy (mesmo motivo do
// google-oauth-callback): este arquivo faz a propria validacao
// do token, pra podermos responder o preflight CORS sem exigir
// login nessa etapa.
// ============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const url = new URL(req.url);
    const empresaId = url.searchParams.get("empresa_id");
    const dataInicio = url.searchParams.get("data_inicio");
    const dataFim = url.searchParams.get("data_fim");

    if (!empresaId || !dataInicio || !dataFim) {
      return new Response(JSON.stringify({ error: "empresa_id, data_inicio e data_fim sao obrigatorios" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } }
    );
    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Nao autenticado" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { db: { schema: "crm" } }
    );

    const { data: integracao } = await supabaseAdmin
      .from("integracoes_google")
      .select("refresh_token")
      .eq("usuario_id", userData.user.id)
      .eq("empresa_id", empresaId)
      .maybeSingle();

    if (!integracao) {
      return new Response(JSON.stringify({ conectado: false, eventos: [] }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
        refresh_token: integracao.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const tokenData = await tokenResp.json();
    if (!tokenResp.ok) {
      return new Response(JSON.stringify({ error: "Nao foi possivel renovar o acesso ao Google. Talvez precise reconectar.", conectado: false, eventos: [] }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const eventosResp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(dataInicio)}&timeMax=${encodeURIComponent(dataFim)}&singleEvents=true&orderBy=startTime`,
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    const eventosData = await eventosResp.json();

    const eventos = (eventosData.items || []).map((e: any) => ({
      titulo: e.summary || "(sem título)",
      data_hora: e.start?.dateTime || e.start?.date,
      link: e.htmlLink,
      local: e.location || null,
    }));

    return new Response(JSON.stringify({ conectado: true, eventos }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
