import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/** Text contracts: no test here draws a screen, so these prove each rule is written in the component that holds it. */
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const source = (path: string) => readFileSync(join(root, path), "utf8");

const page = source("client/src/pages/admin-messages.tsx");
const trainerMessages = source("client/src/components/TrainerMessages.tsx");
const deskMail = source("client/src/components/DeskMail.tsx");

describe("the Admin's Messages page", () => {
  it("reads the Admin-only list and writes through DeskMail", () => {
    assert.match(page, /queryKey: \["\/api\/admin\/desk-peers"\]/);
    assert.match(page, /<DeskMail /);
  });

  it("groups by Trainers and Fellows and searches by name", () => {
    assert.match(page, /title="Trainers" people=\{found\.filter\(\(person\) => person\.role === "trainer"\)\}/);
    assert.match(page, /title="Fellows" people=\{found\.filter\(\(person\) => person\.role === "teacher"\)\}/);
    assert.match(page, /filterByQuery\(peers, search/);
  });

  it("shows skeleton rows while loading and a plain empty state after", () => {
    assert.match(page, /isLoading \? \(\r?\n\s+<SkeletonRows /);
    assert.match(page, /No approved Trainers or Fellows yet\./);
  });

  it("never says teacher on screen", () => {
    const words = page.replace(/"teacher"/g, "").replace(/role === /g, "");
    assert.equal(/teacher/i.test(words), false);
  });
});

describe("a Trainer finds and answers the Admin", () => {
  it("lists the Admins who have a thread with them, beside their Fellows", () => {
    assert.match(trainerMessages, /queryKey: \["\/api\/trainer\/admin-threads"\]/);
    assert.match(trainerMessages, /adminThreads\.map\(\(admin\) =>/);
  });

  it("opens the Admin's thread with the Admin's role, so a reply is addressed to an Admin", () => {
    assert.match(trainerMessages, /adminThreads\.find\(\(admin\) => admin\.id === adminPeerId\)/);
    assert.match(trainerMessages, /role: "teacher" \} : null\)/);
    assert.match(trainerMessages, /<DeskMail key=\{peer\?\.id \?\? "none"\} peer=\{peer\}/);
  });

  it("returns to a Fellow when one is picked", () => {
    assert.match(trainerMessages, /setAdminPeerId\(null\);\r?\n\s+onPick\(teacher\.id\);/);
  });

  it("reaches an Admin's thread even with no Fellows in the cohort", () => {
    assert.match(trainerMessages, /\|\| adminThreads\[0\]/);
  });
});

describe("a desk-mail thread", () => {
  it("tells mine from theirs by id, not by a name two people could share", () => {
    assert.match(deskMail, /const mine = item\.fromId !== peer\.id;/);
    assert.equal(/fromName === selfLabel/.test(deskMail), false);
  });

  it("never shows the word a Fellow's rows store, and keeps a staff sender's own name", () => {
    assert.match(deskMail, /const sender = mine \? selfLabel : item\.fromRole === "teacher" \? peer\.name : item\.fromName;/);
    assert.match(deskMail, />\{sender\}<\/p>/);
  });

  it("fetches again when opened, so a reply shows without a reload", () => {
    assert.match(deskMail, /queryKey: \["\/api\/desk-messages", peer\?\.id\],[\s\S]*?staleTime: 0,/);
  });

  it("says so when a message did not send", () => {
    assert.match(deskMail, /send\.isError && <p role="alert"/);
  });

  it("starts empty for each person, on both the Admin's and the Trainer's page", () => {
    assert.match(page, /<DeskMail key=\{peer\?\.id \?\? "none"\}/);
    assert.match(trainerMessages, /<DeskMail key=\{peer\?\.id \?\? "none"\}/);
  });
});
