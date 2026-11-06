# Online exam platform: research for plan item 11

Status: research only, nothing chosen. Written 2026-11-06. Every web page below was read on 2026-11-06.

The client asked (transcript 03:08) whether the academy can create, find, or link to a platform "like the ones that run online exams" where Fellows sit exams.

## Recommendation (read this first)

1. **Do not buy or embed a platform yet.** Ask the client the questions at the end first. Most of the gap is closed by small additions here.
2. **Smallest first step: add a whole-exam timer and autosave to the exam the app already has** (build route, about 3 to 5 days, no new vendor, no new data leaving Tanzania). This covers "sit an exam online" for ordinary assessments.
3. **Only if the client says the exams are high-stakes and need proctoring**, link out to one external tool and enter results by CSV. ClassMarker (browser-based monitoring, runs on phones) is the shortest path to try, on its free trial. Moodle is the heavier, longer-term choice.

## 1. What the app does today (read from the code and docs)

Sources: `docs/guides/trainer.md`, `docs/academy-desk/README.md`, `client/src/pages/teacher-exam.tsx`, `client/src/components/QuizRunner.tsx`, `server/quizDelivery.ts`, `shared/trainerDesk.ts`, `shared/schema.ts`, `client/public/sw.js`.

Already there:
- **Three kinds of assessed work.** Quizzes (checkpoint and file quizzes: multiple choice, true/false, open answer), paper exams (a PDF or image the Trainer uploads, `paperUrl`), and written exams the Trainer writes in the app.
- **Attempts and marks.** Three tries, 80% pass mark unless the exam sets its own. Trainer can reset attempts. Open answers are marked Pass or Fail by hand.
- **Deadlines.** After the deadline the submit button goes and the server refuses answers with 410; work already handed in stays visible.
- **Who sits it.** Whole cohort or ticked Fellows.
- **Shuffling.** `quizDelivery.ts` shuffles question and option order.
- **Per-question timers.** `QuizRunner.tsx` counts down per question (`timeLimit`, 30 s default, 180 s for open answers).
- **Phone shell.** A web manifest and a service worker cache the page shell and an offline page.

Missing for a proper online sitting ("missing" means I found no code for it):

| Gap | Today |
|---|---|
| Whole-exam timer (for example 90 minutes) | Only per-question timers. No exam-level clock or auto-submit. |
| Autosave and resume after a dropped connection | The service worker caches the shell only. I found no saving of draft answers. |
| Question bank and random draw | Shuffle exists; drawing 20 from a bank of 100 does not. |
| Lockdown or proctoring | None: no tab-switch detection, no camera, no locked browser. |
| Identity check | Login only. Nothing confirms who is sitting. |
| Large cohort at one start time | Not tested. Vercel and Neon can scale, but there is no load test. |
| Start window (opens 09:00, closes 09:30) | Only a due date. |

## 2. Three routes

### A. Build the missing pieces here (recommended first)
- **Cost:** staff time only. My rough sizes: exam timer with auto-submit and autosave 3 to 5 days; start window 1 to 2 days; question bank with random draw 3 to 5 days; tab-leave logging (a flag, not a block) 1 to 2 days. Full proctoring (camera, ID) is not worth building: weeks of work and a privacy burden.
- **Accounts:** none new. Fellows already have logins.
- **Data protection:** data stays in the app's own database. No new third party.
- **Phones and poor connections:** we control this. Autosave and resume are the key fix.
- **Limit:** integrity is "logged and reviewable", not enforced.

### B. Link out to an external platform
Fellows leave the app, sit the exam elsewhere, and the Trainer brings the mark back.
- **How the result comes back:** (1) the Trainer types the mark in; (2) CSV import into the gradebook (the cohort room already imports rosters, so a marks import is a modest addition, 2 to 3 days); (3) LTI grade return, which needs both sides to speak LTI 1.3. Our app does not, and building it is large (weeks), so I would not do it.
- **Products checked:**
  - **ClassMarker** (hosted). Its price page lists Professional 1 (up to 400 credits a month), Professional 2 (up to 1,000), Enterprise on request, and credit packs valid 12 months. **The page shows no dollar amounts.** A third-party listing (SaaSworthy, last updated 2022) gave $19.95 and $79.95 a month; I treat that as stale. Camera monitoring costs 10 credits per attempt. The site says it works on mobile, tablet and desktop, and its Monitor option does tab-switch detection, camera, face detection and optional ID card in the browser. A 30-day free trial is reported by third-party listings. Sources: https://www.classmarker.com/online-testing/price/ , https://www.classmarker.com/ , https://www.saasworthy.com/product/classmarker/pricing
  - **TestInvite** (hosted). Annual plans: Starter $900, Essential $1,900, Advanced $2,900, Pro $3,900, Premium $6,000, Premium+ $35,000. Credits are per candidate per test ($0.90 down to $0.20 in bulk); photo proctoring adds 3 credits, video 8, lockdown browser 2. Source: https://testinvite.com/pricing . Likely above a small academy's budget unless the client funds it.
  - **Google Forms quiz with locked mode.** Free with Google Workspace for Education. **Locked mode works only on managed Chromebooks**; other devices cannot open the quiz. Fellows on their own phones cannot use it. Source: https://blog.google/products-and-platforms/products/education/get-quizzing-locked-mode-and-grade-away-classroom/ . A plain Google Form without locked mode works on any phone but has no lockdown, and each Fellow needs a Google account.
  - **Moodle quiz** (see C).
  - **ExamSoft, Proctorio:** not read. Both are sold to institutions by quote and are built for large university programmes. Not verified; I would not pursue them for this client.
- **Accounts for Fellows:** ClassMarker and TestInvite appear to send a link or code per candidate; I did not test whether Fellows need their own sign-up.
- **Weakness of any link-out:** two places to log in, marks keyed back, and names must match.

### C. Embed or host one
- **Moodle** is the realistic full platform. The software is free to self-host; MoodleCloud is the hosted version. The MoodleCloud page I read names Medium and Standard plans and a free starter trial but **gives no plan prices or user limits**; a custom domain add-on is $160 AUD a year on Medium. Search results quoted $160 USD a year for 50 users and $410 and $940 plans from third-party blogs, which I could not confirm. MoodleCloud does not allow your own plugins. Sources: https://moodle.com/solutions/moodlecloud/ , https://www.wooclap.com/en/blog/moodle-pricing/
  - **Offline on phones:** the Moodle app can attempt a quiz offline and sync later, but only if the quiz has **no time limit**, uses deferred feedback, and has no network address rule. A timed exam and offline sitting cannot be combined. Source: https://docs.moodle.org/503/en/Moodle_Mobile_quiz_offline_attempts
  - **Lockdown:** Safe Exam Browser is free. Its overview page lists Windows, macOS and iOS; I saw no Android or Chromebook entry. Most Android-phone Fellows would not get lockdown. Sources: https://safeexambrowser.org/about_overview_en.html , https://docs.moodle.org/38/en/Safe_Exam_Browser
  - **LTI:** Moodle can publish a course or activity as an LTI 1.3 tool and return grades (Assignment and Grade Services), but our app is not an LTI platform, so there is nothing to launch it from. Source: https://docs.moodle.org/503/en/Publish_as_LTI_tool
  - **Embedding in an iframe:** my reasoning, not verified with a vendor: the Fellow has two sign-ins and lockdown tools do not work inside a frame. I would not choose this.
  - Running Moodle means a server, updates and a person to support it: months, not days.

### Data protection (all three routes)
Tanzania's Personal Data Protection Act 2022 (in force 1 May 2023) allows sending personal data abroad only to countries with adequate protection or under stated conditions such as consent, and a law-firm summary says the controller must apply to the Personal Data Protection Commission for approval. Photos, video and ID cards from proctoring are personal data, and ClassMarker and TestInvite hold data outside Tanzania. Sources: https://www.clydeco.com/en/insights/2024/10/cross-border-personal-data-transfers , https://www.afriwise.com/blog/legal-and-compliance-requirements-for-cross-border-personal-data-transfers-under-tanzanias-personal-data-protection-framework . I read search summaries only, not the Act, so confirm with a Tanzanian lawyer. ClassMarker states GDPR and CCPA compliance and offers a data protection agreement; that does not by itself satisfy the Tanzanian rule. The app already stores Fellow data on Neon, so check that region too.

### Side by side

| | A. Build here | B. Link out | C. Moodle |
|---|---|---|---|
| Money | none | ClassMarker unconfirmed; TestInvite from $900 a year | free self-hosted; hosted price unconfirmed |
| Proctoring | logging only | yes, browser based | SEB, not seen for Android |
| Phones | we decide | ClassMarker says yes | offline only if untimed |
| Data leaves Tanzania | no new | yes | yes if hosted abroad |
| Effort | days | days plus marks import | months |

## 3. Questions only the client can answer
1. How high-stakes are these exams: do they decide a pass, a certificate or a job, or are they checkpoints?
2. Is proctoring required, and by whom? Does an authority or funder require a named system?
3. How many Fellows sit at once, and where: a venue with computers, or their own phones at home?
4. What devices and data do they have; is offline sitting needed?
5. Is there a budget for a licence, and a person to run it?
6. Must exam data stay in Tanzania?

## What I could not verify
- Current ClassMarker dollar prices (vendor page shows none), MoodleCloud plan prices and limits, and any ExamSoft or Proctorio price or terms.
- Whether ClassMarker or TestInvite work well on slow mobile data in Tanzania; I found no source and did not test.
- The exact Tanzanian approval steps for sending data abroad (secondary sources differ).
- Whether Safe Exam Browser has an Android version (the page read did not list one).
- This app's behaviour with a large cohort sitting at once.
