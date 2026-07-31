import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// tailwind-merge knows Tailwind's stock scale, not this theme's custom @theme
// tokens — so it read `text-micro` as a text COLOUR and dropped it whenever a
// real colour class followed in the same cn() call. That silently rendered
// SelectLabel at body size instead of 10px. Registering the token in the
// font-size group puts it in the right conflict class.
//
// The tracking tokens are the same hazard one property over: unregistered,
// tailwind-merge matches none of its groups, so two of them survive a merge
// together and CSS source order picks the winner instead of call order. Every
// custom scale this theme adds has to be declared here, not just the one that
// was caught rendering wrong.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": ["text-micro"],
      tracking: ["tracking-display", "tracking-body", "tracking-micro"],
    },
  },
})

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs))
