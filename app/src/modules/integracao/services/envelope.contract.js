/**
 * @param {unknown} body
 * @returns {body is { data: unknown }}
 */
function hasDataEnvelope(body) {
  return typeof body === "object" && body !== null && !Array.isArray(body) && "data" in body;
}

/**
 * @param {unknown} body
 * @returns {unknown}
 */
export function unwrapServiceEnvelope(body) {
  if (hasDataEnvelope(body)) {
    return body.data;
  }

  return body;
}
