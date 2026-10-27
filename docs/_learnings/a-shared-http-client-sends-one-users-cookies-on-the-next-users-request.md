# A shared HTTP client sends one user's cookies on the next user's request

**Scope:** transferable
**Area:** any long-lived HTTP client shared across users; here the agent harness's pooled client for calls into the app (`workers/agent-harness/src/middleware/api_middleware/client/http.py`).
**Status:** designed out on 2026-10-23 by `_NoCookieJar` on the pooled client, pinned by `test_each_request_carries_only_its_own_credentials`.

## The symptom

Found while replacing a client per call with one pooled client, before it shipped. The review checked that no `Authorization` or `Cookie` header was set on the shared client. All credentials went on each request, so the change looked safe. With httpx's default cookie jar, the test's second request, from a user who sent only a bearer token, still went out with `cookie: sb-session=user-a-session`. That cookie came from a `Set-Cookie` on the first user's response.

## Why it was misleading

- The risk everyone looks for is headers set on the client (`Client(headers=...)`). Those are easy to see in review. The cookie jar fills itself from responses, at run time, and no line of the calling code mentions it.
- With a client per call, the jar is thrown away after each request, so the behaviour never shows. It appears only when the client lives longer than one user's request.
- A request that sends its own `Cookie` header is not affected: httpx does not overwrite it. Only a request with no cookie of its own (for example bearer-only) picks up the stored one. So a test that sends a cookie on both calls passes.

## Why it happens

`httpx.Client` (like `requests.Session`) keeps a cookie jar by default. It stores every `Set-Cookie` it receives and adds matching cookies to later requests to the same domain, unless the request already has a `Cookie` header. On a client shared across users, that is one user's session sent on another user's request.

## What to do

- On a client shared across users, turn off the cookie jar (here, a `CookieJar` subclass whose `extract_cookies` and `set_cookie` do nothing), and send each user's cookie in their own request's headers.
- Test it on the wire: a real local server that sets a cookie on the first response, then a second request with no cookie of its own. Assert that the server saw no `Cookie` header on it. Remove the guard to check that the test fails.
- The same applies to anything else a client learns from responses: auth flows that cache tokens, and redirects that carry credentials.
