import { extractBrand, BrandExtraction } from "./brands";

export type ParsedProduct = {
  legacyCode: string;
  sourceNameRaw: string;
  canonicalName: string;
  brand: BrandExtraction;
  aliasTokens: { text: string; type: "brand_token" | "model_token" | "descriptor_token" }[];
  needsReview: boolean;
  reviewNotes: string[];
};

// Collapse whitespace/punctuation noise without changing meaning.
function cleanWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// A very small set of Armenian nouns that show up as trailing "descriptor"
// words in this catalogue (guitar, case, cable, connector, stage light,
// microphone, etc). Not exhaustive — used only to split off a searchable
// descriptor token, never to infer a category with confidence.
const ARMENIAN_DESCRIPTOR_HINTS = [
  "կիթառ", "կիթառի", "լար", "միացնող", "պատյան", "աքսեսուար", "բեմական",
  "միկրաֆոն", "ֆիլդեր", "հենակ", "ուժեղարար", "բարձրախոս",
];

function looksLikeGluedSkuToken(token: string): boolean {
  // e.g. "MXL_GENESIS_HE_EU", "DWCP5000TD4" — legacy POS SKU codes glued
  // into the name with underscores or no separators, not a real word.
  return /_/.test(token) || (/^[A-Z0-9]{6,}$/.test(token) && /\d/.test(token));
}

export function parseProductName(legacyCode: string, rawName: string): ParsedProduct {
  const sourceNameRaw = rawName;
  const notes: string[] = [];
  let working = cleanWhitespace(rawName);

  // Flag (but don't "fix") names that look corrupted / truncated, e.g.
  // starting with a lowercase fragment where a brand token would be
  // expected ("nder American PRO II ..." missing "Fe").
  if (/^[a-z]{2,5}\s+[A-Z]/.test(working)) {
    notes.push("Name may be truncated/corrupted (starts with a short lowercase fragment).");
  }

  const brand = extractBrand(working);
  if (brand.confidence === "unknown") {
    notes.push("No brand token could be identified from the name.");
  } else if (brand.confidence === "guessed") {
    notes.push(`Brand "${brand.brand}" is an unconfirmed guess (first token heuristic).`);
  }

  // canonical name: cleaned original, brand casing normalized if confirmed.
  let canonicalName = working;
  if (brand.confidence === "confirmed" && brand.brand) {
    const re = new RegExp("\\b" + brand.brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+") + "\\b", "i");
    canonicalName = canonicalName.replace(re, brand.brand);
  }

  // token-level aliases: split remaining words into model/descriptor tokens,
  // useful for autocomplete on partial model numbers or descriptor words.
  const aliasTokens: ParsedProduct["aliasTokens"] = [];
  if (brand.brand) {
    aliasTokens.push({ text: brand.brand, type: "brand_token" });
  }

  const rest = working
    .split(/\s+/)
    .filter((t) => t && t.toLowerCase() !== (brand.brand ?? "").toLowerCase());

  for (const token of rest) {
    if (token.length < 2) continue;
    if (looksLikeGluedSkuToken(token)) {
      // still index it — employees may search by the legacy SKU-ish code —
      // but flag it for review since it's not a human-readable word.
      aliasTokens.push({ text: token, type: "model_token" });
      notes.push(`Token "${token}" looks like a glued legacy SKU code, kept as searchable but not descriptive.`);
      continue;
    }
    if (ARMENIAN_DESCRIPTOR_HINTS.includes(token.toLowerCase())) {
      aliasTokens.push({ text: token, type: "descriptor_token" });
    } else if (/^[A-Za-z0-9,.\-]+$/.test(token)) {
      aliasTokens.push({ text: token, type: "model_token" });
    }
    // other Armenian words are left as part of canonical_name / full-text
    // search (search_tsv) but not duplicated as a separate alias row.
  }

  const needsReview = notes.length > 0;

  return {
    legacyCode,
    sourceNameRaw,
    canonicalName,
    brand,
    aliasTokens,
    needsReview,
    reviewNotes: notes,
  };
}
