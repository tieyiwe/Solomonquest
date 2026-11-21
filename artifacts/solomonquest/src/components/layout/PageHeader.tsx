import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: ReactNode;
  /** One line under the title explaining the page. */
  description?: ReactNode;
  /** Small icon shown in a tinted tile before the title. */
  icon?: React.ComponentType<{ className?: string }>;
  backHref?: string;
  /** Buttons on the right (stack under the title on phones). */
  actions?: ReactNode;
  /** @deprecated use `actions` */
  action?: ReactNode;
  className?: string;
}

/**
 * Standard page header: title, optional description and actions.
 * Usage: <PageHeader title="Users" description="Manage everyone at your school." actions={<Button>Invite</Button>} />
 */
export default function PageHeader({ title, description, icon: Icon, backHref, actions, action, className }: PageHeaderProps) {
  const right = actions ?? action;
  return (
    <header className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6", className)}>
      <div className="flex items-start gap-3 min-w-0">
        {backHref && (
          <Link
            href={backHref}
            aria-label="Back"
            className="mt-0.5 p-2 -ml-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        {Icon && (
          <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {right && <div className="flex flex-wrap items-center gap-2 shrink-0">{right}</div>}
    </header>
  );
}

export { PageHeader };
