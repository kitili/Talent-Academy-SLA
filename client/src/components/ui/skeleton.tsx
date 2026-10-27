import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("motion-safe:animate-pulse rounded-md bg-sl-neutral-soft", className)}
      {...props}
    />
  )
}

export { Skeleton }
