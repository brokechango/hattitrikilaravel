import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type InvitationRequest = {
  playerId?: unknown;
  email?: unknown;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readDefaultApiKey(currentVariable: string, legacyVariable: string): string | null {
  const encodedKeys = Deno.env.get(currentVariable);
  if (encodedKeys) {
    try {
      const keys = JSON.parse(encodedKeys) as Record<string, unknown>;
      const defaultKey = keys.default;
      if (typeof defaultKey === "string" && defaultKey.trim().length > 0) {
        return defaultKey.trim();
      }
    } catch {
      console.error(`Could not read ${currentVariable}.`);
    }
  }

  return Deno.env.get(legacyVariable)?.trim() || null;
}

function response(status: number, body: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return response(405, { code: "method_not_allowed", message: "Method not allowed" });
  }

  const authorization = request.headers.get("Authorization")?.trim();
  if (!authorization) {
    console.warn("Invitation request rejected: authorization header missing.");
    return response(401, { code: "unauthorized", message: "Missing authorization" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  // Prefer the current key sets. Supabase keeps legacy variables for compatibility,
  // but their credentials may be rotated independently.
  const supabaseAnonKey = readDefaultApiKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const serviceRoleKey = readDefaultApiKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    console.error("Supabase Edge Function environment is incomplete.");
    return response(500, { code: "configuration_error", message: "Server configuration is incomplete" });
  }

  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    console.warn("Invitation request rejected: session is invalid.");
    return response(401, { code: "unauthorized", message: "Invalid session" });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // This SECURITY DEFINER RPC is deliberately called with the requester's token.
  // It validates their active admin role without coupling authorization to the
  // server client's secret-key headers.
  const { data: accessRows, error: accessError } = await callerClient
    .rpc("get_current_user_access");
  if (accessError) {
    console.error("Could not verify invitation sender", accessError);
    return response(500, { code: "authorization_check_failed", message: "Could not verify permissions" });
  }
  const callerAccess = Array.isArray(accessRows) ? accessRows[0] : accessRows;
  if (callerAccess?.role !== "admin" || callerAccess.is_member !== true) {
    return response(403, { code: "forbidden", message: "Administrator permission required" });
  }

  let payload: InvitationRequest;
  try {
    payload = await request.json() as InvitationRequest;
  } catch {
    return response(400, { code: "invalid_request", message: "Expected a JSON request body" });
  }
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const playerId = typeof payload.playerId === "string" ? payload.playerId.trim() : "";
  if (!emailPattern.test(email)) {
    return response(400, { code: "invalid_email", message: "A valid email is required" });
  }
  if (!uuidPattern.test(playerId)) {
    return response(400, { code: "invalid_player", message: "An existing player is required" });
  }

  const inviteToken = crypto.randomUUID();
  const { error: inviteRecordError } = await callerClient.rpc("create_player_invite", {
    p_player_id: playerId,
    p_email: email,
    p_token: inviteToken,
  });
  if (inviteRecordError) {
    const details = inviteRecordError.message.toLowerCase();
    const conflict = details.includes("already") || details.includes("pending");
    console.error("Could not reserve player invitation", inviteRecordError);
    return response(
      conflict ? 409 : 400,
      {
        code: conflict ? "player_already_linked" : "player_invitation_failed",
        message: conflict ? "Player already linked or invited" : "Could not prepare invitation",
      },
    );
  }

  // The project's Auth Site URL is the invitation target. It must be the permanent
  // Hattitriki web origin configured in Supabase Auth URL Configuration.
  const { data: invitationData, error: invitationError } = await adminClient.auth.admin
    .inviteUserByEmail(email, { data: { invite_token: inviteToken } });
  if (invitationError || !invitationData.user) {
    await callerClient.rpc("cancel_player_invite", { p_token: inviteToken });
    const details = invitationError?.message.toLowerCase() ?? "";
    const duplicate = details.includes("already") || details.includes("registered");
    console.error("Could not create league invitation", invitationError);
    return response(
      duplicate ? 409 : 400,
      {
        code: duplicate ? "email_already_registered" : "invitation_failed",
        message: duplicate ? "User already registered" : "Could not create invitation",
      },
    );
  }

  // Activate only the profile that the invitation trigger already linked. The
  // RPC validates the caller's active admin role and the consumed invite,
  // avoiding a browser-inherited header or broad server-side profile update.
  const { error: profileActivationError } = await callerClient
    .rpc("activate_invited_player_profile", {
      p_user_id: invitationData.user.id,
      p_player_id: playerId,
    });
  if (profileActivationError) {
    console.error("Invitation sent but profile activation failed", profileActivationError);
    return response(500, { code: "profile_activation_failed", message: "Could not activate member" });
  }

  return response(200, { email, message: "Invitation sent" });
});
