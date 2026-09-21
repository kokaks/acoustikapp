// Curated brand list, derived from frequency analysis of the real source
// data (first-token frequency across all 5,632 product names) plus a small
// number of multi-word / inconsistently-cased brands found by inspection.
// Longest names first so multi-word brands match before a bare first token.
// This list is meant to be extended over time (e.g. via admin UI) as new
// products are imported — never silently invented for a single product.

export const KNOWN_BRANDS: string[] = [
  "Steinway & Sons",
  "Native Instruments",
  "Blackmagic Design",
  "Blackmagicdesign",
  "Mark Bass",
  "Audio-Technica",
  "D'Addario",
  "Daddario",
  "K&M",
  "Fender",
  "Cordial",
  "Neutrik",
  "Meinl",
  "RCF",
  "Squier",
  "Cort",
  "Jackson",
  "Chauvet",
  "Shure",
  "Gator",
  "Soundking",
  "Quiklok",
  "Pioneer",
  "Gretsch",
  "TSS",
  "PreSonus",
  "Edifier",
  "Casio",
  "Elixir",
  "Boya",
  "Videndum",
  "Crosley",
  "Aputure",
  "PDP",
  "UDG",
  "Admira",
  "Fzone",
  "Novation",
  "Evans",
  "Austrian",
  "Parsek",
  "Marshall",
  "Taylor",
  "Radial",
  "Kawai",
  "Phenyx",
  "Opera",
  "Focusrite",
  "Eko",
  "Alto",
  "Adam",
  "Artesia",
  "Jupiter",
  "Zoom",
  "FOCAL",
  "TOA",
  "Vinco",
  "Alhambra",
  "Akai",
  "Beyerdynamic",
  "Skyhope",
  "MXL",
  "Mogami",
  "DW",
];

// sorted longest-string-first so "Mark Bass" beats a lone "Mark" etc.
export const BRAND_MATCH_LIST = [...new Set(KNOWN_BRANDS)].sort(
  (a, b) => b.length - a.length
);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type BrandExtraction = {
  brand: string | null;
  confidence: "confirmed" | "guessed" | "unknown";
};

export function extractBrand(name: string): BrandExtraction {
  const clean = name.trim();
  for (const brand of BRAND_MATCH_LIST) {
    const re = new RegExp(
      "\\b" + escapeRegex(brand).replace(/\s+/g, "\\s+") + "\\b",
      "i"
    );
    if (re.test(clean)) {
      return { brand, confidence: "confirmed" };
    }
  }
  // Fallback: a capitalized first token with no digits/underscores looks
  // brand-like but is unconfirmed — always surfaced to review, never
  // silently trusted at the same level as a curated match.
  const first = clean.split(/\s+/)[0];
  if (/^[A-Z][A-Za-z&'.-]+$/.test(first)) {
    return { brand: first, confidence: "guessed" };
  }
  return { brand: null, confidence: "unknown" };
}
