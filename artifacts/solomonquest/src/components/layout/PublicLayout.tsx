import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [_, setLocation] = useLocation();

  const handleDashboardRedirect = () => {
    if (user?.role === "admin" || user?.role === "super_admin") {
      setLocation("/dashboard/admin");
    } else if (user?.role === "teacher") {
      setLocation("/dashboard/teacher");
    } else if (user?.role === "student" || user?.role === "staff") {
      setLocation("/dashboard/student");
    } else {
      setLocation("/onboarding/join");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex flex-col leading-tight">
            <span className="text-xl font-bold text-primary tracking-tight">SolomonQuest</span>
            <span className="text-[10px] text-muted-foreground tracking-widest uppercase">Powered by TIBLOGICS</span>
          </Link>
          <div className="flex items-center gap-4">
            {!isLoading && (
              <>
                {user ? (
                  <Button onClick={handleDashboardRedirect} variant="default" data-testid="btn-go-to-dashboard">
                    Go to Dashboard
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" asChild data-testid="btn-login">
                      <Link href="/auth/login">Sign In</Link>
                    </Button>
                    <Button asChild data-testid="btn-register">
                      <Link href="/auth/register">Sign Up</Link>
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 flex flex-col">{children}</main>
      <footer className="border-t py-8 bg-card mt-auto">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground space-y-1">
          <div>&copy; {new Date().getFullYear()} SolomonQuest LMS. Crafted for education.</div>
          <div className="text-xs tracking-widest uppercase opacity-60">Powered by TIBLOGICS</div>
        </div>
      </footer>
    </div>
  );
}
