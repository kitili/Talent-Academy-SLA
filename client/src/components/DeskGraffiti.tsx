import { useAuth } from "@/hooks/use-auth";
import logoMark from "@assets/Screenshot 2025-10-14 214034_1761029433045.png";

/** Username for the wall. Emails keep the part before @ so the tag stays short. */
function wallName(user: { username?: string | null; email?: string | null }) {
  const username = (user.username || "").trim();
  const handle = username.includes("@") ? username.split("@")[0] : username;
  if (handle) return handle;
  const local = (user.email || "").split("@")[0]?.trim();
  return local || "Silverleaf";
}

/** The navy square drops out; the leaf is the watermark. */
function LogoWash({
  className,
  color,
  blend,
}: {
  className?: string;
  color: string;
  blend: "screen" | "multiply";
}) {
  const mask = `url("${logoMark}")`;
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        backgroundColor: color,
        mixBlendMode: blend,
        WebkitMaskImage: mask,
        maskImage: mask,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        maskMode: "luminance",
      }}
    />
  );
}

function WallTag({
  name,
  className,
  color,
  blend,
  opacity,
}: {
  name: string;
  className: string;
  color: string;
  blend: "screen" | "multiply";
  opacity: number;
}) {
  return (
    <p
      className={className}
      style={{
        writingMode: "vertical-rl",
        fontFamily: '"Segoe Print", "Comic Sans MS", "Marker Felt", cursive',
        fontSize: "clamp(0.7rem, 3.2vw, 2.05rem)",
        letterSpacing: "0.32em",
        color,
        mixBlendMode: blend,
        opacity,
      }}
    >
      {name}
    </p>
  );
}

/** Faint silver-leaf mark and the signed-in name, sitting on the photo behind the desks. */
export function DeskGraffiti() {
  const { user } = useAuth();
  if (!user) return null;
  const name = wallName(user as { username?: string | null; email?: string | null });
  const left = "absolute left-[1vw] top-[34vh] max-h-[58vh] select-none overflow-hidden";
  const right = "absolute right-[1vw] top-[16vh] max-h-[52vh] select-none overflow-hidden";
  const leafLeft = "absolute left-[1vw] top-[12vh] h-[7.2vw] w-[7.2vw] max-h-[120px] max-w-[120px]";
  const leafRight = "absolute bottom-[8vh] right-[1vw] h-[6.2vw] w-[6.2vw] max-h-[104px] max-w-[104px] rotate-[8deg]";

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true" data-testid="desk-graffiti">
      <LogoWash className={leafLeft} color="#f7f9fc" blend="screen" />
      <LogoWash className={`${leafLeft} opacity-80`} color="#16315f" blend="multiply" />
      <LogoWash className={leafRight} color="#f7f9fc" blend="screen" />
      <LogoWash className={`${leafRight} opacity-70`} color="#16315f" blend="multiply" />
      <WallTag name={name} className={left} color="#ffffff" blend="screen" opacity={0.72} />
      <WallTag name={name} className={left} color="#16315f" blend="multiply" opacity={0.55} />
      <WallTag name={name} className={right} color="#ffffff" blend="screen" opacity={0.62} />
      <WallTag name={name} className={right} color="#16315f" blend="multiply" opacity={0.45} />
    </div>
  );
}
