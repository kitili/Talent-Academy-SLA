/**
 * The only accounts that can sign in.
 * A new academy has these desks and no other authentication.
 */
import { TEST_TEACHERS } from "../scripts/test-cohorts";

export const ADMIN_PASSWORD = "admin123";
export const TRAINER_PASSWORD = "trainer123";
export const TEACHER_PASSWORD = "teacher123";

export type TestRole = "admin" | "trainer" | "teacher";

export type TestLogin = {
  username: string;
  email: string;
  role: TestRole;
  password: string;
  firstName: string;
  lastName: string;
  name: string;
};

function staff(
  username: string,
  email: string,
  role: "admin" | "trainer",
  password: string,
  firstName: string,
  lastName: string,
): TestLogin {
  return {
    username,
    email,
    role,
    password,
    firstName,
    lastName,
    name: `${firstName} ${lastName}`.trim(),
  };
}

const trainers: TestLogin[] = [
  staff("trainer1", "trainer@test.com", "trainer", TRAINER_PASSWORD, "Test", "Trainer"),
  staff("test.trainer", "test.trainer@silverleaf.academy", "trainer", TRAINER_PASSWORD, "Test", "Trainer"),
];

for (const number of [2, 3, 4, 5, 6]) {
  trainers.push(
    staff(
      `trainer${number}`,
      `trainer${number}@test.com`,
      "trainer",
      TRAINER_PASSWORD,
      "Test",
      `Trainer ${number}`,
    ),
  );
}

export const TEST_LOGINS: TestLogin[] = [
  staff("admin", "admin@silverleaf.com", "admin", ADMIN_PASSWORD, "Admin", "User"),
  staff("test.admin", "test.admin@silverleaf.academy", "admin", ADMIN_PASSWORD, "Test", "Admin"),
  ...trainers,
  ...TEST_TEACHERS.map((teacher) => {
    const [firstName, ...rest] = teacher.name.split(" ");
    return {
      username: teacher.email,
      email: teacher.email,
      role: "teacher" as const,
      password: TEACHER_PASSWORD,
      firstName: firstName || teacher.name,
      lastName: rest.join(" "),
      name: teacher.name,
    };
  }),
];

export function matchTestLogin(identifier: string, password: string, role?: string): TestLogin | undefined {
  const id = identifier.trim().toLowerCase();
  const wanted = (role || "").trim().toLowerCase();
  if (!id || !password) return undefined;
  return TEST_LOGINS.find((login) => {
    const sameIdentity = login.username.toLowerCase() === id || login.email.toLowerCase() === id;
    if (!sameIdentity || login.password !== password) return false;
    if (wanted === "admin" || wanted === "trainer" || wanted === "teacher") {
      return login.role === wanted;
    }
    return true;
  });
}
