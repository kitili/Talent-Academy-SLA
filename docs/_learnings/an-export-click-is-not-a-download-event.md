# An export click is not a download event

**Scope:** transferable

**Symptom.** `capture_download` clicked APM's Record Pages **Export** (twice) and Page Time
Details' CSV icon, each dead-centre on the control, and returned `No download started within 20 s`
every time. The menu was still open afterwards, with Export highlighted. Thread
`01a11aa2-5cc3-7530-9185-961772937279` (staging, 2026-10-08); the screenshots the model saw are in
the LLM runs before each `capture_download` tool run (`langsmith run get <id> --include-io`).

**Why it misleads.** The agent's aim, the download wiring (`page.on("download")` on every tab) and
the container's temp dir were all fine. A failed save still fires a `download` event and reports
`The download failed`. Silence meant the browser never started a download at all. The first
version of the tool recorded only "download: yes/no", so the trace could not say why.

**The trap.** "Export" in a web app is any of: a real download, an inline CSV response, a tab that
opens and closes, a `data:` URL Chromium refuses, or a handler that ignores a synthetic click.
Only the first fires Playwright's `download`.

**The check.** Watch more than `download` around an export click: responses (an attachment header
or a CSV content type), new tabs and page errors. Report what happened when nothing is caught.
`_capture_download` does this now (`computer_use_middleware/session.py`), and falls back to
`element.click()` on the element under the point.

**Cause, confirmed (thread `01a11acf`, 2026-10-08).** The diagnosis said "The page made no request
after the click", and the direct click hit an empty `DIV`. In a normal Chrome the same icon
downloaded `performancelogs.csv` through a plain GET to
`scriptlet.nl?script=customscript_nsapm_pts_sl_etetime_v2…&getcsv=T`. So the export is a server
request, and the headless click never fired it: the icon is a small image inside a bare DIV, the
model's aim (read off a JPEG) landed on the DIV, and a click there never reaches the image's
handler. A click that misses by a few pixels looks exactly like an export that does not work.

**Fixes added on October 8.** The direct click takes the nearest
clickable control within 24 px, and `capture_download(url=…)` can fetch an APM `getcsv=T` export
with the browser's session.

**Update (thread `01a11c6a`, 2026-10-08).** With the click retargeted, the direct click did hit
`DIV "Export CSV" .psgp-paging-exportcsv`, and still nothing: no response, no tab, no error. In
Playwright's own Chromium an iframe attachment download fires request, a 200 response, a failed
`ERR_ABORTED` and `download`, so "no response" there means APM's handler sent nothing in the
agent's browser. The working route is the URL: APM's tables load from the same Suitelet the CSV
comes from, so the worker now lists export URLs built from those data requests, and the agent
fetches one with `capture_download(url=…)`. Second lesson: a diagnosis built on responses alone
cannot tell "sent nothing" from "sent a request that became a download"; watch requests.

**Update (thread `01a11ef9-f44a-7331-b72b-dacd37e42089`, 2026-10-09).** The live tool schema allowed
`capture_download` with `activity` alone, but the wrapper required a target and rejected the call
before the worker could discover an export URL. A coordinate attempt landed on a quiet DIV and
sent no request. This proves the wrapper mismatch and the ignored click; it does not prove that
live iframe or resource-timing discovery failed, and no successful agent CSV save was observed.

Review also found a second trap: an APM shell can keep its URL while its report iframe changes,
so remembered requests can describe the previous report. Discovery now reads the current page
and visible frames' URLs/resource timing, ignoring parent iframe resource entries. An accessible
empty result stays empty; event history is used only when every frame read is unavailable.
Active-page navigation preserves its own APM document request, and popup navigation cannot clear it.

**Current status.** Activity-only calls reach discovery. One candidate is fetched; several require
an explicit `url`; none returns refresh/control-target guidance. A failed fetch reports its cause
and clicks only when a target was supplied. The same-host, named APM read-only URL guard remains
in place. Unit regressions cover the wrapper and worker; intercepted synthetic Chromium pages
verify iframe/resource discovery, stale report exclusion and hidden-frame exclusion. Successful
live NetSuite CSV capture remains to be verified.

**Update (2026-10-09): one report, two mechanisms.** A manual export in a normal Chrome showed
Record Pages Monitor's Export sends no request at all: APM builds `recordtileslogs.csv` in the
page from the tiles' JSON (Chrome records only the site origin as its source). The
`record_tile_v2…&getcsv=T` URL therefore answers JSON, while Page Time Summary's `etetime_v2`
answers a real CSV. "The table's data Suitelet also serves its CSV" holds per report, not for
APM as a whole. Check with a real export (and `kMDItemWhereFroms` on the downloaded file)
before building a route on it.

**Update (2026-10-09, the real cause): the handlers were never bound.** A shell in the Railway
container showed ten 385-byte files in `/tmp/playwright-artifacts-*` from the user's Export clicks,
while every capture had reported "no download" and "the page made no request".
`_attach_dialog_handler` bound `page.on("download", self._downloads.append)` inside one `try`
with a bare `except: pass`. Playwright tags each handler with an attribute, a builtin method
cannot take one, so that line raised, and the `except` silently dropped the download handler
and every handler after it (response, request, console, page errors, frame navigation). So the
click route had been working in the browser all along; the harness simply never listened. Most
of the "the page sent nothing" conclusions above came from handlers that did not exist.

**The trap:** a bare `except` around several independent registrations turns one bad line into
"nothing ever happens", with tests that fake the page passing throughout. **The check:** bind each
handler on its own and log a failure; and test listeners through the object production builds
(`tests/integration/test_browser_session_downloads.py` drives the real `BrowserSession`), not a
hand-wired page. Designed out in `_attach_dialog_handler` the same day.
