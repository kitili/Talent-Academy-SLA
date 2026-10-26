# Admin walkthrough

You run the academy. Trainers coach the Fellows. You decide who those trainers are, which cohorts they run, which courses the academy teaches, and when the whole academy needs one message.

Sign in on the Admin tab. One browser holds one sign-in at a time: signing in as someone else replaces the earlier session. The first visit starts a tour. **Tour** in the header plays it again. The tour points at each control in the top bar, then each name in the side menu, and leaves that control clear so you can read it while the page moves.

## The words this academy uses

| Word | Meaning |
| --- | --- |
| Cohort | A group of Fellows. It can have more than one trainer. |
| Step | One stage inside a cohort. Each cohort has its own list of steps. Steps set the order of the courses. |
| Course | The lessons taught in a step. |
| Module | One part of a course. |
| Lesson file | A file a Fellow reads inside a module. |
| Fellow | A learner in the academy. The code and the database still say `teacher`. |
| Trainer | The academy coach. |

The old words "batch" and "week" for a step and a module still appear in a few admin screens. `shared/academyPath.ts` holds the mapping.

## A. The desk

You land on the admin home. A short line shows trainers and Fellows. If someone is waiting, **Needs attention** opens Approvals. The pictures below open the rest of the academy.

## B. The header

| Control | What it does |
| --- | --- |
| Academy mark | Silverleaf Academy, and the line that says this is the admin desk. |
| Signed-in account | The admin username, so you can see which desk is open. |
| Tour | Replay the walk of the bar and the side menu. |
| Academy notice | On the desk, under the pictures. One note to every approved trainer and every approved Fellow. It lands in the bell. They do not reply inside it. |
| Reset password | On the desk, next to Academy notice. Set a new password for any account. The old password is stored hashed, so you cannot read it. |
| Bell | Notices sent to you. A red number means unread notes. |
| Light and dark | Switches this browser between a light page and a dark page. |
| Logout | Signs this admin account out. |

## C. The side menu and the cards

The side menu stays on the admin pages: Desk, Approvals, People, Cohorts, Attendance, Analytics, and Certificates. Courses have no tab of their own. You add them on Cohorts.

| Card | What you do |
| --- | --- |
| Approvals | People ask for a desk from the sign-in page. Approve them here, or turn them away. They create their own password after you approve. **Export history** downloads every saved approval as a CSV file. |
| People | Trainers and Fellows share this one tab. Create a trainer or a Fellow account, already approved. Open a name to see that account. Inactive desks stay folded below the active ones, and starting the app does not delete them. |
| Cohorts | Add cohorts, steps and courses (section D). Open or close a cohort and its quizzes. |
| Attendance | The attendance list for Fellows and for trainers. |
| Analytics | The gradebook for the whole academy: Fellows, open cohorts, completion, attendance, quizzes, reflections, course ratings, and who is at risk. Module quizzes waiting for approval are on a cohort's quiz list here (section E). |
| Certificates | Issue a certificate to a Fellow (section F). |

## D. The job only you do

A trainer sees only the cohorts you put them on. Until you do that, the trainer's desk stays empty. On **Cohorts**, tick a trainer under **Trainers on this cohort**.

You alone add cohorts, steps and courses.

- **Add cohort** makes a group. Add its steps one after another. The steps follow each other in the order shown, and the arrows move a step earlier or later.
- **Fellows on a step.** Tick a Fellow on a step to put them in that cohort. Saving a step only adds Fellows to the cohort. It never removes one. To take a Fellow out of a cohort, use **Remove** on the cohort's Fellows list (Analytics, or the trainer's Progress tab).
- **Courses.** Add a course in the **Courses** card, then place it on a step. You alone add, rename, publish and delete courses. A trainer cannot. A trainer edits the modules, lesson files and quizzes of the courses that sit on the cohorts they run. Keep a course on draft while you edit it. Fellows see it only once it is published.
- **Course order.** Steps set the order. A course opens for a Fellow when the course before it in step order is complete. Courses on no step follow, in the order they were placed.
- **Cohorts a Fellow must finish.** The academy path counts the cohorts a Fellow finishes. The number defaults to the number of cohorts that exist. There is no screen to change it yet (not shipped); the server accepts a change at `PUT /api/admin/academy-path`.

## E. Quizzes

Every AI-drafted module quiz is saved as unapproved. A Fellow sees a quiz only after a person approves it. You approve any quiz: open Analytics, choose the cohort, and open its **Quizzes** tab. A trainer approves the quizzes of the courses on their own cohorts. The pass mark for a module quiz is 80%. A trainer exam can set its own pass mark, and it defaults to 80%.

A lesson file with no approved quiz does not block a Fellow. It counts as done once the Fellow marks it read. A module with no lesson file counts as done without opening. The trainer desk does not yet list the lesson files that have no approved quiz (not shipped).

## F. Certificates

Certificates are issued by hand, from **Certificates**. Nothing issues automatically (not shipped).

- A **course** certificate needs the Fellow to have completed every module of that course. The server checks this from the Fellow's progress, and refuses with a sentence when the course is not finished.
- A **Fellowship** or **Advanced Level** certificate needs the Fellow to have finished the cohorts the academy path asks for. Advanced Level is also your judgment on top of that.

## G. Start fresh

**Clear previous activity** removes only the areas you tick: cohorts, progress, quizzes, certificates, or notices. Tick the trainers or Fellows it applies to. It does not clear the whole academy, and it does not remove courses or login accounts. Type `CLEAR ACTIVITY` only when you mean it. You stay signed in.

On Cohorts, each cohort has an **Approval history** dropdown. It stays closed until you select it, then it pages the rows already saved for that cohort. **Export** downloads them as a CSV file.

Deleting inactive desks is not an action in the app (not shipped). Starting the app does not delete inactive desks.

## H. A normal week

1. Approve anyone waiting.
2. Confirm each cohort has the right trainer. Close a cohort, or stop its quizzes, when that class should pause.
3. Confirm the course for each step is published and placed on its step, in the order you want.
4. Approve any quiz waiting on a course you run yourself.
5. Send an academy notice only when every desk needs the same sentence.
6. Open Analytics when you need the academy picture, not one cohort.
7. Issue certificates to Fellows who have finished.
8. Open a cohort room when you need to do the trainer's work yourself.
