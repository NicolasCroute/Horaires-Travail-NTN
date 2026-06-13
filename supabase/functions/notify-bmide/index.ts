import "@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: corsHeaders,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Methode non autorisee" }, 405);
  }

  const webhookUrl = Deno.env.get("TEAMS_WEBHOOK_URL");
  if (!webhookUrl) {
    return jsonResponse({ error: "Secret TEAMS_WEBHOOK_URL manquant" }, 500);
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "Quelqu'un").trim() || "Quelqu'un";
  const event = body.event === "released" ? "released" : "taken";
  const timestamp = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const message =
    event === "taken"
      ? `BMIDE pris par ${name} a ${timestamp}.`
      : `BMIDE libere par ${name} a ${timestamp}.`;
  const statusLabel = event === "taken" ? "Indisponible" : "Libre";
  const statusColor = event === "taken" ? "Attention" : "Good";
  const actionLabel = event === "taken" ? "Prise du BMIDE" : "Liberation du BMIDE";
  const adaptiveCard = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: actionLabel,
        weight: "Bolder",
        size: "Medium",
      },
      {
        type: "TextBlock",
        text: statusLabel,
        color: statusColor,
        weight: "Bolder",
        spacing: "Small",
      },
      {
        type: "FactSet",
        facts: [
          {
            title: "Personne",
            value: name,
          },
          {
            title: "Heure",
            value: timestamp,
          },
        ],
      },
      {
        type: "TextBlock",
        text: message,
        wrap: true,
        spacing: "Medium",
      },
    ],
  };

  const teamsResponse = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(adaptiveCard),
  });

  if (!teamsResponse.ok) {
    const details = await teamsResponse.text().catch(() => "");
    return jsonResponse(
      {
        error: "Erreur lors de l'envoi Teams",
        details,
      },
      502,
    );
  }

  return jsonResponse({ ok: true });
});
