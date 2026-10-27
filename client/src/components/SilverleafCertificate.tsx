import {
  CERTIFICATE_DESIGNS,
  designFromCertificate,
  type CertificateDesignId,
} from "@shared/certificateDesigns";

/** The navy of both template images; the panel over the printed sample name must match it exactly. */
const TEMPLATE_NAVY = "#002367";

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
  // Sizes are in cqw (percent of the certificate's width) so the wording fits the panel at any size, and
  // print-color-adjust keeps the panel when "Download PDF" prints without background graphics.
  return (
    <div
      className="relative w-full overflow-hidden rounded-lg shadow-lg [container-type:inline-size] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]"
      style={{ aspectRatio: "1024 / 723", backgroundColor: TEMPLATE_NAVY }}
      data-testid="silverleaf-certificate"
      data-design={designId}
    >
      <img src={template.src} alt="" className="absolute inset-0 h-full w-full object-cover" />
      {/* Covers the sample name and wording printed on the template; stops above its heading and the signatures. */}
      <div className="absolute left-[9%] right-[9%] top-[41.5%] bottom-[27%]" style={{ backgroundColor: TEMPLATE_NAVY }} />
      <div className="absolute left-[11%] right-[11%] top-[42.5%] text-center">
        <p className="leading-snug text-white/90" style={{ fontSize: "1.9cqw" }}>This certificate is proudly presented to</p>
        <p
          className="mt-[0.6cqw] min-h-[1.15em] font-serif italic text-[#9eb6d8]"
          style={{ fontSize: "4cqw", lineHeight: 1.15 }}
          data-testid="text-certificate-name"
        >
          {name?.trim() || " "}
        </p>
        <div className="mx-auto mt-[0.5cqw] h-[2px] w-[58%] bg-[#c9a84c]/90" />
        <p
          className="mx-auto mt-[1.2cqw] max-w-[92%] leading-snug text-white/95"
          style={{ fontSize: "1.5cqw" }}
          data-testid="text-certificate-body"
        >
          {shownBody}
        </p>
      </div>
    </div>
  );
}
