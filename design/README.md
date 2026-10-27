# Design board sources

The proposed redesign of every Admin, Trainer and Fellow screen, as drawn on the private claude.ai design board
"Silverleaf LMS — Design Board". This folder is a copy of the board's files so that work on the app can read the spec
from the repository. The board is the place to look at the designs. When the board changes, copy its files here again.

- `board/*.dc.html` — one artboard each. Files titled "Proposed — …" in `board/canvas.json` are the spec. `Admin`,
  `Trainer`, `Fellow`, `SignIn` and `Main` are screenshots of today's app (their images stay on the board).
- `board/canvas.json` — every board's title and position.
- `board/Glossary.dc.html` — the words used on screen (Cohort, Step, Course, Module, Lesson file, Session, Attendance
  mark, Fellow, Trainer, Admin) and the words avoided.
- `DESIGN-BRIEF.md` — the colours, type, layout rules, wording decisions and real data the boards follow.
- `harness/` — a local preview: `node design/harness/server.mjs`, then
  `http://localhost:5050/render.html?f=AdminHome.dc.html&w=1280&h=960&fill=1`. Add `&z=0.6` to zoom out.
- `assets/` — the Silverleaf logo the boards use. The certificate templates are read from `client/public/`.

Text in `[brackets]` and blocks labelled "Example state" are placeholders that show a page in use; they are never
real data.
