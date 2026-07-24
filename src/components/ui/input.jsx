import * as React from "react"

import { cn } from "@/lib/utils"

// Cast to `any`: this is a thin passthrough wrapper around <input> that
// forwards arbitrary props, so TypeScript's inference (via checkJs) from
// the destructured signature alone is too narrow for real call sites
// across the app — same reasoning as Button/Dialog below.
const Input = /** @type {any} */ (React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    (<input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props} />)
  );
}))
Input.displayName = "Input"

export { Input }
