/** Short encouragements for a trainer. None of these describe the software. */
export const ENCOURAGEMENT_LEADS = [
  "You make it safe for a teacher to try again.",
  "Your patience is a lesson on its own.",
  "Somebody in your care will stand taller because of today.",
  "The way you listen teaches more than a long speech.",
  "You turn a nervous start into a real beginning.",
  "A teacher borrows your calm when their own runs thin.",
  "You notice the effort that others walk past.",
  "Your steady presence tells them they belong.",
  "Kind correction from you still feels like respect.",
  "You help a hard skill feel possible.",
  "The time you give a struggling teacher is never wasted.",
  "You remind them why they chose this work.",
  "Your example is the lesson they will copy.",
  "You make room for the question they were afraid to ask.",
  "A small well done from you can carry someone all week.",
  "You hold the standard and the kindness together.",
  "Teachers learn courage by watching you stay.",
  "You see a future teacher before they can see it.",
  "Your welcome at the start changes the whole hour.",
  "You keep faith with people who are still learning.",
  "The care you show becomes the care they show a class.",
  "You make practice feel honourable.",
  "A teacher will remember that you did not rush them.",
  "You bring warmth into a serious day's work.",
  "Your attention tells a quiet teacher they were seen.",
  "You help them trust their own voice.",
  "Showing up prepared is a gift you keep giving.",
  "You turn a mistake into the next useful step.",
  "Your belief in them is already doing its work.",
  "You make the room feel like a place of hope.",
  "A patient explanation from you unlocks a stuck morning.",
  "You honour the adults who came here to grow.",
  "Your joy in their progress is contagious.",
  "You keep the work human when the day is full.",
  "Teachers rest easier because you are fair.",
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
  "Give the next teacher that same chance.",
  "Small faithfulness changes a life.",
  "They are learning how to treat their own pupils.",
  "Keep your voice gentle and your aim clear.",
  "Today's patience becomes tomorrow's skill.",
  "You have already helped someone begin.",
  "Let the work be shared, not heavy.",
  "A calm guide makes brave teachers.",
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

function pairAt(index: number) {
  const lead = ENCOURAGEMENT_LEADS[Math.floor(index / ENCOURAGEMENT_FOLLOWS.length) % ENCOURAGEMENT_LEADS.length];
  const follow = ENCOURAGEMENT_FOLLOWS[index % ENCOURAGEMENT_FOLLOWS.length];
  return `${lead} ${follow}`;
}

/**
 * The attempt-th fresh line for this trainer on this day.
 * Attempt 0 is stable when the used list is unchanged.
 * Lines already stored are skipped, so another trainer or another day cannot receive the same words.
 */
export function encouragementCandidate(
  input: { trainerId: string; day: string; used: string[] },
  attempt: number,
) {
  const used = new Set(input.used);
  const singles = [...ENCOURAGEMENT_LEADS, ...ENCOURAGEMENT_FOLLOWS].filter((line) => !used.has(line));
  if (attempt < singles.length) {
    const start = encouragementHash(`${input.trainerId}|${input.day}`) % singles.length;
    return singles[(start + attempt) % singles.length];
  }

  const pairStart = encouragementHash(`${input.trainerId}|${input.day}|pair`);
  const space = ENCOURAGEMENT_LEADS.length * ENCOURAGEMENT_FOLLOWS.length;
  let seen = 0;
  const need = attempt - singles.length;
  for (let step = 0; step < space; step += 1) {
    const text = pairAt((pairStart + step) % space);
    if (used.has(text)) continue;
    if (seen === need) return text;
    seen += 1;
  }

  const extra = encouragementHash(`${input.trainerId}|${input.day}|${attempt}`);
  return `${pairAt(extra)} ${CLOSERS[attempt % CLOSERS.length]}`;
}
