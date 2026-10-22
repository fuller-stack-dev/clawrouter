# Grant refresh health

The credential Durable Object remains the sole refresh path for each grant.
An Anthropic usage/profile `401` rejects an **access** token, not the stored
refresh token. The owner re-reads the current generation, performs at most one
forced refresh, then retries the rejected probe once with committed credentials.
A second probe `401` does not revoke refresh authority. Setup-token grants still
skip probes requiring a refresh token; disabled/revoked grants cannot probe.

Only the existing permanent refresh classifier (`400`/`401` plus
`invalid_grant`, `invalid_token`, or `refresh_token_reused`) requires reauthorization.
Other refresh failures retain the existing five-minute retry window. This change
does not add backoff, jitter, refresh-family deduplication, or session-expiry logic.

## Admin diagnosis

Admin reads use KV for discovery and consult the credential owner for current
health. Failed projection writes cannot conceal a recorded incident; owner read
failures make health unavailable rather than healthy.

Admin grant responses include optional `refreshDiagnosis`:

- `lastSuccessfulRefreshAt`: last persisted successful rotation, or `null` when
  unknown. Import time and last selection are not successful refreshes.
- `failure`: current consecutive failure episode, or `null` after successful
  refresh/replacement. Includes allowlisted `oauthError`, nullable `httpStatus`,
  `failureClass` (`permanent`/`transient`), `firstFailureAt`, `lastFailureAt`,
  `attemptCount`, and nullable `nextRetryAt`.

Unknown provider error strings become `unknown_error`; raw bodies, descriptions,
request credentials, token fragments and hashes are never diagnosis fields.
The failure episode is stored with credential state, survives owner restart, and
is not cleared by renaming or enabling a grant. Credential replacement clears
the episode; successful rotation also records its success timestamp.

Subscriptions and the Access grant inspector show diagnosis and recovery guidance.
The administrator dashboard independently reports degraded policy/provider pools:
reauthorization is needed, no grant is eligible, or a multi-grant pool has at most
one eligible grant in a model lane. Paid/environment fallback does not suppress
these incidents. Policy/tenant scope, provider restrictions and explicit grant
allowlists still apply. Read failures show unavailable/stale health, not all clear.
There are no external notifications.

Reauthorize using a fresh dedicated provider login and replace the credential.
Do not copy a refresh token from another active refresh owner or replay an old
stored token. Automatic access rotation and keep-warm cannot guarantee an
unlimited upstream session lifetime.
