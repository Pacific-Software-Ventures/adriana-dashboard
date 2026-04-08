import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-[transform,box-shadow,background-color,border-color,color,opacity] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline-2 focus-visible:outline-ocean focus-visible:outline-offset-2 focus-visible:ring-4 focus-visible:ring-ocean/20 aria-invalid:ring-destructive/20 aria-invalid:border-destructive cursor-pointer active:scale-[0.96] will-change-transform relative overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[0_1px_3px_rgba(30,56,101,0.08),0_4px_12px_rgba(30,56,101,0.05)] hover:bg-primary/90 hover:shadow-[0_4px_16px_rgba(30,56,101,0.12),0_8px_24px_rgba(30,56,101,0.08),0_0_0_3px_rgba(15,158,154,0.1)] hover:-translate-y-1 before:absolute before:inset-0 before:bg-gradient-to-r before:from-white/0 before:via-white/10 before:to-white/0 before:translate-x-[-100%] hover:before:translate-x-[100%] before:transition-transform before:duration-700",
        destructive:
          "bg-destructive text-white shadow-sm hover:bg-destructive/90 hover:shadow-lg hover:-translate-y-1 focus-visible:ring-destructive/20",
        outline:
          "border border-navy/20 bg-transparent shadow-sm hover:bg-ocean/5 hover:border-ocean/40 hover:text-ocean hover:shadow-md hover:-translate-y-0.5 text-navy",
        secondary:
          "bg-cloud text-navy shadow-sm hover:bg-silver/40 hover:shadow-md hover:-translate-y-0.5",
        ghost:
          "text-navy hover:bg-navy/5 hover:text-ocean hover:scale-105",
        link: "text-ocean underline-offset-4 hover:underline decoration-ocean/50 hover:decoration-ocean transition-colors",
        premium:
          "bg-gradient-to-r from-ocean to-[#0dbdb8] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_3px_rgba(15,158,154,0.2),0_4px_12px_rgba(15,158,154,0.15)] hover:from-ocean/90 hover:to-[#0dbdb8]/90 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_16px_rgba(15,158,154,0.3),0_8px_24px_rgba(15,158,154,0.2),0_0_0_3px_rgba(15,158,154,0.15)] hover:-translate-y-1 before:absolute before:inset-0 before:bg-gradient-to-r before:from-white/0 before:via-white/15 before:to-white/0 before:translate-x-[-100%] hover:before:translate-x-[100%] before:transition-transform before:duration-700",
      },
      size: {
        default: "h-10 px-5 py-2 has-[>svg]:px-4",
        sm: "h-9 rounded-lg gap-1.5 px-4 has-[>svg]:px-3 text-xs",
        lg: "h-12 rounded-xl px-8 has-[>svg]:px-6 text-base",
        xl: "h-14 rounded-2xl px-10 has-[>svg]:px-8 text-lg",
        icon: "size-10 rounded-xl",
        "icon-sm": "size-9 rounded-lg",
        "icon-lg": "size-12 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
