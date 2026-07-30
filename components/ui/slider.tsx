"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("relative flex w-full touch-none select-none items-center", className)}
    {...props}
  >
    {/* A bargraph in discrete cells: 8px blocks with 4px gaps, never a smooth
        bar. A continuous gradient would imply a precision the panel does not
        have. */}
    <SliderPrimitive.Track className="relative h-6 w-full grow overflow-hidden rounded-sm border-2 border-stroke-dim bg-screen-well">
      <SliderPrimitive.Range className="absolute h-full bg-[repeating-linear-gradient(90deg,var(--fill)_0_8px,transparent_8px_12px)] box-glow" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block h-9 w-1.5 -translate-x-px bg-fill-bright box-glow cursor-pointer focus-visible:outline-2 focus-visible:outline-dashed focus-visible:outline-ink-dim focus-visible:outline-offset-[3px] data-[disabled]:pointer-events-none data-[disabled]:bg-ink-faint data-[disabled]:shadow-none" />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }

