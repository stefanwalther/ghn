import * as React from "react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  checked?: boolean;
  indeterminate?: boolean;
}

function setRef<T>(ref: React.ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, indeterminate, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement>(null);
    React.useEffect(() => {
      if (innerRef.current) innerRef.current.indeterminate = indeterminate === true;
    }, [indeterminate]);
    return (
      <input
        ref={(node) => {
          innerRef.current = node;
          setRef(ref, node);
        }}
        type="checkbox"
        checked={checked}
        aria-checked={indeterminate ? "mixed" : undefined}
        className={cn(
          "h-4 w-4 shrink-0 cursor-pointer rounded-sm border border-input bg-background transition-colors duration-150 accent-[var(--primary)] hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    );
  }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
