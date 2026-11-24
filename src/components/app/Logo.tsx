import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8", className)}>
      <rect x="1" y="1" width="30" height="30" rx="9" className="fill-primary" />
      <rect x="7" y="9" width="18" height="15" rx="3.5" className="fill-none stroke-primary-foreground" strokeWidth="2" />
      <path d="M11 6.5v4M21 6.5v4" className="stroke-primary-foreground" strokeWidth="2" strokeLinecap="round" />
      <path d="M11.5 16.5c1.2 2 2.7 3 4.5 3s3.3-1 4.5-3" className="fill-none stroke-sidebar-primary" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className={cn("font-display text-lg font-bold tracking-tight", inverted ? "text-sidebar-accent-foreground" : "text-foreground")}>
        Agenda Sorriso
      </span>
    </span>
  );
}
