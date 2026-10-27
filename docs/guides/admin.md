# Admin walkthrough

You run the academy. Trainers coach the Fellows. You decide who those trainers are, which cohorts they run, which courses the academy teaches, and when the whole academy needs one message.

Sign in on the Admin tab. One browser holds one sign-in at a time: signing in as someone else replaces the earlier session. The first visit starts a tour. **Help** in the header plays it again (it is on Home). The tour points at each control in the header, then each name in the side menu, then the parts of Home, and leaves that control clear so you can read it while the page moves.

## The words this academy uses

| Word | Meaning |
| --- | --- |
| Cohort | A group of Fellows. It can have more than one trainer. |
| Step | One stage inside a cohort. Each cohort has its own list of steps. Steps set the order of the courses. |
| Course | The lessons taught in a step. |
| Module | One part of a course. |
| Lesson file | A file a Fellow reads inside a module. |
| Session | One meeting of a cohort on the calendar (a trainer adds it under Schedule). It is not attendance. |
| Attendance mark | Present, late, absent or excused for one person, one cohort, one day. It is tied to a date, not to a session. |
| Fellow | A learner in the academy. The code and the database still say `teacher`. |
| Trainer | The academy coach. |

The old words "batch", "week" and "teacher" (for a cohort or step, a module, and a Fellow) live in the code, the database and some web addresses, such as `/trainer/batches`. They do not appear on the pages. `shared/academyPath.ts` holds the mapping.

## A. Home

You land on Home, under the date, with an **Add a cohort** button. Top to bottom:

- **Needs attention.** One row for each thing you can fix, with one button on the row. The rows are:
  - a cohort with no trainer (**Assign a trainer**; these come first);
  - a cohort with a step that holds no course (**Place a course**);
  - Fellows or trainers waiting for a desk (**Review approvals**).

  When there are none, it says so.
- **The academy at a glance.** Fellows, trainers, open cohorts, courses, and attendance.
- **Tools.** **Send an academy notice**, **Reset a password**, and **Export approval history** (section B).
- **Start fresh.** A separate box, outlined in red (section G).

## B. The frame: header, side menu, and Home tools

Every admin page has the same frame.

| Control | What it does |
| --- | --- |
| Logo, "Silverleaf Academy" and the **Admin** pill | The mark, and the pill that says this is the Admin desk. |
| **Help** | Replay the tour of the header, the side menu and Home. It is on Home only; the other admin pages have no tour. |
| Bell | Notices sent to you. A blue number means unread notes. An academy notice you send also reaches the bell of everyone it goes to. |
| Light and dark | Switches this browser between a light page and a dark page. |
| Your name | The account that is signed in, so you can see which desk is open. |
| **Log out** | Signs this admin account out. |

The side menu runs down the left of the page. On a narrower screen it moves above the page. On a phone it becomes a bottom bar with four items (Home, Approvals, People, Cohorts) and **More**, which opens Attendance, Analytics and Certificates. On a phone the header shows your initials instead of your name; tap them for Help, the light and dark switch, and Log out.

Three tools sit on Home, under **Tools**:

| Tool | What it does |
| --- | --- |
| Send an academy notice | One note to every approved trainer and every approved Fellow. It lands in the bell. They do not reply inside it. |
| Reset a password | Set a new password for any account, by username or email. The old password is stored hashed, so you cannot read it. The same action is on each person's page (**Reset password…**). |
| Export approval history | Downloads every saved approval as a CSV file. |

## C. The side menu

The side menu has seven names: Home, Approvals, People, Cohorts, Attendance, Analytics, and Certificates. Courses are a tab of Cohorts.

| Name | What you do |
| --- | --- |
| Home | What needs attention, the academy at a glance, the tools, and Start fresh (section A). |
| Approvals | People ask for a desk from the sign-in page. They wait under **Trainers waiting** or **Fellows waiting**. **Approve** them, or **Decline…**. They create their own password after you approve. **Recent decisions** lists what you decided, and **Export approval history** downloads it. |
| People | Trainers and Fellows share this one page, on two tabs. **Add a trainer** or **Add a Fellow** creates an account that is already approved. Open a name to see that account; there you can **Reset password…**, and on a Fellow's page **More actions** holds **Edit details…** and **Remove Fellow…**. Inactive desks stay folded under **Inactive desks**, and starting the app does not delete them. |
| Cohorts | Two tabs, **Cohorts** and **Courses**. Add cohorts, steps and courses, and place courses on steps (section D). |
| Attendance | Mark Fellows and trainers for a day. Choose who, the person, the cohort, the date (today is filled in) and present, late, absent or excused, then **Save**. **Recent marks** lists them with their date, cohort and status, and **By cohort** adds up the marks. |
| Analytics | The gradebook for the whole academy. Tabs: Overview, Cohorts, Engagement, Retention, Demographics, Performance, People. It covers Fellows, open cohorts, completion, attendance, quizzes, reflections, course ratings, and who is at risk. It does not list the to-dos; a line at the top points to Home. A cohort's quiz list, with the quizzes waiting for approval, is under Cohorts, in that cohort's **Quizzes** tab (section E). |
| Certificates | See who is ready, then issue a certificate (section F). |

## D. The job only you do

A trainer sees only the cohorts you put them on. Until you do that, the trainer's Home and Cohorts stay empty. On **Cohorts**, open the cohort, choose **Change trainers**, and tick each trainer who runs it. Each tick is saved at once.

You alone add cohorts, steps and courses.

- **Add a cohort** (name, description, Primary or Secondary track) makes a group. **Add a step** adds its steps one after another. The steps follow each other in the order shown. Each step has a menu with **Move earlier**, **Move later**, **Edit step** and **Remove step…**.
- **Cohort actions.** Each cohort has **Open cohort room** and **Edit details**. **More actions** holds **Stop quizzes** (or **Open quizzes**), **Close cohort** (or **Open cohort**) and **Delete cohort…**.
- **Fellows in a cohort.** Choose **Manage the roster**, then tick a Fellow on a step to put them in that cohort. Ticking a Fellow also adds them to the cohort. Unticking takes them off that step only; they stay in the cohort. To take a Fellow out of a cohort, use **Remove** on the cohort's Fellows list (Analytics, Cohorts, open the cohort, Fellows tab), or **Remove from cohort…** on the trainer's Cohorts page.
- **Courses.** On the **Courses** tab, add a course in **New course** (a name and what it teaches). On the Cohorts tab, use **Place a course** on a step; the **×** beside a placed course takes it off the step. You alone add, rename and delete courses (**Edit details**, **Delete course…**). A trainer cannot. A trainer edits the modules, lesson files and quizzes of the courses that sit on the cohorts they run. A course you add is published at once. A course marked **Draft** is hidden from Fellows, but no screen sets or clears Draft (not shipped).
- **Course order.** Steps set the order. A course opens for a Fellow when the course before it in step order is complete. Courses on no step follow, in the order they were placed.
- **Cohorts a Fellow must finish.** The academy path counts the cohorts a Fellow finishes. Each cohort shows **Finishing**: "A Fellow finishes after N cohorts", with **Change**. The number is for the whole academy and defaults to the number of cohorts that exist.

## E. Quizzes

Every AI-drafted module quiz is saved as unapproved. A Fellow sees a quiz only after a person approves it. You approve any quiz: open Analytics, then Cohorts, choose the cohort, and open its **Quizzes** tab. A trainer approves the quizzes of the courses on their own cohorts. The pass mark for a module quiz is 80%. A trainer exam can set its own pass mark, and it defaults to 80%. On Cohorts, a cohort's **Quiz list** lets you stop or open an assigned quiz.

A lesson file with no approved quiz does not block a Fellow. It counts as done once the Fellow marks it read. A module with no lesson file counts as done without opening, so it never holds a Fellow up. A course needs at least one lesson file before it can be complete, so a course with no lesson files cannot be marked complete or earn a certificate. The trainer desk does not yet list the lesson files that have no approved quiz (not shipped).

## F. Certificates

Certificates are issued by hand, from **Certificates**. Nothing issues automatically (not shipped). The page has three parts, in this order.

- **Who is ready.** The server works out, from each Fellow's progress, who can be certified. Each ready row has **Issue…**, which fills the form below. Fellows who are not ready show a "Not ready" tag and the reason.
- **Issue a certificate.** Choose the Fellow, the kind (Course certificate, Fellowship or Advanced Level), and for a course certificate the course. Beside the form is the real certificate on its template, with the Fellow's name filled in. **Issue certificate** issues it, and **Print / save PDF** prints it. A refusal appears as a sentence under the form.
- **Issued.** Every certificate issued so far.

The rules:

- A **course** certificate needs the Fellow to have completed every module of that course. The server checks this from the Fellow's progress, and refuses with a sentence when the course is not finished.
- A **Fellowship** or **Advanced Level** certificate needs the Fellow to have finished the cohorts the academy path asks for. Advanced Level is also your judgment on top of that.

## G. Start fresh

**Start fresh** is its own box on Home. **Clear previous activity…** removes only the areas you tick: cohorts, progress, quizzes, certificates, or notices. Tick the trainers or Fellows it applies to. It does not clear the whole academy, and it does not remove courses or login accounts. Type `CLEAR ACTIVITY` only when you mean it. You stay signed in.

On Cohorts, the bottom of each cohort has a **Cohort records** dropdown. It stays closed until you choose **Approval history**, then it pages the rows already saved for that cohort. **Export approval history** downloads them as a CSV file.

Deleting inactive desks is not an action in the app (not shipped). Starting the app does not delete inactive desks.

## H. A normal week

1. Open Home. Work down **Needs attention**: approve anyone waiting, give each cohort a trainer, and place a course on each empty step.
2. Close a cohort, or stop its quizzes, when that cohort should pause (Cohorts, **More actions**).
3. Confirm the course for each step is placed on its step, in the order you want.
4. Approve any quiz waiting on a course you run yourself.
5. Send an academy notice only when every desk needs the same sentence.
6. Open Analytics when you need the academy picture, not one cohort.
7. Open Certificates, and issue to Fellows who are ready.
8. Open a cohort room when you need to do the trainer's work yourself.
