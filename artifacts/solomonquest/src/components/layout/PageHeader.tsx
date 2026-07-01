import { ArrowLeft, Menu } from "lucide-react";
import { Link } from "wouter";
import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  backHref?: string;
  action?: ReactNode;
}

export default function PageHeader({ title, backHref, action }: PageHeaderProps) {
  return (
    <header className="md:hidden flex items-center gap-3 px-4 h-14 border-b border-border bg-background">
      {backHref ? (
        <Link href={backHref}>
          <a className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5 text-foreground" />
            <span className="sr-only">Back</span>
          </a>
        </Link>
      ) : (
        <button className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors">
          <Menu className="h-5 w-5 text-foreground" />
          <span className="sr-only">Menu</span>
        </button>
      )}

      <h1 className="flex-1 text-base font-semibold text-foreground truncate">{title}</h1>

      {action && <div className="ml-auto">{action}</div>}
    </header>
  );
}
