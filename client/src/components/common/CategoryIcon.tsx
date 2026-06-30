import { getIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface CategoryIconProps {
  icon?: string | null;
  color?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm: "h-8 w-8 [&_svg]:h-4 [&_svg]:w-4",
  md: "h-10 w-10 [&_svg]:h-5 [&_svg]:w-5",
  lg: "h-12 w-12 [&_svg]:h-6 [&_svg]:w-6",
};

/** Rounded colored chip with a lucide icon, tinted by the category/account color. */
export function CategoryIcon({ icon, color = "#64748B", size = "md", className }: CategoryIconProps) {
  const Icon = getIcon(icon);
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center rounded-full", sizes[size], className)}
      style={{ backgroundColor: `${color}1f`, color }}
      aria-hidden
    >
      <Icon />
    </span>
  );
}
