import { TALENT_SIGNATORY_1, TALENT_SIGNATORY_2 } from "@shared/talentCertificate";

type TalentCertificateProps = {
  teacherName: string;
  courseName?: string;
  appreciationText: string;
  kind?: string;
  outstandingAreas?: string | null;
  adminName1?: string | null;
  adminName2?: string | null;
  generatedAt?: string;
};

export function TalentCertificate({
  teacherName,
  courseName,
  appreciationText,
  kind = "graduation",
  outstandingAreas,
  adminName1,
  adminName2,
  generatedAt,
}: TalentCertificateProps) {
  const distinction = kind === "distinction";
  return (
    <div
      className="relative overflow-hidden rounded-sm text-center text-white"
      style={{ background: "#0b1f4a", aspectRatio: "1.414 / 1" }}
      data-testid="talent-certificate"
    >
      <div className="pointer-events-none absolute -left-10 -top-10 h-36 w-36 rounded-full bg-sky-300/80" />
      <div className="pointer-events-none absolute -left-4 top-10 h-24 w-24 rounded-full bg-amber-300/90" />
      <div className="pointer-events-none absolute -bottom-12 -right-8 h-40 w-40 rounded-full bg-sky-300/70" />
      <div className="pointer-events-none absolute bottom-8 -right-6 h-24 w-24 rounded-full bg-amber-300/90" />
      <div className="absolute inset-3 border border-amber-300/80" />
      <div className="relative z-10 flex h-full flex-col items-center justify-between px-10 py-8">
        <div>
          <p className="text-3xl font-light tracking-[0.25em]">Silverleaf</p>
          <p className="text-lg font-semibold tracking-[0.4em]">ACADEMY</p>
          <p className="mt-2 text-xs uppercase tracking-[0.35em] text-amber-200">The Future Starts Here</p>
        </div>
        <div>
          <p className="text-xl font-semibold tracking-[0.2em] text-amber-300">
            {distinction ? "CERTIFICATE OF DISTINCTION" : "CERTIFICATE OF COMPLETION"}
          </p>
          <p className="mt-4 text-sm text-white/80">This certificate is proudly presented to</p>
          <p className="mt-2 font-serif text-4xl text-sky-100" data-testid="text-teacher-name">
            {teacherName}
          </p>
          <div className="mx-auto mt-2 h-px w-2/3 bg-white/70" />
          {courseName && <p className="mt-3 text-sm text-amber-100">{courseName}</p>}
          <p className="mx-auto mt-4 max-w-3xl text-sm leading-relaxed text-white/90">{appreciationText}</p>
          {distinction && outstandingAreas && (
            <p className="mt-3 text-sm text-amber-200">Highest qualification and areas of distinction: {outstandingAreas}</p>
          )}
        </div>
        <div className="grid w-full grid-cols-2 gap-8 pt-4">
          <div>
            <p className="font-serif text-lg italic text-amber-100">{adminName1 || TALENT_SIGNATORY_1.name}</p>
            <p className="text-xs uppercase tracking-wider text-white/70">{TALENT_SIGNATORY_1.title}</p>
          </div>
          <div>
            <p className="font-serif text-lg italic text-amber-100">{adminName2 || TALENT_SIGNATORY_2.name}</p>
            <p className="text-xs uppercase tracking-wider text-white/70">{TALENT_SIGNATORY_2.title}</p>
          </div>
        </div>
        {generatedAt && (
          <p className="text-[10px] text-white/50">
            Awarded {new Date(generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        )}
      </div>
    </div>
  );
}
