import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ProfileMenu } from "@/components/layout/ProfileMenu";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { HelpCircle, LogOut } from "lucide-react";
import { TourOverlay, useTour } from "@/components/tour/TourOverlay";
import { HelpCenter, HelpButton } from "@/components/help/HelpCenter";

import { BrandTile } from "@/components/brand/BrandMark";
interface ParentLayoutProps {
  children: React.ReactNode;
}

export function ParentLayout({ children }: ParentLayoutProps) {
  const { user, signOut } = useAuth();
  const [helpOpen, setHelpOpen] = useState(false);
  const { showTour, launchTour, closeTour } = useTour("parent");

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "P";
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-16 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 flex items-center justify-between gap-3 px-4 md:px-6 sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <BrandTile className="h-8 w-8" />
          <Link href="/dashboard/parent">
            <span className="text-base font-bold text-foreground tracking-tight">SolomonQuest</span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/help" className="inline-flex h-10 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground" aria-label="Help Center">
            <HelpCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Help</span>
          </Link>
          <div className="hidden sm:flex items-center gap-2">
            <Avatar className="h-8 w-8 border">
              <AvatarImage src={user?.avatarUrl || ""} />
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {getInitials(user?.firstName, user?.lastName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="text-sm font-medium leading-tight">
                {user?.firstName} {user?.lastName}
              </span>
              <Badge variant="outline" className="w-fit text-xs py-0">
                Parent
              </Badge>
            </div>
          </div>
          <ProfileMenu />
          <Button variant="ghost" size="icon" onClick={signOut} title="Sign Out" aria-label="Sign out">
            <LogOut className="h-5 w-5 text-muted-foreground" />
          </Button>
        </div>
      </header>

      <main className="flex-1 px-4 py-5 md:p-6 lg:p-8 overflow-y-auto bg-background max-w-5xl w-full mx-auto">
        {children}
      </main>

      <HelpButton onClick={() => setHelpOpen(true)} />
      {helpOpen && (
        <HelpCenter role="parent" onClose={() => setHelpOpen(false)} onStartTour={launchTour} />
      )}
      {showTour && <TourOverlay role="parent" onClose={closeTour} />}
    </div>
  );
}
