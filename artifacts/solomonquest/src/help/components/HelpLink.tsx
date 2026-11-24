import { Link, useLocation } from "wouter";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Contextual "?" link that opens a Help Center guide (/help/<slug>) and
 * remembers where the viewer came from, so the guide can offer a way back.
 */
export function HelpLink({ slug, label = "How this page works", className }: { slug: string; label?: string; className?: string }) {
  const [location] = useLocation();
  const href = `/help/${slug}?from=${encodeURIComponent(location)}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          aria-label={`Help: ${label}`}
          data-testid={`help-link-${slug}`}
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/50 bg-gold/10 text-foreground/80 transition-colors hover:bg-gold/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <HelpCircle className="h-4 w-4" />
        </Link>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
