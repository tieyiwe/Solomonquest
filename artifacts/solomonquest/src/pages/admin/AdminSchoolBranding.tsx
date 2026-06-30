import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext";

const FONT_OPTIONS = [
  "Inter",
  "Poppins",
  "Merriweather",
  "Playfair Display",
  "Montserrat",
];

interface BrandingState {
  logo_url: string;
  slug: string;
  tagline: string;
  banner_url: string;
  primary_color: string;
  secondary_color: string;
  heading_font: string;
  heading_color: string;
  custom_css: string;
}

interface SlugStatus {
  checking: boolean;
  available: boolean | null;
  message: string;
}

export default function AdminSchoolBranding() {
  const { user, schoolId, schoolName } = useAuth() as {
    user: unknown;
    schoolId: string | null;
    schoolName: string | null;
  };

  const [branding, setBranding] = useState<BrandingState>({
    logo_url: "",
    slug: "",
    tagline: "",
    banner_url: "",
    primary_color: "#4f46e5",
    secondary_color: "#7c3aed",
    heading_font: "Inter",
    heading_color: "#1e1b4b",
    custom_css: "",
  });

  const [originalSlug, setOriginalSlug] = useState("");
  const [slugStatus, setSlugStatus] = useState<SlugStatus>({
    checking: false,
    available: null,
    message: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Load current school data
  useEffect(() => {
    if (!schoolId) return;
    fetch(`/api/schools/my`, { credentials: "include" })
      .then((r) => r.json())
      .then((school) => {
        setBranding({
          logo_url: school.logoUrl ?? "",
          slug: school.slug ?? "",
          tagline: school.tagline ?? "",
          banner_url: school.bannerUrl ?? "",
          primary_color: school.primaryColor ?? "#4f46e5",
          secondary_color: school.secondaryColor ?? "#7c3aed",
          heading_font: school.headingFont ?? "Inter",
          heading_color: school.headingColor ?? "#1e1b4b",
          custom_css: school.customCss ?? "",
        });
        setOriginalSlug(school.slug ?? "");
      })
      .catch(() => {});
  }, [schoolId]);

  // Debounced slug check
  const checkSlug = useCallback(
    (() => {
      let timer: ReturnType<typeof setTimeout>;
      return (slug: string, original: string) => {
        clearTimeout(timer);
        if (!slug) {
          setSlugStatus({ checking: false, available: null, message: "" });
          return;
        }
        if (!/^[a-z0-9-]+$/.test(slug)) {
          setSlugStatus({
            checking: false,
            available: false,
            message: "Only lowercase letters, numbers, and hyphens allowed",
          });
          return;
        }
        if (slug === original) {
          setSlugStatus({ checking: false, available: true, message: "Current slug" });
          return;
        }
        setSlugStatus({ checking: true, available: null, message: "Checking..." });
        timer = setTimeout(async () => {
          try {
            const r = await fetch(`/api/schools/slug/${slug}`);
            if (r.status === 404) {
              setSlugStatus({ checking: false, available: true, message: "Available!" });
            } else {
              setSlugStatus({ checking: false, available: false, message: "Slug already taken" });
            }
          } catch {
            setSlugStatus({ checking: false, available: null, message: "" });
          }
        }, 500);
      };
    })(),
    []
  );

  function handleChange<K extends keyof BrandingState>(key: K, value: BrandingState[K]) {
    setBranding((prev) => ({ ...prev, [key]: value }));
    if (key === "slug") {
      checkSlug(value as string, originalSlug);
    }
  }

  async function handleSave() {
    if (!schoolId) return;
    if (slugStatus.available === false) return;

    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch(`/api/schools/${schoolId}/branding`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(branding),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveMessage({ type: "error", text: data.error ?? "Failed to save" });
      } else {
        setOriginalSlug(data.slug ?? branding.slug);
        setSaveMessage({ type: "success", text: "Branding saved successfully!" });
      }
    } catch {
      setSaveMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  const previewStyle = {
    "--primary": branding.primary_color,
    "--secondary": branding.secondary_color,
    "--heading-color": branding.heading_color,
    "--heading-font": branding.heading_font,
  } as React.CSSProperties;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">School Branding</h1>
          <p className="text-gray-500 mt-1">Customize your school's public homepage appearance</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* ── Edit panel ── */}
          <div className="lg:w-1/2 space-y-5">
            {/* Logo */}
            <Section title="Logo">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-white flex-shrink-0">
                  {branding.logo_url ? (
                    <img src={branding.logo_url} alt="Logo preview" className="w-full h-full object-contain" />
                  ) : (
                    <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>
                <input
                  type="url"
                  value={branding.logo_url}
                  onChange={(e) => handleChange("logo_url", e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="flex-1 input-field"
                />
              </div>
            </Section>

            {/* Slug */}
            <Section title="School URL Slug">
              <div className="flex items-center rounded-lg border border-gray-300 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500">
                <span className="px-3 py-2 bg-gray-100 text-gray-500 text-sm whitespace-nowrap border-r border-gray-300">
                  solomonquest.app/schools/
                </span>
                <input
                  type="text"
                  value={branding.slug}
                  onChange={(e) => handleChange("slug", e.target.value.toLowerCase())}
                  placeholder="my-school"
                  className="flex-1 px-3 py-2 text-sm focus:outline-none"
                />
              </div>
              {slugStatus.message && (
                <p className={`text-xs mt-1 ${slugStatus.available ? "text-green-600" : "text-red-500"}`}>
                  {slugStatus.checking ? "..." : slugStatus.message}
                </p>
              )}
            </Section>

            {/* Tagline */}
            <Section title="Tagline">
              <input
                type="text"
                value={branding.tagline}
                onChange={(e) => handleChange("tagline", e.target.value)}
                placeholder="Empowering learners worldwide"
                className="input-field"
              />
            </Section>

            {/* Banner URL */}
            <Section title="Banner Image URL">
              <input
                type="url"
                value={branding.banner_url}
                onChange={(e) => handleChange("banner_url", e.target.value)}
                placeholder="https://example.com/banner.jpg"
                className="input-field"
              />
            </Section>

            {/* Colors */}
            <Section title="Colors">
              <div className="space-y-3">
                <ColorField
                  label="Primary Color"
                  value={branding.primary_color}
                  onChange={(v) => handleChange("primary_color", v)}
                />
                <ColorField
                  label="Secondary Color"
                  value={branding.secondary_color}
                  onChange={(v) => handleChange("secondary_color", v)}
                />
              </div>
            </Section>

            {/* Typography */}
            <Section title="Typography">
              <div className="space-y-3">
                <div>
                  <label className="field-label">Heading Font</label>
                  <select
                    value={branding.heading_font}
                    onChange={(e) => handleChange("heading_font", e.target.value)}
                    className="input-field"
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <ColorField
                  label="Heading Text Color"
                  value={branding.heading_color}
                  onChange={(v) => handleChange("heading_color", v)}
                />
              </div>
            </Section>

            {/* Save */}
            <div className="flex items-center gap-4 pt-2">
              <button
                onClick={handleSave}
                disabled={saving || slugStatus.available === false}
                className="px-6 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? "Saving..." : "Save Branding"}
              </button>
              {branding.slug && (
                <a
                  href={`/schools/${branding.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-indigo-600 hover:underline"
                >
                  Preview Public Page →
                </a>
              )}
            </div>

            {saveMessage && (
              <p className={`text-sm ${saveMessage.type === "success" ? "text-green-600" : "text-red-500"}`}>
                {saveMessage.text}
              </p>
            )}
          </div>

          {/* ── Live Preview panel ── */}
          <div className="lg:w-1/2">
            <div className="sticky top-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Live Preview</p>
              <div
                style={previewStyle}
                className="rounded-xl border border-gray-200 overflow-hidden shadow-sm bg-white"
              >
                {/* Banner */}
                {branding.banner_url ? (
                  <div
                    className="h-32 bg-cover bg-center"
                    style={{ backgroundImage: `url(${branding.banner_url})` }}
                  />
                ) : (
                  <div
                    className="h-32 flex items-center justify-center"
                    style={{ background: `linear-gradient(135deg, var(--primary), var(--secondary))` }}
                  >
                    <span className="text-white/50 text-sm">Banner image</span>
                  </div>
                )}

                {/* School identity */}
                <div className="px-6 py-4 flex items-center gap-4 border-b border-gray-100">
                  <div className="w-14 h-14 rounded-lg border border-gray-200 flex items-center justify-center bg-gray-50 flex-shrink-0 overflow-hidden">
                    {branding.logo_url ? (
                      <img src={branding.logo_url} alt="logo" className="w-full h-full object-contain" />
                    ) : (
                      <svg className="w-7 h-7 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <h2
                      style={{
                        fontFamily: `'${branding.heading_font}', sans-serif`,
                        color: branding.heading_color,
                      }}
                      className="text-lg font-bold leading-tight"
                    >
                      {schoolName ?? "Your School Name"}
                    </h2>
                    {branding.tagline && (
                      <p className="text-sm text-gray-500 mt-0.5">{branding.tagline}</p>
                    )}
                  </div>
                </div>

                {/* Sample courses */}
                <div className="px-6 py-4">
                  <h3
                    style={{
                      fontFamily: `'${branding.heading_font}', sans-serif`,
                      color: branding.heading_color,
                    }}
                    className="text-sm font-semibold mb-3"
                  >
                    Featured Courses
                  </h3>
                  <div className="space-y-2">
                    {["Introduction to Algebra", "Creative Writing 101", "Web Development Basics"].map((course) => (
                      <div key={course} className="flex items-center gap-3 p-2 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors">
                        <div
                          className="w-2 h-8 rounded-full flex-shrink-0"
                          style={{ backgroundColor: branding.primary_color }}
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-800">{course}</p>
                          <p className="text-xs text-gray-400">8 lessons</p>
                        </div>
                        <div
                          className="ml-auto text-xs font-medium px-2 py-1 rounded-full text-white"
                          style={{ backgroundColor: branding.primary_color }}
                        >
                          Enroll
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CTA */}
                <div className="px-6 pb-5">
                  <button
                    className="w-full py-2 rounded-lg text-white text-sm font-semibold"
                    style={{ backgroundColor: branding.primary_color }}
                  >
                    Get Started
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scoped utility classes via style tag */}
      <style>{`
        .input-field {
          display: block;
          width: 100%;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          border: 1px solid #d1d5db;
          border-radius: 0.5rem;
          background: white;
          outline: none;
          transition: box-shadow 0.15s;
        }
        .input-field:focus {
          box-shadow: 0 0 0 2px #6366f1;
          border-color: transparent;
        }
        .field-label {
          display: block;
          font-size: 0.75rem;
          font-weight: 600;
          color: #6b7280;
          margin-bottom: 0.375rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
      `}</style>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-9 rounded border border-gray-300 cursor-pointer p-0.5 bg-white"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#4f46e5"
          maxLength={7}
          className="w-28 input-field font-mono"
        />
      </div>
    </div>
  );
}
