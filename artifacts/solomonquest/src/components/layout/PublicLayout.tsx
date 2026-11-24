import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";

import { BrandSymbol, BrandTile } from "@/components/brand/BrandMark";
export function PublicLayout({ children, showFeatured = false }: { children: React.ReactNode; showFeatured?: boolean }) {
  const { user, isLoading } = useAuth();
  const [_, setLocation] = useLocation();

  const handleDashboardRedirect = () => {
    if (user?.role === "admin" || user?.role === "super_admin") {
      setLocation("/dashboard/admin");
    } else if (user?.role === "teacher") {
      setLocation("/dashboard/teacher");
    } else if (user?.role === "student" || user?.role === "staff") {
      setLocation("/dashboard/student");
    } else if (user?.role === "parent") {
      // Parents used to fall through to /onboarding/join (find a school).
      setLocation("/dashboard/parent");
    } else {
      setLocation("/onboarding/join");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <header className="border-b border-border/70 bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/75 sticky top-0 z-30 pt-[env(safe-area-inset-top,0px)]">
        <div className="container mx-auto max-w-6xl px-5 sm:px-6 h-16 md:h-[72px] flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-3 min-w-0 rounded-md">
            <BrandTile className="h-9 w-9" rounded="rounded-xl" />
            <span className="flex flex-col leading-none min-w-0">
              <span className="font-serif text-xl sm:text-[1.4rem] font-semibold text-foreground tracking-tight truncate">SolomonQuest</span>
              <span className="hidden sm:block mt-1 text-[7.5px] text-muted-foreground tracking-[0.25em] uppercase">Powered by TIBLOGICS</span>
            </span>
          </Link>
          {/* On the home page, phones get these actions in the bottom bar instead. */}
          <div className={`items-center gap-2 sm:gap-3 shrink-0 ${showFeatured ? "hidden sm:flex" : "flex"}`}>
            {!isLoading && (
              <>
                {user ? (
                  <Button onClick={handleDashboardRedirect} variant="default" data-testid="btn-go-to-dashboard">
                    Go to Dashboard
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" asChild data-testid="btn-login" className="px-2.5 sm:px-4">
                      <Link href="/auth/login">Sign In</Link>
                    </Button>
                    <Button asChild data-testid="btn-register" className="px-3 sm:px-4">
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
      {showFeatured && !isLoading && (
        <div className="sm:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 pb-[env(safe-area-inset-bottom,0px)]">
          <div className="flex gap-2.5 px-4 py-3">
            {user ? (
              <Button onClick={handleDashboardRedirect} className="flex-1 h-12 text-base active:scale-[0.98] transition-transform">
                Go to Dashboard
              </Button>
            ) : (
              <>
                <Button variant="outline" asChild className="flex-1 h-12 text-base active:scale-[0.98] transition-transform">
                  <Link href="/auth/login">Sign In</Link>
                </Button>
                <Button asChild className="flex-1 h-12 text-base bg-gold text-gold-foreground border-gold hover:bg-gold/90 active:scale-[0.98] transition-transform">
                  <Link href="/auth/register">Get Started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      <footer className={`bg-[hsl(224_50%_5%)] text-[hsl(40_20%_88%)] mt-auto ${showFeatured ? "pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] sm:pb-0" : ""}`}>
        <div className="container mx-auto max-w-6xl px-5 sm:px-6 py-14 grid gap-10 md:grid-cols-3">
          <div className="space-y-3">
            <p className="flex items-center gap-2.5 font-serif text-2xl font-semibold text-[hsl(40_30%_97%)]"><BrandSymbol className="h-9 w-9 text-[hsl(40_30%_97%)]" />SolomonQuest</p>
            <p className="text-sm text-[hsl(40_20%_88%/0.7)] max-w-xs leading-relaxed">A refined learning platform for schools that take formation seriously.</p>
          </div>
          {showFeatured ? (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold tracking-[0.28em] uppercase text-gold">Featured Institution</p>
              <a href="/#hsmm" className="block font-serif text-xl text-[hsl(40_30%_97%)] hover:text-gold transition-colors">Harvest School of Ministries and Missions</a>
              <p className="text-sm text-[hsl(40_20%_88%/0.7)]">HSMM: equipping for ministry and missions.</p>
            </div>
          ) : (
            <div aria-hidden="true" className="hidden md:block" />
          )}
          <nav aria-label="Footer" className="space-y-3 md:justify-self-end">
            <p className="text-[11px] font-semibold tracking-[0.28em] uppercase text-gold">Get started</p>
            <ul className="space-y-2 text-sm">
              <li><Link href="/auth/login" className="hover:text-gold transition-colors">Sign in</Link></li>
              <li><Link href="/auth/register" className="hover:text-gold transition-colors">Create a school</Link></li>
              <li><Link href="/onboarding/join" className="hover:text-gold transition-colors">Join a school</Link></li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-white/10">
          <div className="container mx-auto max-w-6xl px-5 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[hsl(40_20%_88%/0.55)]">
            <span>&copy; {new Date().getFullYear()} SolomonQuest LMS. Crafted for education.</span>
            <span className="text-[9px] tracking-[0.25em] uppercase">Powered by TIBLOGICS</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
