import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// tailwind-merge knows Tailwind's stock scale, not this theme's custom @theme
// tokens — so it read `text-micro` as a text COLOUR and dropped it whenever a
// real colour class followed in the same cn() call. That silently rendered
// SelectLabel at body size instead of 10px. Registering the token in the
// font-size group puts it in the right conflict class.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": ["text-micro"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
