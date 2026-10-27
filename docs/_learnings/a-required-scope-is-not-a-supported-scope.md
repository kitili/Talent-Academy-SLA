# A required scope is not a supported scope

**Scope:** transferable
**Area:** MCP OAuth discovery; `workers/splotch-mcp`
**Status:** fixed — `server.http_app` publishes the list deliberately, and a test
pins it

## The symptom

A user connects Claude to Splotch, and asks it to delete a project:

```text
I couldn't delete it, and nothing was removed. Your Splotch connection
doesn't have delete permission, and edit access doesn't include it.

To fix this, reconnect Splotch in Claude's connector settings and turn on
delete access when it asks.
```

They reconnect. Same answer. They ask for a rename instead:

```text
Your Splotch connection turns out to be read-only. I got something wrong
earlier: I said it had edit access but not delete, when it actually has
neither.
```

Every write tool had been shipped, deployed, tested and was refusing every
caller. Not a bug in any of them — **no client had ever been able to ask for the
scopes they need**, and no amount of reconnecting would change that.

## Why it happened

The MCP SDK builds the RFC 9728 protected-resource document from
`AuthSettings.required_scopes`:

```python
scopes_supported=self.settings.auth.required_scopes   # mcp/server/mcpserver/server.py
```

That one field answers two different questions:

| Question | Correct answer here |
|---|---|
| What must **every** token carry to get through the door? | `splotch:read` alone |
| What may a client **ask for**? | read, write **and** delete |

They are deliberately different. `required_scopes` is narrow on purpose, so a
read-only connection is not refused at the door — every token issued before write
existed carries read alone. Publishing that same list said this resource supports
reading and nothing else.

Discovery does the rest. A client reads the resource document to learn what to
request, requests exactly that, and the consent screen describes a read-only
connection because that is all that was asked for. The token comes back without
write or delete, and every write tool refuses it — correctly, for a scope the
client was never told existed.

## Why nothing caught it

**The test asserted membership, not contents:**

```python
assert "splotch:read" in document["scopes_supported"]
```

That is true of the broken document too. A membership assertion can never catch a
list that is missing things — only a list that has the wrong things. Where the
*whole* list is the contract, assert the whole list:

```python
assert document["scopes_supported"] == ["splotch:read", "splotch:write", "splotch:delete"]
```

**And the two ends disagreed in a way nobody compared.** The authorization server
advertised all three scopes; the resource advertised one. Both documents were
individually plausible. Nothing reads them side by side except a client, and a
client just quietly asks for less.

```bash
curl -s https://<mcp-host>/.well-known/oauth-protected-resource/mcp
curl -s https://<app-host>/.well-known/oauth-authorization-server
```

Worth running as a pair whenever a scope is added.

## The refusal made it worse

The tools told the user to *"reconnect and turn on delete access when it asks"* —
but the consent screen has **no per-scope toggle**. The client chooses the scopes;
the person only approves or denies. So the message described a remedy that does
not exist, which is why reconnecting looked like it should have worked and the
real cause stayed hidden through several rounds.

A refusal that names an action the UI cannot perform is worse than one that just
says no: it sends the reader to look for a control instead of reporting a bug.

## The fix, and the shape of it

`required_scopes` stays `[splotch:read]`. The metadata route is rebuilt with the
full list — through the SDK's own `create_protected_resource_routes`, so the
document keeps its shape — and swapped into the Starlette app in
`server.http_app`.

Two details worth keeping:

- **`custom_route` cannot do this.** The SDK mounts custom routes last, "so they
  have the lowest route matching precedence", so its own metadata route wins. The
  route has to be replaced, not shadowed.
- **It raises when the route is not found.** If a future SDK moves or renames it,
  the service refuses to start. The failure being designed out is silently
  reverting to advertising read-only, which looks like working software right up
  until somebody tries to write something.

## The general lesson

**Under-advertising is silent; over-advertising is loud.** A resource that claims
a capability it lacks fails at the first call, with a clear error. A resource that
omits one it has fails at *no* call — the capability simply never gets requested,
and every symptom points at the user's permissions instead of at the server.

So when a configuration value is published *and* enforced, check what it publishes
separately from what it enforces. They look like one setting and they are two.

## Related

- `a-promise-on-a-consent-screen-outlives-the-code-that-made-it.md` — the other
  direction: what the scope means once somebody has granted it.
- `one-rule-many-layers.md` — the same shape when the second copy is in another
  language rather than another field.
- `a-refusal-test-that-passes-when-the-refusal-is-gone.md` — the sibling of the
  membership assertion above.
