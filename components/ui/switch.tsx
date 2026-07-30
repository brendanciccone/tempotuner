"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  // A two-position switch: a boxed track and a block thumb that jumps. Never
  // rely on the thumb alone to say "this is live" — a monochrome panel has no
  // colour to carry that, so pair it with literal ON / OFF text.
  <SwitchPrimitives.Root
    className={cn(
      "peer relative inline-flex h-7 w-16 shrink-0 cursor-pointer items-center rounded-sm border-2 border-stroke bg-transparent",
      "focus-visible:outline-2 focus-visible:outline-dashed focus-visible:outline-ink-dim focus-visible:outline-offset-[3px]",
      "disabled:cursor-not-allowed disabled:border-stroke-dim",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-[18px] w-[26px] translate-x-[3px] bg-ink-faint",
        "data-[state=checked]:translate-x-[31px] data-[state=checked]:bg-fill data-[state=checked]:box-glow",
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }

