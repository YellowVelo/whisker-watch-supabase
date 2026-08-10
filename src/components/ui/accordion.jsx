import * as React from "react"
import * as AccordionPrimitive from "@radix-ui/react-accordion"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

const Accordion = AccordionPrimitive.Root

// Design System tokens only (0005 Design System.md, Amendments #2-4) —
// bg-card/border-border for the card shell, text-tier-secondary for the
// 70%-opacity answer tier, no raw hex. min-h-11 on the trigger guarantees
// the locked 44px touch target regardless of question text length; the
// original hover:underline was dropped since this is a touch-first UI
// with no hover state (spec 0051).
// Cast to `any`: thin passthrough wrapper, same reasoning as Checkbox/
// Input/Button — checkJs's inference from the destructured signature
// alone is too narrow for real call sites (e.g. `value`/`children`).
const AccordionItem = /** @type {any} */ (React.forwardRef((/** @type {any} */ { className, ...props }, ref) => (
  <AccordionPrimitive.Item ref={ref} className={cn("border-b border-border last:border-b-0", className)} {...props} />
)))
AccordionItem.displayName = "AccordionItem"

const AccordionTrigger = /** @type {any} */ (React.forwardRef((/** @type {any} */ { className, children, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        "flex flex-1 min-h-11 items-center justify-between gap-3 py-3 text-[15px] font-medium text-white text-left transition-all [&[data-state=open]>svg]:rotate-180",
        className
      )}
      {...props}>
      {children}
      <ChevronDown
        className="h-4 w-4 shrink-0 text-tier-tertiary transition-transform duration-200" />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
)))
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName

const AccordionContent = /** @type {any} */ (React.forwardRef((/** @type {any} */ { className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden text-[15px] text-tier-secondary data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}>
    <div className={cn("pb-4 pt-0 leading-relaxed", className)}>{children}</div>
  </AccordionPrimitive.Content>
)))
AccordionContent.displayName = AccordionPrimitive.Content.displayName

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
