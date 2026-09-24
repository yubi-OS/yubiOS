---
name: resend-connection
description: "How to work with the user's Resend connection effectively"
requiredApps: [custom]
---

# Resend connection

One connection row: `conn_YBJp6OTaZ8ZX` ("Resend (Steady Orbit, send-only)", api_key, added 2026-09-19). Transactional email sending for the Stable Orbit consultancy.

## The key is send-only — don't misread the 401 as broken

The stored key is a restricted key with only the send-email scope. Any read endpoint
(`GET /domains`, `GET /api-keys`, `GET /emails`) returns:

```
401 {"statusCode":401,"message":"This API key is restricted to only send emails","name":"restricted_api_key"}
```

That `restricted_api_key` error is the HEALTH CHECK — it proves the proxy injected the
credential and Resend authenticated it. A genuinely bad key returns a different error
(missing/invalid token). Don't "fix" this; it's by design. There is no readable account
data on this connection (no inbox, no send history via API), so it is not a
connection-sweep surface.

## Sending

`POST https://api.resend.com/emails` with JSON `{ "from", "to", "subject", "html" }`
(`to` can be a string or array). Returns `{"id": "...", }` on success. If a `from`
address fails domain verification, the error names it — the key can't list verified
domains, so confirm the sender domain with the user before the first real send.

Pass the connection on every call:
`connections: [{ id: "conn_YBJp6OTaZ8ZX", name: "Resend (Steady Orbit, send-only)" }]`.
