import { useAuth } from "@/hooks/use-auth";
import { kindLabelOf, ownKindLabel } from "@/lib/personKind";

const CHIP = "inline-flex items-center rounded-full bg-sl-neutral-soft px-2.5 py-0.5 text-[13px] font-medium text-sl-neutral";

/** A kind drawn as a chip: for lists, where the kind belongs to the row's person. Nothing when the kind is unknown. */
export function KindChip({ role, kind }: { role: "teacher" | "trainer"; kind?: string }) {
  const label = kindLabelOf(role, kind);
  if (!label) return null;
  return <span className={CHIP} data-testid="chip-kind">{label}</span>;
}

/** The signed-in person's own kind (for example "Pre-service Fellow"). Nothing for an Admin. */
export function KindBadge() {
  const { user } = useAuth();
  const label = ownKindLabel(user);
  if (!label) return null;
  const who = user?.role === "teacher" ? "Fellow" : "Trainer";
  return <span className={CHIP} data-testid="badge-own-kind">{label} {who}</span>;
}
