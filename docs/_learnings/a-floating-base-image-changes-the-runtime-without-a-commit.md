# A floating base image changes the runtime without a commit

**Scope:** transferable
**Area:** `workers/agent-harness/Dockerfile` (`FROM`, `apk add chromium`, `uv pip install -c /api/constraints.txt -e .`),
`pyproject.toml`, `uv.lock`.
**Status:** fixed 2026-10-09 (BROWSER-CAPACITY): base pinned to `langchain/langgraph-api:0.15.4-py3.13-wolfi`, Playwright
pinned `==1.63.0` in `pyproject.toml` and `uv.lock`, and the first browser launch logs the runtime it got.
Chromium from the Wolfi apk still floats.

## The symptom

The Dockerfile said it tracked `langchain/langgraph-api:3.13-wolfi` "(langgraph-api 0.10.x)" and `uv.lock` said
Playwright 1.60.0. The running container had langgraph-api 0.15.4, Chromium 154.0.8037.97 and Playwright
1.63.0. No commit had changed any of them.

## Why it was misleading

The repository read as a complete description of the runtime: a tag in the Dockerfile and a lock file
beside it. Reading either one gave the wrong versions, and any reasoning about "what changed" from the git
history found nothing.

## Why it happens

- `3.13-wolfi` is a moving tag. Each rebuild of the image pulls whatever it points at that day.
- `apk add chromium` on Wolfi installs the current build; old builds are not kept.
- The image installs the project with `uv pip install -e .` under the base image's `/api/constraints.txt`.
  That reads `pyproject.toml`, not `uv.lock`, so `playwright>=1.49.0` resolved to the newest release. The
  lock only governed local `uv sync`.

So an ordinary redeploy moved three components at once, and a newer Chromium that uses more threads per
browser helped push the container into its task limit (see
`a-catch-all-error-message-reports-the-failure-it-was-written-for.md`).

## What to do

- Pin base images to a versioned tag (and record the digest); check the tag exists before pinning, e.g.
  `curl -s "https://hub.docker.com/v2/repositories/<org>/<repo>/tags?name=<version>"`.
- Know which file the image install actually reads. If it is not the lock file, pin the dependencies that
  matter exactly where it does read them, and keep the lock in step.
- For what cannot be pinned (distro packages without history), log the resolved versions at startup so a
  drift shows up in the logs of the deploy that caused it.
