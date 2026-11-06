/** Short encouragements for a trainer. None of these describe the software. */
export const ENCOURAGEMENT_LEADS = [
  "You make it safe for a Fellow to try again.",
  "Your patience is a lesson on its own.",
  "Somebody in your care will stand taller because of today.",
  "The way you listen teaches more than a long speech.",
  "You turn a nervous start into a real beginning.",
  "A Fellow borrows your calm when their own runs thin.",
  "You notice the effort that others walk past.",
  "Your steady presence tells them they belong.",
  "Kind correction from you still feels like respect.",
  "You help a hard skill feel possible.",
  "The time you give a struggling Fellow is never wasted.",
  "You remind them why they chose this work.",
  "Your example is the lesson they will copy.",
  "You make room for the question they were afraid to ask.",
  "A small well done from you can carry someone all week.",
  "You hold the standard and the kindness together.",
  "Fellows learn courage by watching you stay.",
  "You see a future teacher before they can see it.",
  "Your welcome at the start changes the whole hour.",
  "You keep faith with people who are still learning.",
  "The care you show becomes the care they show a class.",
  "You make practice feel honourable.",
  "A Fellow will remember that you did not rush them.",
  "You bring warmth into a serious day's work.",
  "Your attention tells a quiet Fellow they were seen.",
  "You help them trust their own voice.",
  "Showing up prepared is a gift you keep giving.",
  "You turn a mistake into the next useful step.",
  "Your belief in them is already doing its work.",
  "You make the room feel like a place of hope.",
  "A patient explanation from you unlocks a stuck morning.",
  "You honour the adults who came here to grow.",
  "Your joy in their progress is contagious.",
  "You keep the work human when the day is full.",
  "Fellows rest easier because you are fair.",
  "You are building people, and that outlasts a lesson.",
];

export const ENCOURAGEMENT_FOLLOWS = [
  "Let that be enough for today.",
  "Carry that into the next conversation.",
  "They will pass this on.",
  "Stay with that generosity.",
  "One person at a time is still a full day's work.",
  "You do not have to be loud to be remembered.",
  "Keep offering the same welcome.",
  "That kindness has a long reach.",
  "Trust the slow growth you are tending.",
  "Leave them proud of the step they took.",
  "Your steadiness is the point.",
  "Let them feel it before you say it.",
  "This is how a good school is made.",
  "Hold that hope and keep going.",
  "You are allowed to be proud of this.",
  "The room is warmer because you are in it.",
  "Give the next Fellow that same chance.",
  "Small faithfulness changes a life.",
  "They are learning how to treat their own pupils.",
  "Keep your voice gentle and your aim clear.",
  "Today's patience becomes tomorrow's skill.",
  "You have already helped someone begin.",
  "Let the work be shared, not heavy.",
  "A calm guide makes brave Fellows.",
  "Stay curious about what they are trying.",
  "Your care is part of their training.",
  "Celebrate the attempt, not only the finish.",
  "You are planting something that will leaf out.",
  "Keep the door open a little longer.",
  "That is the work that lasts.",
  "Offer the next step, then give them time.",
  "Your fairness is its own encouragement.",
  "Somebody needed exactly this from you.",
  "Rest your shoulders. The good you did remains.",
  "Walk them forward without walking over them.",
  "Leave the room better than you found it.",
];

export type DailyRole = "admin" | "trainer" | "fellow";

const ADMIN_LEADS = [
  "The academy runs well because someone keeps the details honest.",
  "Every Fellow who finds their place has a quiet planner behind them.",
  "You make room for good teaching to happen.",
  "Careful work behind the scenes is a form of care.",
  "A clear decision from you saves a trainer a long afternoon.",
  "You keep the whole picture so others can keep their focus.",
  "The way you lead sets the tone for everyone who teaches here.",
  "You are building a school that will outlast this year.",
  "Fair treatment of every person is the foundation you keep laying.",
  "You listen to trainers and Fellows alike, and both feel it.",
  "Your patience with a long list is patience with real people.",
  "You turn a hundred small tasks into one steady academy.",
  "A teacher in a distant classroom is better prepared because of your work.",
  "You hold the standard without losing the warmth.",
  "Trust is built in the ordinary decisions you make each day.",
  "You keep faith with the mission when the week is crowded.",
  "People are learning to teach well because you made the way clear.",
  "Your attention to the small things protects the big ones.",
  "You make it possible for others to do their best work.",
  "Leading a teacher academy is slow, honourable work.",
  "You notice who is struggling before they have to say so.",
  "Good order from you gives everyone else room to grow.",
  "The calm you bring to a busy day spreads through the whole team.",
  "You are shaping the teachers who will shape their pupils.",
  "A fair answer from you can settle a worried mind.",
  "You carry more than most people see, and you carry it well.",
  "Each Fellow who completes the course is a result of your steady hand.",
  "You keep the door open for people who are still finding their feet.",
  "Your honesty with the team makes it safe to speak up.",
  "You remember that every record stands for a real person.",
  "The standard you hold is a promise to every child these teachers will meet.",
  "You take responsibility so others can take initiative.",
  "Thoughtful leadership is quiet, and you practise it daily.",
  "You make hard choices with the whole community in mind.",
  "A kind word from you reaches further than you know.",
  "You are teaching the team how to care by the way you lead.",
  "Your steadiness gives trainers the courage to try new things.",
  "You help the academy keep its word to the people it serves.",
  "Work that nobody applauds is still shaping a country's classrooms.",
  "You build the structure in which learning feels possible.",
  "You treat every Fellow as someone worth the effort.",
  "Your careful planning gives the coming weeks their shape.",
];

const ADMIN_FOLLOWS = [
  "Take a breath, then take the next step.",
  "Let the good you have done be counted today.",
  "The academy is stronger for it.",
  "Rest in knowing it matters.",
  "Keep going at a pace you can hold.",
  "Small steady care adds up to something large.",
  "You are allowed to be proud of the work.",
  "Share the load when it grows heavy.",
  "Lead with the same patience tomorrow.",
  "Your effort is seen, even when it is quiet.",
  "Keep the standard and keep the kindness.",
  "Give yourself the credit you give others.",
  "Good schools are made of days like this one.",
  "Trust the long view.",
  "Let each decision be one you can stand behind.",
  "There is no need to rush what should be done well.",
  "The people you serve are better for your care.",
  "Hold on to why this work began.",
  "One clear step is enough for now.",
  "Be as gentle with yourself as you are with others.",
  "What you build here will be used for years.",
  "Stay curious about what the team needs.",
  "Ask for help when you need it, and give it freely.",
  "Courage and patience will carry the week.",
  "Every careful choice is a gift to someone.",
  "Keep your judgement steady and your heart open.",
  "The work is worth the weight.",
  "Another day of faithful service is a good day.",
  "Plant the next seed, and trust it to grow.",
  "Walk with your team, not ahead of them.",
  "Let your example do the speaking.",
  "Finish what matters and forgive what does not.",
  "You do not have to carry it alone.",
  "Fairness is its own kind of strength.",
  "The future classroom is closer because of you.",
  "Honour the effort of those you lead.",
  "A calm leader makes a brave team.",
  "Keep listening, and keep deciding well.",
  "This is how an academy earns trust.",
  "Let tomorrow begin from a settled mind.",
  "Hold your course, and hold your people close.",
];

const FELLOW_LEADS = [
  "Every lesson you finish brings you closer to your own classroom.",
  "You came here to learn, and that already says something good about you.",
  "Your pupils are lucky to be getting a teacher who keeps learning.",
  "Asking a question is how every good teacher begins.",
  "A small step taken today is worth more than a big plan left for tomorrow.",
  "You are becoming the teacher you once needed.",
  "It is fine to find this hard, because hard things are worth learning.",
  "Your effort this week is quietly shaping a child's year.",
  "Every mistake you make now is one your pupils will be spared.",
  "You are not behind, you are on your way.",
  "The patience you practise here you will pass on to a whole class.",
  "Teaching is a craft, and you are building yours one day at a time.",
  "Somewhere a child is waiting for exactly the teacher you are becoming.",
  "You have more to offer than you believe today.",
  "Learning with others makes the road shorter.",
  "Your voice in the room matters, even when it shakes.",
  "Showing up on a tired day is real courage.",
  "You are growing, even on the days it does not feel like it.",
  "A good teacher stays a good learner, and you already are one.",
  "What you practise today will feel natural by the end of term.",
  "Your classmates are learning alongside you, not racing against you.",
  "Each task you finish is proof that you can.",
  "The care you give your own learning is the care you will give your pupils.",
  "You do not need to be perfect to be a wonderful teacher.",
  "Your questions make the whole group wiser.",
  "Today's effort is a gift to your future class.",
  "You are part of a community of people who want children to learn.",
  "Every great teacher was once a nervous beginner.",
  "Your trainers believe in you, and so can you.",
  "The work you are doing has a purpose far beyond this week.",
  "A kind word to a fellow learner costs nothing and gives a lot.",
  "You are building something that cannot be taken from you.",
  "Courage looks like trying again after a hard day.",
  "Your own curiosity is the best lesson plan you have.",
  "You are allowed to take your time and still arrive.",
  "Learning to teach is learning to be patient, and you are practising both.",
  "The effort you put in now will be felt in a classroom you have not yet met.",
  "You are closer than you were yesterday.",
  "Honest practice is how skill grows, and you are practising.",
  "The children you teach will carry something of you for a lifetime.",
  "Your progress may be quiet, but it is real.",
  "You are doing something good for people you have not yet met.",
];

const FELLOW_FOLLOWS = [
  "Keep going, one page at a time.",
  "Be kind to yourself on the slow days.",
  "You have everything you need to begin.",
  "Rest well and come back ready.",
  "Ask the question, and let the answer help you grow.",
  "Small steps still count as steps.",
  "Take heart, the road is worth it.",
  "Share what you learn with someone near you.",
  "Trust the process and trust yourself.",
  "Your effort will not be wasted.",
  "Let curiosity lead you today.",
  "Try once more, a little differently.",
  "There is no hurry to be perfect.",
  "Celebrate what you finished, however small.",
  "The best is still ahead of you.",
  "Stay close to people who encourage you.",
  "Keep your reasons for teaching in sight.",
  "Proud work begins with an honest try.",
  "You are further along than you think.",
  "Learn with your whole heart.",
  "Give yourself credit for showing up.",
  "Practise a little, and practise often.",
  "One good day is enough to build on.",
  "Let the children you will teach inspire you.",
  "Be brave in the next lesson.",
  "Breathe, and begin again.",
  "Every effort plants something that will grow.",
  "You can do hard things, and you have before.",
  "Carry your hope with you into class.",
  "Lean on your group when the going is heavy.",
  "Make today count in your own way.",
  "Stay patient, and the skill will come.",
  "You belong here.",
  "Learning is its own reward, and it is yours.",
  "Walk forward at your own pace.",
  "Hold your head up, you are on the right path.",
  "Let each new idea settle before the next.",
  "Keep faith with the teacher you are becoming.",
  "Gentle persistence wins in the end.",
  "Go well, and go on.",
  "Your future class is cheering for you.",
];

/** Daily lines by role, written by hand. The Trainer's are the original lists above. */
export const DAILY_LINES: Record<DailyRole, { leads: readonly string[]; follows: readonly string[] }> = {
  admin: { leads: ADMIN_LEADS, follows: ADMIN_FOLLOWS },
  trainer: { leads: ENCOURAGEMENT_LEADS, follows: ENCOURAGEMENT_FOLLOWS },
  fellow: { leads: FELLOW_LEADS, follows: FELLOW_FOLLOWS },
};

const CLOSERS = [
  "Take heart.",
  "You are doing good work.",
  "Keep your kindness close.",
  "This day counts.",
  "They are glad you came.",
  "Go gently, and go on.",
];

export function encouragementHash(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Calendar day in Dar es Salaam, so the line changes at local midnight. */
export function hallDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Dar_es_Salaam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Anything that is not an Admin or a Fellow gets the Trainer's lines. */
export function dailyRole(role: string | undefined | null): DailyRole {
  return role === "admin" || role === "fellow" ? role : "trainer";
}

type RoleLines = { leads: readonly string[]; follows: readonly string[] };

function pairAt(lines: RoleLines, index: number) {
  const lead = lines.leads[Math.floor(index / lines.follows.length) % lines.leads.length];
  const follow = lines.follows[index % lines.follows.length];
  return `${lead} ${follow}`;
}

/**
 * The attempt-th fresh line for this person on this day, from the lists of their role.
 * The role defaults to the Trainer, whose output for the same input is unchanged.
 * Attempt 0 is stable when the used list is unchanged.
 * Lines already stored are skipped, so another person or another day cannot receive the same words.
 */
export function encouragementCandidate(
  input: { trainerId: string; day: string; used: string[]; role?: DailyRole },
  attempt: number,
) {
  const lines = DAILY_LINES[input.role ?? "trainer"];
  const used = new Set(input.used);
  const singles = [...lines.leads, ...lines.follows].filter((line) => !used.has(line));
  if (attempt < singles.length) {
    const start = encouragementHash(`${input.trainerId}|${input.day}`) % singles.length;
    return singles[(start + attempt) % singles.length];
  }

  const pairStart = encouragementHash(`${input.trainerId}|${input.day}|pair`);
  const space = lines.leads.length * lines.follows.length;
  let seen = 0;
  const need = attempt - singles.length;
  for (let step = 0; step < space; step += 1) {
    const text = pairAt(lines, (pairStart + step) % space);
    if (used.has(text)) continue;
    if (seen === need) return text;
    seen += 1;
  }

  const extra = encouragementHash(`${input.trainerId}|${input.day}|${attempt}`);
  // Every pair is used too: add a closer, and keep looking until the words are new.
  for (let k = 0; ; k += 1) {
    const text = `${pairAt(lines, (extra + k) % space)} ${CLOSERS[(attempt + k) % CLOSERS.length]}`;
    if (!used.has(text) || k >= space * CLOSERS.length) return text;
  }
}
