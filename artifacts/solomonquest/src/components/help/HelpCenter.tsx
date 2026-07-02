import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Search, ChevronLeft, ChevronRight, HelpCircle, AlertCircle, CheckCircle2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getHelpData, type HelpCategory, type HelpArticle, type HelpRole } from "./helpData";

interface HelpCenterProps {
  role?: HelpRole | null;
  onClose: () => void;
  onStartTour: () => void;
}

type View =
  | { type: "home" }
  | { type: "category"; categoryId: string }
  | { type: "article"; categoryId: string; articleId: string };

export function HelpCenter({ role, onClose, onStartTour }: HelpCenterProps) {
  const [view, setView] = useState<View>({ type: "home" });
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(false);

  // Animate in
  useState(() => {
    const t = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(t);
  });

  const categories = getHelpData(role);

  // Flatten articles for search
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

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

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

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998] bg-black/30"
        style={{ opacity: visible ? 1 : 0, transition: "opacity 0.3s" }}
        onClick={handleClose}
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 bottom-0 z-[9999] w-full max-w-md bg-white shadow-2xl flex flex-col"
        style={{
          transform: visible ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.35s cubic-bezier(.22,.68,0,1.2)",
        }}
      >
        {/* Top gradient accent */}
        <div className="h-1 bg-gradient-to-r from-primary via-blue-500 to-purple-500 shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-white shrink-0">
          <div className="flex items-center gap-3">
            {view.type !== "home" ? (
              <button
                onClick={() =>
                  setView(
                    view.type === "article"
                      ? { type: "category", categoryId: view.categoryId }
                      : { type: "home" }
                  )
                }
                className="text-gray-400 hover:text-gray-700 transition-colors mr-1"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            ) : null}
            <div>
              <h2 className="font-bold text-gray-900 leading-tight">Help Center</h2>
              <p className="text-xs text-gray-400">{roleLabel} Guide</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* HOME VIEW */}
          {view.type === "home" && (
            <div className="p-5 flex flex-col gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search help articles…"
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Search results */}
              {search.trim() && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Results for "{search}"
                  </p>
                  {searchResults.length === 0 ? (
                    <p className="text-sm text-gray-400 py-4 text-center">No articles found.</p>
                  ) : (
                    searchResults.map((art) => (
                      <ArticleRow
                        key={art.id}
                        article={art}
                        onClick={() => {
                          setSearch("");
                          setView({ type: "article", categoryId: art.categoryId, articleId: art.id });
                        }}
                      />
                    ))
                  )}
                </div>
              )}

              {/* No search: show categories + tour CTA */}
              {!search.trim() && (
                <>
                  {/* Take the tour CTA */}
                  <button
                    onClick={() => { handleClose(); setTimeout(onStartTour, 350); }}
                    className="flex items-center gap-3 bg-gradient-to-r from-primary/10 to-blue-50 border border-primary/20 rounded-xl p-4 hover:from-primary/15 transition-colors text-left"
                  >
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <PlayCircle className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-primary">Replay the guided tour</p>
                      <p className="text-xs text-gray-500">A step-by-step walkthrough of your dashboard</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-primary ml-auto shrink-0" />
                  </button>

                  {/* Categories */}
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-1">Topics</p>
                  <div className="flex flex-col gap-2">
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setView({ type: "category", categoryId: cat.id })}
                        className="flex items-center gap-3 border border-gray-100 rounded-xl p-4 hover:bg-gray-50 transition-colors text-left"
                      >
                        <span className="text-2xl shrink-0">{cat.icon}</span>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-800">{cat.title}</p>
                          <p className="text-xs text-gray-400">{cat.articles.length} article{cat.articles.length !== 1 ? "s" : ""}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-300" />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* CATEGORY VIEW */}
          {view.type === "category" && currentCategory && (
            <div className="p-5 flex flex-col gap-4">
              <div className="flex items-center gap-3 pb-1 border-b">
                <span className="text-3xl">{currentCategory.icon}</span>
                <h3 className="font-bold text-gray-800 text-lg">{currentCategory.title}</h3>
              </div>
              <div className="flex flex-col gap-2">
                {currentCategory.articles.map((art) => (
                  <ArticleRow
                    key={art.id}
                    article={art}
                    onClick={() =>
                      setView({ type: "article", categoryId: currentCategory.id, articleId: art.id })
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* ARTICLE VIEW */}
          {view.type === "article" && currentArticle && (
            <div className="p-5 flex flex-col gap-5">
              <div className="flex items-start gap-3">
                <span className="text-3xl shrink-0">{currentArticle.icon}</span>
                <div>
                  <h3 className="font-bold text-gray-900 text-lg leading-tight">
                    {currentArticle.title}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">{currentArticle.summary}</p>
                </div>
              </div>

              {/* Steps */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                  Step-by-step
                </p>
                <ol className="flex flex-col gap-3">
                  {currentArticle.steps.map((step, i) => (
                    <li key={i} className="flex gap-3">
                      <div className="flex-shrink-0 h-6 w-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </div>
                      <div>
                        <p className="text-sm text-gray-800">{step.text}</p>
                        {step.detail && (
                          <p className="text-xs text-gray-400 mt-1 bg-gray-50 rounded-lg px-2.5 py-1.5 border border-gray-100">
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
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                    Troubleshooting
                  </p>
                  <div className="flex flex-col gap-3">
                    {currentArticle.troubleshoot.map((item, i) => (
                      <div key={i} className="border border-orange-100 bg-orange-50 rounded-xl p-4">
                        <div className="flex items-start gap-2 mb-1.5">
                          <AlertCircle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                          <p className="text-sm font-semibold text-orange-800">{item.problem}</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                          <p className="text-sm text-gray-700">{item.solution}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Still stuck? */}
              <div className="border border-gray-100 rounded-xl p-4 bg-gray-50 text-center">
                <HelpCircle className="h-6 w-6 text-gray-400 mx-auto mb-2" />
                <p className="text-sm font-semibold text-gray-700">Still stuck?</p>
                <p className="text-xs text-gray-400 mt-1">
                  Use the Forum or Messages to reach out to your school administrator.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}

function ArticleRow({ article, onClick }: { article: HelpArticle & { categoryTitle?: string }; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 border border-gray-100 rounded-xl p-3.5 hover:bg-gray-50 transition-colors text-left w-full"
    >
      <span className="text-xl shrink-0">{article.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{article.title}</p>
        <p className="text-xs text-gray-400 truncate mt-0.5">{article.summary}</p>
        {article.categoryTitle && (
          <p className="text-[10px] text-primary/70 mt-0.5">{article.categoryTitle}</p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
    </button>
  );
}

// ─── Floating help button ─────────────────────────────────────────────────────

interface HelpButtonProps {
  onClick: () => void;
}

export function HelpButton({ onClick }: HelpButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label="Open Help Center"
      className="fixed bottom-6 left-6 z-[9990] h-10 w-10 rounded-full bg-primary text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center"
    >
      <HelpCircle className="h-4 w-4" />
    </button>
  );
}
