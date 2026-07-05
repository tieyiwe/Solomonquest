// Standard semester picker for course creation. Most schools run
// Spring/Summer/Fall terms, but some don't line up with those calendar
// months, so a "Custom" option is always included alongside the
// generated list of standard terms for the next few years.

export interface SemesterOption {
  value: string;
  label: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export const CUSTOM_SEMESTER_VALUE = "__custom__";

const STANDARD_SEASONS: { name: string; start: string; end: string }[] = [
  { name: "Spring", start: "01-15", end: "05-15" },
  { name: "Summer", start: "06-01", end: "08-15" },
  { name: "Fall", start: "08-25", end: "12-15" },
];

/** Generates standard Spring/Summer/Fall options for the current year through `yearsAhead` years out. */
export function generateSemesterOptions(
  currentYear: number,
  yearsAhead: number = 3
): SemesterOption[] {
  const options: SemesterOption[] = [];
  for (let year = currentYear; year <= currentYear + yearsAhead; year++) {
    for (const season of STANDARD_SEASONS) {
      const label = `${season.name} ${year}`;
      options.push({
        value: label,
        label,
        startDate: `${year}-${season.start}`,
        endDate: `${year}-${season.end}`,
      });
    }
  }
  return options;
}
