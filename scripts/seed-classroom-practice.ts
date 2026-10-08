/**
 * Adds the Classroom Practice course (3 modules teachers actually use)
 * and assigns it to every existing cohort. Safe to run twice.
 */
import { eq } from "drizzle-orm";
import { db, pool } from "../server/db";
import { batches, batchCourses, courses, quizCache, trainingWeeks, users } from "@shared/schema";

const COURSE_NAME = "Classroom Practice";

const modules = [
  {
    weekNumber: 1,
    competencyFocus: "Lesson planning",
    objective: "1. Name the parts of a lesson plan. 2. Write one clear learning intention. 3. Match an activity to that intention.",
    fileName: "What goes in a lesson plan",
    lessonHtml: `<h2>What goes in a lesson plan</h2>
<p>A lesson plan is a short map for one lesson, not a script you must read aloud.</p>
<ul>
<li><strong>Learning intention</strong> — what pupils should know or do by the end.</li>
<li><strong>Success criteria</strong> — how you and the pupils will know it happened.</li>
<li><strong>Starter</strong> — a two-minute check of what they already know.</li>
<li><strong>Teaching activity</strong> — you model, they try, you look.</li>
<li><strong>Check</strong> — one question or task that shows understanding.</li>
</ul>
<p>Before you teach, say the intention out loud in one sentence. If you cannot, the plan is not ready.</p>`,
    questions: [
      q("q1", "A lesson plan is mainly…", ["A script you must read aloud", "A short map for one lesson", "A list of homework only"], "A short map for one lesson"),
      q("q2", "The learning intention tells you…", ["Which song to sing", "What pupils should know or do by the end", "How long break is"], "What pupils should know or do by the end"),
      q("q3", "Success criteria help you…", ["Know the lesson worked", "Choose the staffroom tea", "Skip the starter"], "Know the lesson worked"),
      q("q4", "The starter should…", ["Last the whole lesson", "Check what pupils already know", "Replace the quiz"], "Check what pupils already know"),
      q("q5", "Before teaching, you should be able to…", ["Say the intention in one sentence", "Print fifty pages", "Skip the check"], "Say the intention in one sentence"),
    ],
  },
  {
    weekNumber: 2,
    competencyFocus: "Classroom routines",
    objective: "1. Set one entry routine. 2. Give instructions in three steps or fewer. 3. Notice who needs support without stopping the class.",
    fileName: "Routines that keep the lesson moving",
    lessonHtml: `<h2>Routines that keep the lesson moving</h2>
<p>A routine is a habit the class does the same way every time, so you spend time teaching instead of repeating yourself.</p>
<ul>
<li><strong>Entry</strong> — books open, date written, one quiet task on the board.</li>
<li><strong>Instructions</strong> — say it, show it, ask one pupil to repeat it.</li>
<li><strong>Attention</strong> — one signal (hand up, clap) and wait until the room is still.</li>
<li><strong>Support</strong> — walk the room. Help the pupil who is stuck, not only the one with a hand up.</li>
</ul>
<p>Pick one routine this week and practise it for three lessons before you add another.</p>`,
    questions: [
      q("r1", "A routine is…", ["A new game every lesson", "A habit the class does the same way", "A punishment"], "A habit the class does the same way"),
      q("r2", "A strong entry routine includes…", ["Books open and one quiet task", "A long lecture first", "Sending pupils outside"], "Books open and one quiet task"),
      q("r3", "Give instructions by…", ["Saying, showing, and one pupil repeating", "Shouting three times", "Writing only on the board"], "Saying, showing, and one pupil repeating"),
      q("r4", "Your attention signal works when…", ["You keep talking over noise", "You wait until the room is still", "Only the front row stops"], "You wait until the room is still"),
      q("r5", "While pupils work, you should…", ["Stay at your desk the whole time", "Walk and help the pupil who is stuck", "Start the next subject"], "Walk and help the pupil who is stuck"),
    ],
  },
  {
    weekNumber: 3,
    competencyFocus: "Checking for understanding",
    objective: "1. Ask a question every pupil can answer. 2. Look at the answers before you move on. 3. Reteach the part most pupils missed.",
    fileName: "How you know they understood",
    lessonHtml: `<h2>How you know they understood</h2>
<p>Finishing the slides is not the same as pupils understanding the idea.</p>
<ul>
<li><strong>Cold check</strong> — every pupil writes an answer, not only the volunteers.</li>
<li><strong>Look</strong> — read a sample before you say “well done, next page”.</li>
<li><strong>Reteach</strong> — if most answers miss the point, teach that part again in a new way.</li>
<li><strong>Exit</strong> — one question at the door. Keep the papers. They are your evidence.</li>
</ul>
<p>Pass this module’s quiz only after you can name the check you will use in your next lesson.</p>`,
    questions: [
      q("c1", "Understanding is shown by…", ["Finishing the slides", "Pupils answering the idea correctly", "A quiet classroom only"], "Pupils answering the idea correctly"),
      q("c2", "A cold check means…", ["Only volunteers answer", "Every pupil writes an answer", "You skip the question"], "Every pupil writes an answer"),
      q("c3", "Before you move on, you should…", ["Look at a sample of answers", "Clap and change topic", "Collect books without reading"], "Look at a sample of answers"),
      q("c4", "If most pupils miss the point…", ["Reteach that part another way", "Give more homework only", "Ignore it"], "Reteach that part another way"),
      q("c5", "An exit question is…", ["One question as they leave, kept as evidence", "A joke", "The register"], "One question as they leave, kept as evidence"),
    ],
  },
];

function q(id: string, question: string, options: string[], correctAnswer: string) {
  return { id, question, type: "multiple_choice" as const, options, correctAnswer };
}

async function main() {
  await pool.query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS objectives text`);
  await pool.query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS publish_status varchar NOT NULL DEFAULT 'published'`);

  const [admin] = await db.select().from(users).where(eq(users.role, "admin")).limit(1);
  if (!admin) throw new Error("No admin user found. Create one before seeding modules.");

  let [course] = await db.select().from(courses).where(eq(courses.name, COURSE_NAME)).limit(1);
  if (!course) {
    [course] = await db.insert(courses).values({
      name: COURSE_NAME,
      description: "Three short modules for teachers: plan a lesson, run a routine, and check that pupils understood.",
      objectives: "Plan one lesson, run one classroom routine, and check understanding before moving on.",
      publishStatus: "published",
      orderIndex: 1,
    }).returning();
    console.log("created course", course.id);
  } else {
    console.log("course already exists", course.id);
  }

  const allBatches = await db.select().from(batches);
  for (const batch of allBatches) {
    const existing = await db.select().from(batchCourses).where(eq(batchCourses.batchId, batch.id));
    if (existing.some((row) => row.courseId === course.id)) continue;
    await db.insert(batchCourses).values({
      batchId: batch.id,
      courseId: course.id,
      assignedBy: admin.id,
    });
    console.log("assigned course to batch", batch.name || batch.id);
  }

  for (const mod of modules) {
    const weeks = await db.select().from(trainingWeeks).where(eq(trainingWeeks.courseId, course.id));
    let week = weeks.find((row) => row.weekNumber === mod.weekNumber);
    const fileId = `classroom-practice-m${mod.weekNumber}`;
    const deckFile = {
      id: fileId,
      fileName: mod.fileName,
      fileUrl: `lesson://${fileId}`,
      fileSize: mod.lessonHtml.length,
      lessonHtml: mod.lessonHtml,
    };
    if (!week) {
      [week] = await db.insert(trainingWeeks).values({
        courseId: course.id,
        weekNumber: mod.weekNumber,
        competencyFocus: mod.competencyFocus,
        objective: mod.objective,
        deckFiles: [deckFile],
      }).returning();
      console.log("created module", mod.weekNumber);
    } else {
      console.log("module exists", mod.weekNumber);
    }

    const cached = await db.select().from(quizCache).where(eq(quizCache.deckFileId, fileId)).limit(1);
    if (!cached[0]) {
      await db.insert(quizCache).values({
        weekId: week.id,
        deckFileId: fileId,
        questions: mod.questions,
        approved: true,
        approvedAt: new Date(),
      });
      console.log("quiz ready for module", mod.weekNumber);
    }
  }

  console.log("Classroom Practice is ready.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
