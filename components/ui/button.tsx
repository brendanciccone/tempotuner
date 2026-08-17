import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// The soft key. Press snaps straight to inverse video — a screen being redrawn
// has no in-between frames — and only the release relaxes, on the phosphor
// tail carried by .ac-lamp. No easing is declared here: the direction of the
// edge decides the duration, which a Tailwind transition class cannot express.
const buttonVariants = cva(
  cn(
    "ac-lamp inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border-2 uppercase tracking-body cursor-pointer",
    "focus:outline-none focus-visible:outline-2 focus-visible:outline-dashed focus-visible:outline-ink-dim focus-visible:outline-offset-[3px]",
    "disabled:pointer-events-none disabled:text-ink-faint disabled:border-stroke-dim disabled:bg-transparent disabled:text-glow-none disabled:shadow-none",
  ),
  {
    variants: {
      variant: {
        // Inverse video. Ration it: two or three filled surfaces per screen.
        default: "border-fill bg-fill text-on-fill box-glow hover:bg-fill-bright hover:border-fill-bright",
        // The alarm key — the loudest thing the panel has.
        destructive: "border-fill-bright bg-fill-bright text-on-fill box-glow",
        outline:
          "border-stroke bg-transparent text-ink text-glow hover:text-ink-bright hover:border-ink-bright hover:box-glow active:bg-fill active:text-on-fill active:text-glow-none",
        // Dim never glows — glow is the signal of energization.
        secondary: "border-stroke-dim bg-transparent text-ink-faint",
        ghost:
          "border-transparent bg-transparent text-ink hover:text-ink-bright active:bg-fill active:text-on-fill",
        link: "border-transparent text-ink-bright underline underline-offset-[3px]",
      },
      size: {
        // 44px is the hit-target floor and this panel is touched with a finger.
        default: "h-11 px-6 text-base",
        sm: "h-11 px-4 text-sm rounded-sm",
        lg: "h-14 px-7 text-xl",
        icon: "h-11 w-11 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
