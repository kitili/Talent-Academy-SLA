type NamedPerson = {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  email?: string | null;
};

const ROLE_WORDS = new Set(["admin", "trainer", "teacher", "test", "user"]);

function tidy(value?: string | null) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function titleWord(word: string) {
  if (!word) return "";
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function wordsFromHandle(handle: string) {
  return handle
    .replace(/@.*$/, "")
    .replace(/[._-]+/g, " ")
    .replace(/\d+/g, " ")
    .split(/\s+/)
    .map(titleWord)
    .filter(Boolean);
}

function fromHandle(handle: string) {
  const words = wordsFromHandle(handle);
  if (!words.length) return "";
  const personal = words.filter((word) => !ROLE_WORDS.has(word.toLowerCase()));
  if (personal.length) return personal.slice(0, 3).join(" ");
  if (words.length === 1 && ROLE_WORDS.has(words[0].toLowerCase())) return "";
  return words.slice(0, 3).join(" ");
}

/** A person's name for hellos and the header. Login handles are only a last resort. */
export function deskName(person: NamedPerson) {
  const given = [tidy(person.firstName), tidy(person.lastName)].filter(Boolean).join(" ");
  if (given) return given;

  const personal = tidy(person.name);
  if (personal && !personal.includes("@")) return personal;

  return (
    fromHandle(tidy(person.username))
    || fromHandle(tidy(person.email))
    || titleWord(tidy(person.username || person.email).split("@")[0].replace(/\d+/g, ""))
    || "Silverleaf"
  );
}

/** Name on the wall mark. Role logins become Silverleaf so the wall never says admin. */
export function wallLabel(person: NamedPerson) {
  const given = [tidy(person.firstName), tidy(person.lastName)].filter(Boolean).join(" ");
  if (given) return given;

  const personal = tidy(person.name);
  if (personal && !personal.includes("@")) return personal;

  return fromHandle(tidy(person.username)) || fromHandle(tidy(person.email)) || "Silverleaf";
}
