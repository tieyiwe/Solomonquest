import { useEffect, useState } from "react";
import { Layers } from "lucide-react";
import { fetchPublicAdmissions, formatMoney, installmentHint, priceLabel, type PublicAdmissions } from "@/lib/admissions";

/**
 * "Programs & tuition" on the school's public page: each active program with
 * its price ("Free" when it has none) and, if the school charges one, the
 * application fee. Renders nothing for a school without programs.
 */
export function ProgramPricingSection({
  schoolId,
  primaryColor,
  headingColor,
  headingFontFamily,
  radiusClass,
  buttonTextColor,
  onApply,
}: {
  schoolId: string;
  primaryColor: string;
  headingColor?: string;
  headingFontFamily?: string;
  radiusClass: string;
  buttonTextColor: string;
  onApply: () => void;
}) {
  const [data, setData] = useState<PublicAdmissions | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPublicAdmissions(schoolId).then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  if (!data || data.programs.length === 0) return null;
  const fee = data.applicationFee;

  return (
    <section id="programs" className="py-16 bg-gray-50" aria-labelledby="programs-heading">
      <div className="max-w-7xl mx-auto px-4">
        <h2
          id="programs-heading"
          className="text-3xl font-bold mb-3 text-center"
          style={{ fontFamily: headingFontFamily, color: headingColor ?? primaryColor }}
        >
          Programs &amp; Tuition
        </h2>
        <p className="text-center text-gray-600 mb-10">
          {fee.required
            ? `Application fee: ${formatMoney(fee.amountCents, fee.currency)} (paid online when you apply).`
            : "Applying is free."}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.programs.map((p) => {
            const hint = installmentHint(p.price);
            const paid = !!p.price && p.price.amountCents > 0;
            return (
              <div key={p.id} className={`border border-gray-200 ${radiusClass} bg-white shadow-sm flex flex-col`} data-testid="public-program">
                <div className="p-5 flex-1 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Layers size={14} aria-hidden="true" />
                    {[p.code, p.level].filter(Boolean).join(" · ") || "Program"}
                  </div>
                  <h3 className="text-lg font-bold leading-snug" style={{ fontFamily: headingFontFamily, color: headingColor ?? primaryColor }}>
                    {p.name}
                  </h3>
                  {p.description && <p className="text-sm text-gray-600 line-clamp-3">{p.description}</p>}
                  <div className="mt-auto pt-3">
                    <p className={`text-2xl font-bold ${paid ? "text-gray-900" : "text-green-700"}`}>{priceLabel(p.price)}</p>
                    {hint && <p className="text-xs text-gray-500">{hint}</p>}
                    {p.price?.pricingNote && paid && <p className="text-xs text-gray-500 mt-0.5">{p.price.pricingNote}</p>}
                    {fee.required !== p.applicationFee.required || (p.applicationFee.required && p.applicationFee.amountCents !== fee.amountCents) ? (
                      <p className="text-xs text-gray-500 mt-1">
                        Application fee: {p.applicationFee.required ? formatMoney(p.applicationFee.amountCents, p.applicationFee.currency) : "free"}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="px-5 pb-5">
                  <button
                    onClick={onApply}
                    className={`w-full py-2 text-sm font-semibold ${radiusClass} hover:opacity-90 transition-opacity`}
                    style={{ background: primaryColor, color: buttonTextColor }}
                  >
                    Apply
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
