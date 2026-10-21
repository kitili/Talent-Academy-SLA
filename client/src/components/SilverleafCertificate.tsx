import {
  CERTIFICATE_DESIGNS,
  designFromCertificate,
  type CertificateDesignId,
} from "@shared/certificateDesigns";

export function SilverleafCertificate({
  design,
  name,
  body,
  kind,
}: {
  design?: CertificateDesignId | string | null;
  kind?: string | null;
  name?: string;
  body?: string;
}) {
  const designId = designFromCertificate({ design, kind });
  const template = CERTIFICATE_DESIGNS[designId];
  const shownBody = body || template.body;
  return (
    <div
      className="relative w-full overflow-hidden rounded-lg bg-[#0d2454] shadow-lg"
      style={{ aspectRatio: "1024 / 723" }}
      data-testid="silverleaf-certificate"
      data-design={designId}
    >
      <img src={template.src} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute left-[9%] right-[9%] top-[37%] bottom-[24%] bg-[#0d2454]" />
      <div className="absolute left-[11%] right-[11%] top-[38%] text-center">
        <p className="text-[clamp(0.7rem,1.6vw,1rem)] text-white/90">This certificate is proudly presented to</p>
        <p
          className="mt-2 min-h-[1.4em] font-serif italic text-[#9eb6d8]"
          style={{ fontSize: "clamp(1.15rem, 3.1vw, 2.15rem)", lineHeight: 1.15 }}
          data-testid="text-certificate-name"
        >
          {name?.trim() || "\u00a0"}
        </p>
        <div className="mx-auto mt-1 h-[2px] w-[58%] bg-[#c9a84c]/90" />
        <p
          className="mx-auto mt-3 max-w-[92%] text-[clamp(0.56rem,1.22vw,0.9rem)] leading-snug text-white/95"
          data-testid="text-certificate-body"
        >
          {shownBody}
        </p>
      </div>
    </div>
  );
}
