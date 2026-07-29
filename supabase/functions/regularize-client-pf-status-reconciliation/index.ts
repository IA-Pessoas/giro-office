const edgeFunctionSecret = Deno.env.get("EDGE_FUNCTION_SECRET");
const regularizeServiceBaseUrl = Deno.env.get("REGULARIZE_SERVICE_BASE_URL");
const regularizeServiceInternalToken = Deno.env.get("INTERNAL_SERVICE_TOKEN");

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

  if (!regularizeServiceBaseUrl || !regularizeServiceInternalToken) {
    return jsonResponse(500, {
      error: "Missing REGULARIZE_SERVICE_BASE_URL or INTERNAL_SERVICE_TOKEN environment variables",
    });
  }

  if (edgeFunctionSecret) {
    const authorization = request.headers.get("authorization");
    const expectedAuthorization = `Bearer ${edgeFunctionSecret}`;

    if (authorization !== expectedAuthorization) {
      return jsonResponse(401, { error: "Unauthorized" });
    }
  }

  const targetUrl = new URL(
    "/internal/reconciliation/client-pf-status/run",
    regularizeServiceBaseUrl,
  );

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "x-internal-service-token": regularizeServiceInternalToken,
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
    console.error("regularize-client-pf-status-reconciliation.failed", error);
    return jsonResponse(502, {
      error: "Failed to call regularize-service client PF status reconciliation endpoint",
    });
  }
});
