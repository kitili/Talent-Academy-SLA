export const TALENT_SIGNATORY_1 = { name: "Aloyce Shirima", title: "Senior Manager, Talent Academy" };
export const TALENT_SIGNATORY_2 = { name: "Nelly Zablon", title: "Director of Schools" };

export function fellowshipAreasLine(areas: string[], courseName: string) {
  const clean = areas.map((area) => area.trim()).filter(Boolean);
  const listed = clean.length ? clean.join(", ") : courseName;
  return `In recognition of successfully completing the fellowship program, which covered ${listed}. This included the full training path and practicum.`;
}

export function graduationAppreciation(areas: string[], courseName: string) {
  return `${fellowshipAreasLine(areas, courseName)} Congratulations!`;
}

export function distinctionAppreciation(areas: string[], courseName: string, outstanding: string[]) {
  const strengths = outstanding.length ? outstanding.join(", ") : areas.slice(0, 3).join(", ") || courseName;
  return `${fellowshipAreasLine(areas, courseName)} This fellow performed at Advanced Level, with distinction in ${strengths}. Your dedication and hard work have significantly contributed to your success. Congratulations!`;
}
