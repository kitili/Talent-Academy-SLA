import { TALENT_SIGNATORY_1, TALENT_SIGNATORY_2 } from "./talentCertificate";

export const CERTIFICATE_SIGNERS = {
  left: TALENT_SIGNATORY_1,
  right: TALENT_SIGNATORY_2,
} as const;

export const CERTIFICATE_DESIGNS = {
  fellowship: {
    id: "fellowship",
    label: "Fellowship",
    src: "/cert-fellowship.jpg",
    body: "In recognition of successfully completing the fellowship program, which covered; Culture of Achievement, Lesson Planning, Lesson Delivery, Silverleaf Promises. This included five months of training and one month of full practicum. Congratulations!",
  },
  advanced: {
    id: "advanced",
    label: "Advanced Level",
    src: "/cert-advanced.jpg",
    body: "In recognition of successfully completing the fellowship program, which covered; Culture of Achievement, Lesson Planning, Lesson Delivery, Silverleaf Promises. This included five months of training and one month of full practicum and performed at Advanced Level. Your dedication and hard work have significantly contributed to your success. Congratulations!",
  },
} as const;

export type CertificateDesignId = keyof typeof CERTIFICATE_DESIGNS;
export type CertificateOccasion = "graduation" | "course";

export function isCertificateDesignId(value: string): value is CertificateDesignId {
  return value === "fellowship" || value === "advanced";
}

/** A course certificate names the course and nothing else (D4b): the topic list describes the fellowship, not each course. */
export function courseCompletionBody(courseName: string) {
  return `In recognition of successfully completing ${courseName}. Congratulations!`;
}

/**
 * The refusal a Fellowship or Advanced certificate gets while the academy path is not done (D4). It has the
 * `{ error, code }` shape of C7, but C7's `REFUSALS` has no code for it yet.
 */
export const PATH_INCOMPLETE_REFUSAL = {
  error: "This Fellow has not finished the academy path. Fellowship and Advanced certificates need every cohort the path asks for.",
  code: "PATH_INCOMPLETE",
} as const;

export function wordingForIssue(
  design: CertificateDesignId,
  occasion: CertificateOccasion,
  courseName?: string,
) {
  if (occasion === "course" && courseName) return courseCompletionBody(courseName);
  return CERTIFICATE_DESIGNS[design].body;
}

export function designFromCertificate(cert: { design?: string | null; kind?: string | null }): CertificateDesignId {
  if (isCertificateDesignId(cert.design || "")) return cert.design as CertificateDesignId;
  if (cert.kind === "distinction" || cert.kind === "advanced") return "advanced";
  return "fellowship";
}

export function kindForIssue(design: CertificateDesignId, occasion: CertificateOccasion) {
  if (occasion === "course") return "course";
  return design === "advanced" ? "distinction" : "graduation";
}
