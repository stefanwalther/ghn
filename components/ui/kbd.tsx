import { cn } from "@/lib/utils";

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "rounded border border-input bg-background px-1 py-px font-mono text-[10px] leading-4",
        className
      )}
    >
      {children}
    </kbd>
  );
}
