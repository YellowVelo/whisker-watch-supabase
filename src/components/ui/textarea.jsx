import * as React from "react"

import { cn } from "@/lib/utils"

// Cast to `any`: thin passthrough wrapper around <textarea> — same
// checkJs-inference reasoning as Button/Input (see button.jsx).
const Textarea = /** @type {any} */ (React.forwardRef((/** @type {any} */ { className, ...props }, ref) => {
  return (
    (<textarea
      className={cn(
        "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props} />)
  );
}))
Textarea.displayName = "Textarea"

export { Textarea }
