import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Search, ChevronRight, ChevronLeft, AlertCircle, CheckCircle2, HelpCircle, PlayCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getHelpData, type HelpCategory, type HelpArticle, type HelpRole } from "@/components/help/helpData";
import { setPageMeta } from "@/lib/seo";
import { useEffect, useMemo } from "react";
import { getTourKey } from "@/components/tour/tourData";

type View =
  | { type: "home" }
  | { type: "category"; categoryId: string }
  | { type: "article"; categoryId: string; articleId: string };

export default function HelpPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [view, setView] = useState<View>({ type: "home" });
  const [search, setSearch] = useState("");

  useEffect(() => {
    setPageMeta({ title: "Help Center", description: "Guides and troubleshooting for SolomonQuest" });
  }, []);

  const role = user?.role as HelpRole | undefined;
  const categories = getHelpData(role);

  const allArticles = useMemo(
    () =>
      categories.flatMap((cat) =>
        cat.articles.map((art) => ({ ...art, categoryId: cat.id, categoryTitle: cat.title }))
      ),
    [categories]
  );

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return allArticles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q) ||
        a.steps.some((s) => s.text.toLowerCase().includes(q))
    );
  }, [search, allArticles]);

  const currentCategory =
    view.type !== "home"
      ? categories.find((c) => c.id === view.categoryId) ?? null
      : null;

  const currentArticle =
    view.type === "article" && currentCategory
      ? currentCategory.articles.find((a) => a.id === view.articleId) ?? null
      : null;

  const roleLabel =
    role === "admin" || role === "super_admin"
      ? "Administrator"
      : role === "teacher"
      ? "Teacher"
      : role === "staff"
      ? "Staff"
      : "Student";

  const handleReplayTour = () => {
    if (role) {
      localStorage.removeItem(getTourKey(role));
    }
    const dashPath =
      role === "admin" || role === "super_admin"
        ? "/dashboard/admin"
        : role === "teacher"
        ? "/dashboard/teacher"
        : "/dashboard/student";
    setLocation(dashPath);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-blue-600 text-white">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Help Center</h1>
          <p className="text-white/80 text-lg">{roleLabel} Guide · SolomonQuest LMS</p>
          <div className="mt-6 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              placeholder="Search articles, guides, troubleshooting…"
              className="pl-12 h-12 bg-white text-gray-900 border-0 shadow-lg text-base"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        {view.type !== "home" && (
          <div className="flex items-center gap-2 mb-6 text-sm text-gray-500">
            <button
              onClick={() => setView({ type: "home" })}
              className="hover:text-primary transition-colors"
            >
              Help Center
            </button>
            {view.type === "article" && currentCategory && (
              <>
                <ChevronRight className="h-4 w-4" />
                <button
                  onClick={() => setView({ type: "category", categoryId: view.categoryId })}
                  className="hover:text-primary transition-colors"
                >
                  {currentCategory.title}
                </button>
              </>
            )}
            {view.type === "article" && currentArticle && (
              <>
                <ChevronRight className="h-4 w-4" />
                <span className="text-gray-800 font-medium">{currentArticle.title}</span>
              </>
            )}
            {view.type === "category" && currentCategory && (
              <>
                <ChevronRight className="h-4 w-4" />
                <span className="text-gray-800 font-medium">{currentCategory.title}</span>
              </>
            )}
          </div>
        )}

        {/* Search results */}
        {search.trim() && (
          <div className="mb-8">
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Results for "{search}"
            </p>
            {searchResults.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
                <HelpCircle className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No articles found for "{search}"</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {searchResults.map((art) => (
                  <ArticleCard
                    key={art.id}
                    article={art}
                    onClick={() => {
                      setSearch("");
                      setView({ type: "article", categoryId: art.categoryId, articleId: art.id });
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Home view */}
        {!search.trim() && view.type === "home" && (
          <>
            {/* Tour CTA */}
            <button
              onClick={handleReplayTour}
              className="w-full flex items-center gap-4 bg-gradient-to-r from-primary/10 to-blue-50 border border-primary/20 rounded-2xl p-5 hover:from-primary/15 transition-colors text-left mb-8"
            >
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <PlayCircle className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-primary text-lg">Take the guided tour</p>
                <p className="text-sm text-gray-500">A step-by-step walkthrough of your entire dashboard — takes about 2 minutes.</p>
              </div>
              <ChevronRight className="h-5 w-5 text-primary shrink-0" />
            </button>

            {/* Categories grid */}
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Browse Topics</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setView({ type: "category", categoryId: cat.id })}
                  className="flex items-start gap-4 bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-md hover:border-primary/20 transition-all text-left group"
                >
                  <span className="text-3xl shrink-0">{cat.icon}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800 group-hover:text-primary transition-colors">{cat.title}</p>
                    <p className="text-sm text-gray-400 mt-1">{cat.articles.length} article{cat.articles.length !== 1 ? "s" : ""}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-primary transition-colors mt-1" />
                </button>
              ))}
            </div>
          </>
        )}

        {/* Category view */}
        {!search.trim() && view.type === "category" && currentCategory && (
          <>
            <div className="flex items-center gap-4 mb-6">
              <span className="text-4xl">{currentCategory.icon}</span>
              <h2 className="text-2xl font-bold text-gray-800">{currentCategory.title}</h2>
            </div>
            <div className="grid gap-3">
              {currentCategory.articles.map((art) => (
                <ArticleCard
                  key={art.id}
                  article={art}
                  onClick={() =>
                    setView({ type: "article", categoryId: currentCategory.id, articleId: art.id })
                  }
                />
              ))}
            </div>
          </>
        )}

        {/* Article view */}
        {!search.trim() && view.type === "article" && currentArticle && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b">
              <div className="flex items-start gap-4">
                <span className="text-4xl shrink-0">{currentArticle.icon}</span>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{currentArticle.title}</h2>
                  <p className="text-gray-500 mt-1">{currentArticle.summary}</p>
                </div>
              </div>
            </div>

            <div className="p-6 flex flex-col gap-8">
              {/* Steps */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
                  Step-by-step instructions
                </p>
                <ol className="flex flex-col gap-4">
                  {currentArticle.steps.map((step, i) => (
                    <li key={i} className="flex gap-4">
                      <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary text-white text-sm font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </div>
                      <div>
                        <p className="text-gray-800">{step.text}</p>
                        {step.detail && (
                          <p className="text-sm text-gray-500 mt-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                            💡 {step.detail}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Troubleshooting */}
              {currentArticle.troubleshoot && currentArticle.troubleshoot.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
                    Troubleshooting
                  </p>
                  <div className="flex flex-col gap-4">
                    {currentArticle.troubleshoot.map((item, i) => (
                      <div key={i} className="border border-orange-100 bg-orange-50 rounded-xl p-5">
                        <div className="flex items-start gap-3 mb-2">
                          <AlertCircle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                          <p className="font-semibold text-orange-800">{item.problem}</p>
                        </div>
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                          <p className="text-gray-700">{item.solution}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Still stuck */}
              <div className="border border-gray-100 rounded-xl p-5 bg-gray-50 text-center">
                <HelpCircle className="h-7 w-7 text-gray-400 mx-auto mb-2" />
                <p className="font-semibold text-gray-700">Still need help?</p>
                <p className="text-sm text-gray-400 mt-1">
                  Post a question in the Forum or send a message to your school administrator.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Back button */}
        {view.type !== "home" && !search.trim() && (
          <div className="mt-6">
            <Button
              variant="ghost"
              onClick={() =>
                setView(
                  view.type === "article"
                    ? { type: "category", categoryId: view.categoryId }
                    : { type: "home" }
                )
              }
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ArticleCard({
  article,
  onClick,
}: {
  article: HelpArticle & { categoryTitle?: string };
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 bg-white border border-gray-100 rounded-xl p-4 hover:shadow-md hover:border-primary/20 transition-all text-left group w-full"
    >
      <span className="text-2xl shrink-0">{article.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-800 group-hover:text-primary transition-colors">
          {article.title}
        </p>
        <p className="text-sm text-gray-400 truncate mt-0.5">{article.summary}</p>
        {article.categoryTitle && (
          <p className="text-xs text-primary/60 mt-0.5">{article.categoryTitle}</p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-primary transition-colors shrink-0" />
    </button>
  );
}
