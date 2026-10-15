import * as React from "react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  checked?: boolean;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      aria-checked={checked}
      className={cn(
        "h-4 w-4 shrink-0 cursor-pointer rounded-sm border border-input bg-background transition-colors duration-150 accent-[var(--primary)] hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
