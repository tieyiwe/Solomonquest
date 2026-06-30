import { useEffect } from "react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useListSchools } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, BookOpen, GraduationCap, Users } from "lucide-react";
import { generate_image_tool } from "@/components/ui/empty"; // Dummy import to avoid error if we don't have it, actually just use standard icons
import { setPageMeta } from "@/lib/seo";

export default function Home() {
  const { data: schools, isLoading } = useListSchools();

  useEffect(() => {
    setPageMeta({ title: "Home", description: "Discover schools and courses on SolomonQuest LMS" });
  }, []);

  return (
    <PublicLayout>
      <div className="relative">
        <section className="py-20 md:py-32 px-4 bg-primary text-primary-foreground relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-10 mix-blend-overlay"></div>
          <div className="container mx-auto max-w-6xl relative z-10">
            <div className="max-w-3xl space-y-6">
              <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-primary-foreground leading-tight">
                Education, Elevated.
              </h1>
              <p className="text-xl md:text-2xl text-primary-foreground/80 font-medium">
                The premium learning management system that respects your time, your craft, and your students.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Button size="lg" variant="secondary" asChild className="text-lg px-8">
                  <Link href="/onboarding/setup">Create a School</Link>
                </Button>
                <Button size="lg" variant="outline" className="bg-transparent border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10 text-lg px-8" asChild>
                  <Link href="/onboarding/join">Join a School</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 bg-background">
          <div className="container mx-auto max-w-6xl px-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <Card className="border-border shadow-sm">
                <CardHeader>
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>Role-Aware</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base text-foreground/70">
                    Tailored experiences for administrators, teachers, and students. Everyone sees exactly what they need to.
                  </CardDescription>
                </CardContent>
              </Card>
              <Card className="border-border shadow-sm">
                <CardHeader>
                  <div className="h-12 w-12 rounded-lg bg-secondary/10 flex items-center justify-center mb-4">
                    <BookOpen className="h-6 w-6 text-secondary" />
                  </div>
                  <CardTitle>Clean Hierarchy</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base text-foreground/70">
                    Dense but organized information. Find grades, courses, and assignments without getting lost in menus.
                  </CardDescription>
                </CardContent>
              </Card>
              <Card className="border-border shadow-sm">
                <CardHeader>
                  <div className="h-12 w-12 rounded-lg bg-chart-4/10 flex items-center justify-center mb-4">
                    <GraduationCap className="h-6 w-6 text-chart-4" />
                  </div>
                  <CardTitle>Multi-Tenant</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base text-foreground/70">
                    Each school runs in its own isolated environment with its own branding, students, and courses.
                  </CardDescription>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="py-20 bg-muted/30">
          <div className="container mx-auto max-w-6xl px-4">
            <h2 className="text-3xl font-bold mb-8 text-foreground">Explore Schools</h2>
            
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="overflow-hidden">
                    <div className="h-32 bg-muted animate-pulse"></div>
                    <CardHeader>
                      <Skeleton className="h-6 w-2/3 mb-2" />
                      <Skeleton className="h-4 w-1/2" />
                    </CardHeader>
                  </Card>
                ))}
              </div>
            ) : schools && schools.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {schools.map((school) => (
                  <Link key={school.id} href={`/schools/${school.slug}`}>
                    <Card className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer h-full group border-border">
                      <div
                        className="h-36 relative"
                        style={{
                          backgroundColor: school.primaryColor ?? "#4f46e5",
                          backgroundImage: school.bannerUrl ? `url(${school.bannerUrl})` : undefined,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }}
                      >
                        {/* Gradient overlay so logo pops */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                        {school.logoUrl && (
                          <div className="absolute -bottom-6 left-4 h-12 w-12 rounded-full border-4 border-card bg-background overflow-hidden shadow-sm">
                            <img src={school.logoUrl} alt={school.name} className="w-full h-full object-cover" />
                          </div>
                        )}
                      </div>
                      <CardHeader className={school.logoUrl ? "pt-8" : ""}>
                        <CardTitle className="group-hover:text-primary transition-colors flex items-center justify-between">
                          {school.name}
                          <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </CardTitle>
                        <CardDescription>View programs and apply</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-card rounded-lg border border-border">
                <p className="text-muted-foreground mb-4">No schools found.</p>
                <Button variant="outline" asChild>
                  <Link href="/onboarding/setup">Be the first to create one</Link>
                </Button>
              </div>
            )}
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}
