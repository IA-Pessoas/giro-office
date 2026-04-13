const edgeFunctionSecret = Deno.env.get("EDGE_FUNCTION_SECRET");
const clientServiceBaseUrl = Deno.env.get("CLIENT_SERVICE_BASE_URL");
const clientServiceInternalToken = Deno.env.get("CLIENT_SERVICE_INTERNAL_TOKEN");

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  if (!clientServiceBaseUrl || !clientServiceInternalToken) {
    return jsonResponse(500, {
      error:
        "Missing CLIENT_SERVICE_BASE_URL or CLIENT_SERVICE_INTERNAL_TOKEN environment variables",
    });
  }

  if (edgeFunctionSecret) {
    const authorization = request.headers.get("authorization");
    const expectedAuthorization = `Bearer ${edgeFunctionSecret}`;

    if (authorization !== expectedAuthorization) {
      return jsonResponse(401, { error: "Unauthorized" });
    }
  }

  const targetUrl = new URL("/internal/competence-output-update", clientServiceBaseUrl);

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "x-internal-service-token": clientServiceInternalToken,
      },
    });

    const responseText = await upstreamResponse.text();
    const contentType = upstreamResponse.headers.get("content-type") ?? "application/json";

    return new Response(responseText, {
      status: upstreamResponse.status,
      headers: {
        "content-type": contentType,
      },
    });
  } catch (error) {
    console.error("client-competence-output-update.failed", error);
    return jsonResponse(502, {
      error: "Failed to call client-service competence output endpoint",
    });
  }
});
