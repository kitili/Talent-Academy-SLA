# Silverleaf Academy LMS — redesign brief for the remaining pages

You are drawing proposed screens for a design board. Each screen is ONE self-contained `.dc.html` file (a "Design
Component" artboard). Write only the files you are assigned, into
`C:\Users\wanen\AppData\Local\Temp\claude\C--Work-Talent-Academy-SLA\d38137ef-5961-440f-96c3-510d786bb91d\scratchpad\design-board\project\`.
Do NOT edit `canvas.json` or any other file, do NOT publish anything, do NOT run the app, start a server, or touch a database.

## Read first (they are your reference for markup, shell and quality)
- `project/AdminHome.dc.html` — the shared shell (header, side menu, main). COPY ITS HEADER AND NAV MARKUP VERBATIM, then change only:
  the desk pill text (Admin / Trainer / Fellow), the person's name, the nav items for that desk, and which nav item has
  `aria-current="page"` (the current one gets `background: #E8F0FB; color: #0A48A5; font-weight: 600`).
- `project/AdminCohorts.dc.html` — list + detail layout, a "More actions" menu, step list, status chips.
- `project/FellowLearning.dc.html` — Fellow shell, example-state block with [bracketed] placeholders.
- `project/TrainerHome.dc.html` — Trainer shell, table markup.
- `project/Shell.dc.html` — the shell rules and per-desk menus.

## File format (each rule fails silently if broken)
- Skeleton: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>…</title><script src="./support.js"></script></head><body><x-dc><helmet>…</helmet> ROOT </x-dc><script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":1280,"height":H}}'>class Component extends DCLogic { renderVals() { return { … }; } }</script></body></html>`.
  Keep `<script src="./support.js"></script>` EXACTLY. Always include the data-dc-script block (classic JS, no imports).
- In `<helmet>` use exactly what the reference files use: the Google Fonts Inter `<link>`s and
  `<style>body{margin:0} a{color:#0A48A5}a:hover{color:#083A86}</style>`.
- Close every non-void element; quote every attribute. All styling inline `style="…"`. Lay out with flex/grid + gap.
- `{{hole}}` is a dotted lookup into `renderVals()` only — never an expression. Repeats: `<sc-for list="{{items}}" as="item" hint-placeholder-count="3">`;
  conditionals: `<sc-if value="{{flag}}" hint-placeholder-val="{{ true }}">`. Always set the hint attributes. Compute everything in `renderVals()`.
- No `innerHTML`, no script-built UI, no `<iframe>`/`<object>`/`<embed>`, no network except the font link and the logo url below.
- `data-props` is single-quoted JSON; it holds only `$preview` (width 1280, height = the page's height at 1280 px wide, your best estimate; over-tall beats clipped).
- These are PAGES (app screens): the root is fluid — copy the reference root `<div style="min-height: 100%; …">`, header, and the
  `display:flex; flex-wrap: wrap` row with `<nav>` (`flex: 1 1 232px; max-width: 280px`) and `<main>` (`flex: 999 1 560px; min-width: 0; padding: 32px 40px 48px 40px; max-width: 1040px or 1120px`).
  No px width on the root. Wide tables go in an `overflow-x: auto` box. At phone width the menu stacks — that is fine.
- Logo: the real Silverleaf shield, `<img src="/_blob/67291cc5cf75113d16832678d92ee54a" alt="" width="30" height="36" style="display: block">`
  next to the visible text "Silverleaf Academy". Never draw a logo.
- Icons: only inline stroke SVG with `aria-hidden="true"` (bell, moon, chevrons, etc. — copy from the references). No emoji.

## Look
- Inter. Page title 28/600; section 18/600; body 15/400; secondary 13–14 in #4B5563.
- Ground #F6F7F9, surfaces #FFFFFF with 1px #E3E6EB borders, radius 12 (cards) / 8 (buttons, inputs) / 999 (chips).
- ONE accent: Silverleaf blue #0A48A5 for links, the current page, primary buttons (white text), selected tabs (`border-bottom: 2px solid #0A48A5`).
  Soft accent #E8F0FB. Secondary buttons: white with 1px #D5D9E0 border, ink text.
- Colour means status only: at risk / error #B42318 on #FEF3F2; overdue / needs attention #B54708 on #FFFAEB; passed / done / open #067647 on #ECFDF3;
  neutral #374151 on #EEF0F3. Never decorate with colour; no gradients, no pastel tiles of different hues, no left-border cards, no photos, no text over images.
- Each page: page header (h1 + one-line context + ONE primary button where a primary action exists), then the work first, figures after.
  Destructive actions (delete, close, stop, clear) never sit beside the main action: put them in a "More actions" menu or a separate red-outlined "careful" box,
  and mark the ones that ask for confirmation with "…".
- Empty states say plainly what is empty and what will appear there; never a false 0 — loading shows a skeleton (grey bars #EEF0F3).

## Words (approved decisions — use them exactly)
- The learner is a **Fellow** (never "teacher" in the UI). Coaches are **Trainers**; **Admin** runs the academy.
- Structure: **Cohort → Step → Course → Module → Lesson file**. A cohort holds steps that run in order; a step holds courses; a course holds modules; a module holds lesson files.
- A lesson file is done when its approved quiz is passed (pass mark **80%**, **3 tries**), or, if it has no approved quiz, once the Fellow marks it read.
  A module with no lesson file never holds the Fellow up. **A course needs at least one lesson file before it can be complete.**
- AI drafts quizzes when a lesson file is uploaded; every draft waits for a Trainer (on their own cohorts' courses) or Admin to **approve** it before Fellows see it.
- Only **Admins** create, edit, delete and place courses; Trainers edit the modules, lesson files and quizzes of courses placed on cohorts they run, and approve those quizzes.
- Certificates are **issued by an Admin by hand**; the server refuses a course certificate unless every module is complete, and a Fellowship or Advanced certificate unless the academy path is done (Fellow finishes after the number of cohorts the Admin sets, today 2).
- Correct answers show to a Fellow only after a pass (lesson quiz) or after the last try (Trainer exam); after each try they see which answers were right.
- Messages: **Desk mail** = private 1:1 thread Trainer ↔ Fellow. **Written work** = Trainer sets it in the cohort room; Fellow answers on Work; Trainer marks 0–100 with a comment.
  **Feedback comment** = Trainer → Fellow, categories Progress / Improvement / General, read-only for the Fellow. **Cohort note** = Trainer's Announce to the whole cohort.
  **Academy notice** = Admin to every Trainer and Fellow. **Module discussion** = Fellows in the cohort talk on the module page; the Trainer does not see it.
- Approvals: "Approve" / "Decline" (never "sign them in"). After approval, the person sets their own password.
- Inactive desks stay folded under the active list (they are not deleted).
- Copy is short, plain and specific. No slogans, no "the way Canvas and Moodle…", no lorem ipsum, no invented numbers.

## Real data today (use it; anything not here is a [bracketed placeholder])
- Today: Tuesday 27 October 2026.
- Admin: username `admin`. 1 unread notification.
- Trainers (2): **Test Trainer** (`trainer1`, trainer@test.com) on 7 cohorts; **Anthonia Peter** (anthonia@silverleaf.co.tz) on 1 cohort (Climate and Culture). Both approved; last active not recorded.
- Fellows (1): **Amina Teacher** (teacher@test.com, Fellow ID 7110), approved; in **Climate and Culture** (all 3 steps) and **cohort2** (its one step, "Batch One"). Path: 0 of 2 cohorts completed. 1 unread notification.
- Approvals: nobody waiting.
- Cohorts (8): **Climate and Culture** (open, quizzes on; trainers Anthonia Peter and Test Trainer; Step 1 "Culture of Achievemment" [sic, stored typo] with 4 courses; Step 2 "Systems and Procedures" and Step 3 "Rules and Consequences" have no course);
  **cohort2** (no trainer; 1 step "Batch One", no course; 1 Fellow); and six with Test Trainer, 0 Fellows, no steps: Batch 2 — Early years, Batch 3 — Lower primary, Batch 4 — Upper primary, Batch 5 — Literacy, Batch 6 — Numeracy, Batch 7 — Staff practice.
- Courses (4), in cohort order for Climate and Culture: Designs behavior plan (0 modules), Projects strong, calm presence (0), Responds to level of students Engagement (0), Setting clear Expectations (1 module: "Sets clear Expectations", no lesson file).
- Quizzes, Trainer exams, written work, sessions, messages, discussion posts, certificates issued: **none yet**.
- Attendance: 2 marks, both Present, for Amina Teacher in Climate and Culture; trainers not marked; rate 100%.
- Medals (7 kinds): First step, Keeping time, Answering, Quiz pass, Strong progress, Course done, Trainer star. Amina: Climate and Culture 3 of 7 (First step, Keeping time, Trainer star); cohort2 0 of 7.
- Certificate templates: Fellowship, Advanced Level. Signatories: Aloyce Shirima (Senior Manager, Talent Academy) and Nelly Zablon (Director of Schools).
- Cohort room tabs: People, Quizzes, Gradebook, Graduates, Announce, Calendar, Assessments, Import. Admin analytics tabs: Overview, Cohorts, Engagement, Retention, Demographics, Performance, People.
- Menus — Admin: Home, Approvals, People, Cohorts, Attendance, Analytics, Certificates. Trainer: Home, Cohorts, Assessments, Progress, Attendance, Messages, Schedule. Fellow: Home, Learning, Work, Quizzes, Progress, Reflect, Messages, Certificates.

Where a page would be empty on today's data, show the real empty state AND, below it, one "Example state" block (dashed #C9D6EA border, small uppercase label
"EXAMPLE STATE · …", [bracketed] placeholder content) so the board shows how the page looks in use — exactly as `FellowLearning.dc.html` does. Never present
example content as real.

## Accessibility (drawn as built)
Real `<button type="button">`, `<a href>`, `<input>` with `<label for>`, `<select>`, `<textarea>`, `<table>` with `<th scope>`. `aria-label` on icon-only buttons.
Targets ≥44px. Text contrast ≥4.5:1 (the colours above pass). `aria-current="page"` on the current menu item; `aria-labelledby` on sections with headings.

## Report when done
List each file you wrote with its `$preview` height, and any assumption you made. Keep it short.
