# Issue #772: HttpOnly Session and CSRF Design

## Context

The browser currently stores the access JWT in the readable `cw.token` cookie, decodes it for
module permissions, and copies it into the `Authorization` header. Any script running in the page
origin can therefore steal the credential. Moving authentication to a cookie also makes browser
mutations vulnerable to CSRF unless the server binds an explicit anti-CSRF token to the session.

The existing authentication model already signs short-lived JWTs, validates `session_version` on
each gateway request, and increments that version when credentials or permissions change. The
design keeps those working revocation semantics and changes only the browser transport and session
boundary.

## Goals

- Keep the authentication credential unreadable to browser JavaScript.
- Set, rotate, and expire authentication cookies only at a server boundary.
- Reject authenticated unsafe requests without a valid session-bound CSRF token.
- Preserve immediate disabled-user and `session_version` revocation.
- Preserve SSR and the public gateway contract through `https://useoffice.com.br`.
- Provide a bounded, observable compatibility path for already-issued Bearer sessions.
- Avoid new runtime dependencies and new session infrastructure.

## Non-goals

- MFA, password hashing, JWT algorithm changes, and service-to-service identity.
- Per-device session lists or revocation of one device independently of another.
- A new Redis deployment, database session table, or broad CSP redesign.
- Refactoring unrelated API clients, permissions, routes, or UI.

## Chosen Architecture

The user-service continues issuing signed JWTs, but the raw token is returned only through the
`cw.session` response cookie. The cookie is `HttpOnly`, `Secure` in production, `SameSite=Lax`,
`Path=/`, and has an explicit maximum age matching the JWT expiry. The login JSON envelope contains
the authenticated user and module permissions, but never the token.

The user-service also generates a cryptographically random CSRF token and sets it in the readable
`cw.csrf` cookie with `Secure` in production, `SameSite=Lax`, `Path=/`, and the same maximum age. The
JWT contains `csrf_hash`, the SHA-256 hash of the random CSRF token. Since the JWT signature protects
that hash, the gateway can prove that the readable CSRF value belongs to the authenticated session
without adding a session store.

`POST /user/session/refresh` reloads the active user context, signs a fresh JWT with a new CSRF hash,
rotates both cookies, and returns the current user data without a token. `DELETE /user/session`
increments `session_version` and expires both cookies. An invalid, expired, disabled, or revoked
cookie also causes the gateway to emit expiration cookies before returning `401`, preventing stale
cookies from trapping the browser in a redirect loop.

## Request Authentication and CSRF

The gateway authenticates protected requests from `cw.session`. During a documented compatibility
window it may fall back to `Authorization: Bearer` only when
`GATEWAY_BEARER_AUTH_COMPATIBILITY=true`. The flag defaults to `false`; production rollout may enable
it for no more than 14 days, and the runbook must name the removal date.

For cookie-authenticated `POST`, `PUT`, `PATCH`, and `DELETE` requests, the gateway requires all of
the following:

1. `x-csrf-token` is present.
2. The header equals the `cw.csrf` cookie using constant-time comparison.
3. SHA-256 of the presented value equals the signed JWT `csrf_hash` claim.
4. A present `Origin` or `Referer` resolves to an explicitly allowed gateway origin.
5. Literal `Origin: null` and unapproved origins are rejected.

Failures return `403` through the existing safe error envelope and never include token values. Safe
methods do not require CSRF. Public unauthenticated routes such as login remain outside this check.
Bearer compatibility requests retain their historical non-cookie behavior only while the explicit
flag is enabled; each use is observable and the final production contract keeps the flag disabled.

## Trust Boundaries

The gateway validates the browser session and forwards only the existing trusted `x-auth-*` context
plus the internal service token. It removes `cw.session`, `cw.csrf`, and client `Authorization` before
proxying to downstream services. `Set-Cookie` responses from the user-service session routes continue
through the gateway to the browser.

The direct user-service Bearer path remains available for the gateway's internal session validation
and existing trusted service/test contracts. Browser credentials are not reused as service identity.

## Frontend and SSR

The shared Axios client enables credentials. In the browser it reads only `cw.csrf` and adds
`x-csrf-token` to unsafe methods. It never reads, decodes, stores, or forwards the authentication JWT.

On SSR, `setupAPIClient(ctx)` forwards the incoming `Cookie` header to the configured internal API
URL. SSR guards may detect the presence of the session cookie, but they do not parse the JWT.
Authentication truth comes from `/user/me`; a `401` redirects to login. The login page no longer
trusts cookie presence alone, so an expired cookie cannot force a redirect loop.

`AuthContext` obtains user and module permissions from login, refresh, and `/user/me` response data.
Logout calls the server endpoint before clearing local user/query state. The unauthorized handler
clears only in-memory state and redirects; cookie expiry remains a server action.

## CORS and Deployment

Credentialed CORS keeps explicit origins and adds `x-csrf-token` to allowed headers. Production must
include `https://useoffice.com.br` and must continue rejecting wildcard, `null`, and arbitrary hostile
origins. The preferred production path is same-origin `/api` through the existing reverse proxy.

Environment examples and runbooks document cookie security, the Bearer compatibility flag, the
14-day maximum window, the production origin, validation signals, rollback, and the rule that CSRF
must never be disabled while cookie authentication remains enabled.

## Observability

The implementation uses the existing structured logger rather than adding a metrics dependency.
It emits countable events for cookie authentication success, Bearer compatibility use, CSRF
rejection reason categories, session validation failure, refresh, and logout. Events include request
metadata already allowed by the logging policy but never cookies, CSRF values, authorization headers,
passwords, raw JWTs, or production identifiers.

## Rollout and Rollback

1. Deploy gateway and user-service support with Bearer compatibility temporarily enabled only if
   already-issued sessions require it.
2. Deploy the web client using cookie credentials and verify login, `/user/me`, refresh, logout, and
   representative mutations.
3. Observe Bearer compatibility and CSRF/session failure events until Bearer use reaches zero.
4. Disable the compatibility flag within 14 days and remove it in a follow-up cleanup after the
   bounded window.

Rollback may temporarily re-enable Bearer compatibility only with explicit risk acceptance. It must
not disable CSRF while credentialed cookies are accepted. The previous browser-readable cookie is not
restored by an automatic rollback.

## Test Strategy

- Unit tests cover cookie attributes, cookie parsing/removal, CSRF hashing and constant-time
  validation, rotation, and expiration.
- User-service service and route tests cover login without a JSON token, refresh rotation, logout
  `session_version` invalidation, disabled users, stale sessions, and `Set-Cookie` headers.
- Gateway tests cover cookie authentication, the disabled/enabled Bearer compatibility flag, absent,
  invalid, replayed, and wrong-session CSRF values, and allowed, `null`, and hostile origins.
- Proxy tests prove browser session cookies and client authorization are not sent downstream.
- Frontend/package tests prove credentials are enabled, only the CSRF cookie is read, unsafe requests
  receive the header, and SSR forwards cookies without decoding the JWT.
- Browser verification proves login/navigation succeeds and `document.cookie` cannot read
  `cw.session`; screenshots capture the authenticated UI and browser evidence without secrets.
- OpenAPI, smoke coverage, focused unit tests, typechecks, production builds, dependency audit, and
  scoped browser tests form the release gate.

## Security and Dependency Constraints

- No new npm package is added. Cookie and CSRF operations use existing libraries or Node/Web APIs.
- Comparisons of attacker-controlled secret material use bounded values and constant-time comparison.
- Cookie, header, origin, and token inputs are size-limited and parsed once at the gateway boundary.
- No secret, token, password, production row, or user identifier appears in code, fixtures, logs,
  screenshots, plans, or documentation.

## Acceptance Mapping

The final evidence must demonstrate every checkbox in issue #772: production cookie attributes, no
JWT in JSON or browser storage, credentialed browser requests, complete unsafe-method CSRF rejection,
valid same-origin mutation, logout/version revocation, stale-session redirect, explicit CORS,
documentation/OpenAPI/smoke alignment, and the required unit, route, browser, cross-origin, and
session-version regression tests.
