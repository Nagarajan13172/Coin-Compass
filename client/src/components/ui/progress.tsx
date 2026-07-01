import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    indicatorClassName?: string;
    /** When set, hovering the bar reveals this content (e.g. exact spent/remaining). */
    tooltip?: React.ReactNode;
  }
>(({ className, value, indicatorClassName, tooltip, ...props }, ref) => {
  const bar = (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-secondary", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn("h-full w-full flex-1 bg-primary transition-all duration-500", indicatorClassName)}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );

  if (!tooltip) return bar;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{bar}</TooltipTrigger>
      <TooltipContent className="text-xs">{tooltip}</TooltipContent>
    </Tooltip>
  );
});
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
