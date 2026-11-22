import { useEffect, useMemo } from "react";
import { Link } from "wouter";
import { useListSchools } from "@workspace/api-client-react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { HeroSlideshow, type HeroSlide } from "@/components/home/HeroSlideshow";
import { HsmmCrest } from "@/components/home/HsmmCrest";
import { EmptyState } from "@/components/common/States";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpenCheck,
  Globe2,
  GraduationCap,
  HandHeart,
  Landmark,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { setPageMeta } from "@/lib/seo";

const LIBRARY_IMG =
  "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?q=80&w=2070&auto=format&fit=crop";
const GRADUATION_IMG =
  "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?q=80&w=2070&auto=format&fit=crop";

const goldButton =
  "h-12 px-7 text-base bg-gold text-gold-foreground border-gold hover:bg-gold/90 shadow-[0_8px_30px_-8px_hsl(39_52%_56%/0.6)]";
const ghostButton =
  "h-12 px-7 text-base bg-transparent border-white/25 text-white hover:bg-white/10 hover:text-white hover:border-gold/60";

function SectionEyebrow({ children, onDark = false }: { children: React.ReactNode; onDark?: boolean }) {
  return (
    <p
      className={`flex items-center gap-3 text-[11px] sm:text-xs font-semibold tracking-[0.28em] uppercase ${
        onDark ? "text-gold" : "text-[hsl(36_48%_36%)] dark:text-gold"
      }`}
    >
      <span aria-hidden="true" className={`h-px w-10 ${onDark ? "bg-gold/70" : "bg-gold"}`} />
      {children}
    </p>
  );
}

export default function Home() {
  const { data: schools, isLoading } = useListSchools();

  useEffect(() => {
    setPageMeta({
      title: "Home",
      description:
        "SolomonQuest is a learning management platform by Harvest School of Ministries and Missions (HSMM).",
    });
  }, []);

  // HSMM's public page, if it's published on the platform. Matched by name or
  // slug so the links keep working whatever slug the school chose.
  const hsmm = useMemo(
    () =>
      (schools ?? []).find(
        (s) => /harvest/i.test(s.name) || /^(hsmm|harvest)/i.test(s.slug),
      ),
    [schools],
  );
  const hsmmHref = hsmm ? `/${hsmm.slug}` : "#hsmm";
  const hsmmApplyHref = hsmm ? `/${hsmm.slug}/apply` : "/onboarding/join";
  const otherSchools = (schools ?? []).filter((s) => s.id !== hsmm?.id);

  const slides: HeroSlide[] = [
    {
      id: "platform",
      eyebrow: "SolomonQuest LMS",
      byline: (
        <>
          A learning management platform by Harvest School of Ministries and{" "}
          <span className="whitespace-nowrap">
            Missions <span className="not-italic font-sans text-sm font-semibold tracking-[0.2em] text-gold">(HSMM)</span>
          </span>
        </>
      ),
      title: (
        <>
          Education, <span className="italic text-gold">Elevated.</span>
        </>
      ),
      body:
        "A refined home for your school: admissions, courses, grading, tuition, and community, beautifully organized in one place.",
      image: LIBRARY_IMG,
      actions: (
        <>
          <Button size="lg" asChild className={goldButton}>
            <Link href="/auth/register">Create a School</Link>
          </Button>
          <Button size="lg" variant="outline" asChild className={ghostButton}>
            <Link href="/onboarding/join">Join a School</Link>
          </Button>
        </>
      ),
    },
    {
      id: "hsmm",
      eyebrow: "Featured Institution",
      title: (
        <>
          Harvest School of <span className="italic text-gold">Ministries</span> &amp;{" "}
          <span className="italic text-gold">Missions</span>
        </>
      ),
      body:
        "HSMM equips men and women for ministry and missions. Its courses, community, and admissions now live on SolomonQuest.",
      art: <HsmmCrest className="w-[340px] h-[340px] drop-shadow-[0_20px_60px_hsl(39_52%_56%/0.25)]" />,
      actions: (
        <>
          <Button size="lg" asChild className={goldButton}>
            <Link href={hsmmApplyHref}>
              Apply to HSMM <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild className={ghostButton}>
            <a href={hsmmHref}>Discover HSMM</a>
          </Button>
        </>
      ),
    },
    {
      id: "roles",
      eyebrow: "Wisdom for every role",
      title: (
        <>
          Built for leaders, teachers <span className="italic text-gold">&amp;</span> learners.
        </>
      ),
      body:
        "Administrators run the institution, teachers focus on teaching, and students always know what's next. Each sees exactly what they need.",
      image: GRADUATION_IMG,
      actions: (
        <>
          <Button size="lg" asChild className={goldButton}>
            <a href="#explore">Explore Schools</a>
          </Button>
          <Button size="lg" variant="outline" asChild className={ghostButton}>
            <Link href="/auth/login">Sign In</Link>
          </Button>
        </>
      ),
    },
  ];

  const pillars = [
    {
      icon: Users,
      n: "01",
      title: "Role-aware by design",
      body: "Tailored workspaces for administrators, teachers, students, staff, and parents. Nothing to hunt for, nothing out of place.",
    },
    {
      icon: Landmark,
      n: "02",
      title: "Run the whole institution",
      body: "Admissions, programs and terms, grading and transcripts, tuition and accounting, all under one roof.",
    },
    {
      icon: ShieldCheck,
      n: "03",
      title: "Your school, your brand",
      body: "Every school is isolated and branded as its own, with its own homepage, application form, and payments.",
    },
  ];

  const hsmmPillars = [
    { icon: BookOpenCheck, title: "Ministry formation", body: "Courses and teaching that ground students in the Word and prepare them to serve." },
    { icon: Globe2, title: "Missions training", body: "Preparation for carrying the Gospel across cultures, communities, and nations." },
    { icon: HandHeart, title: "A community of calling", body: "Students, teachers, and leaders connected in one place, learning and growing together." },
  ];

  return (
    <PublicLayout showFeatured>
      <HeroSlideshow slides={slides} />

      {/* ── HSMM feature ─────────────────────────────────────────────────── */}
      <section id="hsmm" className="relative py-16 sm:py-24 md:py-32 bg-background scroll-mt-16">
        <div className="container mx-auto max-w-6xl px-5 sm:px-6">
          <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-14 lg:gap-20 items-center">
            <div className="relative order-2 lg:order-1">
              <div className="relative aspect-square max-w-[300px] sm:max-w-[460px] mx-auto rounded-[24px] sm:rounded-[28px] bg-brand overflow-hidden shadow-2xl ring-1 ring-black/5">
                <div aria-hidden="true" className="absolute inset-0 hero-grain opacity-[0.06] mix-blend-overlay" />
                <div aria-hidden="true" className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-[radial-gradient(circle,hsl(39_55%_62%/0.22),transparent_65%)]" />
                <div className="absolute inset-0 flex items-center justify-center p-10">
                  <HsmmCrest className="w-full max-w-[340px] aspect-square" />
                </div>
              </div>
              <div className="hidden sm:flex absolute -bottom-6 -right-2 lg:-right-8 items-center gap-3 rounded-2xl bg-card px-5 py-4 shadow-xl ring-1 ring-border">
                <span className="h-10 w-10 rounded-full bg-gold/15 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-[hsl(36_48%_36%)] dark:text-gold" />
                </span>
                <span className="leading-tight">
                  <span className="block text-sm font-semibold text-foreground">Now on SolomonQuest</span>
                  <span className="block text-xs text-muted-foreground">Courses, community &amp; admissions</span>
                </span>
              </div>
            </div>

            <div className="order-1 lg:order-2 space-y-7">
              <SectionEyebrow>Featured Institution</SectionEyebrow>
              <h2 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.05] tracking-tight text-foreground text-balance">
                Harvest School of Ministries and Missions
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed max-w-xl">
                <strong className="font-semibold text-foreground">HSMM</strong> exists to equip men and women for the work of ministry
                and the call to missions. Through SolomonQuest, its students learn, connect, and grow, from their first application to
                their final course.
              </p>
              <ul className="flex sm:grid sm:grid-cols-3 gap-4 sm:gap-5 pt-2 overflow-x-auto sm:overflow-visible snap-x snap-mandatory scroll-px-5 sm:scroll-px-0 no-scrollbar swipe-row -mx-5 px-5 sm:mx-0 sm:px-0">
                {hsmmPillars.map(({ icon: Icon, title, body }) => (
                  <li key={title} className="snap-start shrink-0 w-[72%] sm:w-auto space-y-2.5 border-t border-gold/40 pt-4">
                    <Icon className="h-5 w-5 text-[hsl(36_48%_36%)] dark:text-gold" aria-hidden="true" />
                    <p className="font-serif text-xl font-semibold text-foreground leading-snug">{title}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col sm:flex-row gap-3 pt-3">
                <Button size="lg" asChild className="h-12 px-7 text-base">
                  <Link href={hsmmApplyHref}>
                    Apply to HSMM <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
                {hsmm && (
                  <Button size="lg" variant="outline" asChild className="h-12 px-7 text-base">
                    <Link href={hsmmHref}>
                      Visit the HSMM page <ArrowUpRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Scripture band ───────────────────────────────────────────────── */}
      <section className="relative bg-brand text-[hsl(40_30%_97%)] py-14 sm:py-20 md:py-24 overflow-hidden">
        <div aria-hidden="true" className="absolute inset-0 hero-grain opacity-[0.06] mix-blend-overlay" />
        <figure className="relative container mx-auto max-w-4xl px-5 sm:px-6 text-center space-y-6">
          <span aria-hidden="true" className="block font-serif text-7xl leading-none text-gold/80">&ldquo;</span>
          <blockquote className="font-serif italic text-2xl sm:text-3xl md:text-4xl leading-snug text-balance">
            Wisdom is the principal thing; therefore get wisdom: and with all thy getting get understanding.
          </blockquote>
          <figcaption className="text-xs tracking-[0.3em] uppercase text-gold">Proverbs 4:7</figcaption>
        </figure>
      </section>

      {/* ── Platform pillars ─────────────────────────────────────────────── */}
      <section className="py-16 sm:py-24 md:py-32 bg-background">
        <div className="container mx-auto max-w-6xl px-5 sm:px-6">
          <div className="max-w-2xl space-y-5 mb-14 md:mb-20">
            <SectionEyebrow>The Platform</SectionEyebrow>
            <h2 className="font-serif text-4xl sm:text-5xl font-semibold tracking-tight text-foreground leading-[1.08] text-balance">
              Everything a school needs, crafted with restraint.
            </h2>
          </div>
          <div className="flex md:grid md:grid-cols-3 gap-3 md:gap-px md:bg-border md:rounded-2xl md:overflow-hidden md:ring-1 md:ring-border overflow-x-auto md:overflow-visible snap-x snap-mandatory scroll-px-5 md:scroll-px-0 no-scrollbar swipe-row -mx-5 px-5 md:mx-0 md:px-0 pb-1">
            {pillars.map(({ icon: Icon, n, title, body }) => (
              <div key={title} className="group snap-start shrink-0 w-[82%] md:w-auto bg-card p-7 md:p-10 space-y-5 rounded-2xl md:rounded-none ring-1 ring-border md:ring-0 transition-colors hover:bg-accent/40">
                <div className="flex items-center justify-between">
                  <span className="font-serif text-3xl text-[hsl(36_48%_36%)] dark:text-gold tabular">{n}</span>
                  <Icon className="h-6 w-6 text-foreground/70 group-hover:text-foreground transition-colors" aria-hidden="true" />
                </div>
                <h3 className="font-serif text-2xl font-semibold text-foreground">{title}</h3>
                <p className="text-muted-foreground leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Explore schools ──────────────────────────────────────────────── */}
      <section id="explore" className="py-16 sm:py-24 md:py-28 bg-muted/50 border-y border-border scroll-mt-16">
        <div className="container mx-auto max-w-6xl px-5 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12">
            <div className="space-y-4">
              <SectionEyebrow>Explore</SectionEyebrow>
              <h2 className="font-serif text-4xl sm:text-5xl font-semibold tracking-tight text-foreground">Schools on SolomonQuest</h2>
            </div>
            <Button variant="ghost" asChild className="self-start sm:self-auto">
              <Link href="/onboarding/join">
                Join a school <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl overflow-hidden bg-card ring-1 ring-border">
                  <Skeleton className="h-40 rounded-none" />
                  <div className="p-6 space-y-3">
                    <Skeleton className="h-6 w-2/3" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : hsmm || otherSchools.length > 0 ? (
            <div className="flex md:grid md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 overflow-x-auto md:overflow-visible snap-x snap-mandatory scroll-px-5 md:scroll-px-0 no-scrollbar swipe-row -mx-5 px-5 md:mx-0 md:px-0 pb-3">
              {[...(hsmm ? [hsmm] : []), ...otherSchools].map((school) => {
                const featured = school.id === hsmm?.id;
                const banner = (school as { bannerUrl?: string | null }).bannerUrl;
                return (
                  <Link key={school.id} href={`/${school.slug}`} className="group block snap-start shrink-0 w-[82%] md:w-auto active:scale-[0.98] transition-transform rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <article
                      className={`h-full rounded-2xl overflow-hidden bg-card ring-1 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl ${
                        featured ? "ring-gold/60 shadow-lg" : "ring-border"
                      }`}
                    >
                      <div
                        className={`h-40 relative ${school.primaryColor || banner ? "" : "bg-brand"}`}
                        style={{
                          backgroundColor: school.primaryColor ?? undefined,
                          backgroundImage: banner ? `url(${banner})` : undefined,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
                        {featured && (
                          <span className="absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1 text-[11px] font-semibold tracking-wider uppercase text-gold-foreground shadow">
                            <Sparkles className="h-3 w-3" aria-hidden="true" /> Featured
                          </span>
                        )}
                        {school.logoUrl ? (
                          <div className="absolute -bottom-7 left-6 h-14 w-14 rounded-full border-4 border-card bg-background overflow-hidden shadow-md">
                            <img src={school.logoUrl} alt="" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="absolute -bottom-7 left-6 h-14 w-14 rounded-full border-4 border-card bg-primary text-primary-foreground shadow-md flex items-center justify-center font-serif text-xl font-semibold">
                            {school.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="p-6 pt-10 space-y-1.5">
                        <h3 className="font-serif text-2xl font-semibold text-foreground flex items-start justify-between gap-3">
                          <span className="text-balance">{school.name}</span>
                          <ArrowUpRight className="h-5 w-5 mt-1 shrink-0 text-muted-foreground transition-all group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
                        </h3>
                        <p className="text-sm text-muted-foreground">View programs and apply</p>
                      </div>
                    </article>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={GraduationCap}
              title="No schools listed yet"
              description="Schools that publish a public page will appear here."
              action={
                <Button asChild>
                  <Link href="/onboarding/setup">Be the first to create one</Link>
                </Button>
              }
            />
          )}
        </div>
      </section>

      {/* ── Closing call to action ───────────────────────────────────────── */}
      <section className="relative bg-brand text-[hsl(40_30%_97%)] overflow-hidden">
        <div aria-hidden="true" className="absolute inset-0 hero-grain opacity-[0.06] mix-blend-overlay" />
        <div aria-hidden="true" className="absolute -top-32 right-0 h-96 w-96 rounded-full bg-[radial-gradient(circle,hsl(39_55%_62%/0.18),transparent_65%)]" />
        <div className="relative container mx-auto max-w-6xl px-5 sm:px-6 py-14 sm:py-20 md:py-24 grid md:grid-cols-[1.4fr_1fr] gap-8 sm:gap-10 items-center">
          <div className="space-y-5">
            <SectionEyebrow onDark>Begin</SectionEyebrow>
            <h2 className="font-serif text-4xl sm:text-5xl font-semibold leading-[1.08] tracking-tight text-balance">
              Give your school the home it deserves.
            </h2>
            <p className="text-lg text-[hsl(40_20%_88%/0.8)] max-w-xl">
              Set up in minutes. Your branding, your programs, your students, all on one elegant platform.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row gap-3 md:justify-self-end">
            <Button size="lg" asChild className={goldButton}>
              <Link href="/auth/register">Create a School</Link>
            </Button>
            <Button size="lg" variant="outline" asChild className={ghostButton}>
              <Link href="/onboarding/join">Join a School</Link>
            </Button>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
