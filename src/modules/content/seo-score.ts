/**
 * Deterministic on-page SEO and readability checks for a Markdown post.
 * Pure (no I/O) so it runs live in the editor, on save, and inside tests.
 * These are writing-quality heuristics, not a prediction of rankings.
 */
export type CheckStatus = "pass" | "warn" | "fail";
export type ContentCheck = { id: string; label: string; status: CheckStatus; detail: string; weight: number };
export type ContentAnalysis = {
  score: number;
  wordCount: number;
  readingMinutes: number;
  keywordCount: number;
  keywordDensity: number;
  checks: ContentCheck[];
};

export type AnalyzeInput = {
  title: string;
  slug: string;
  body: string;
  metaTitle?: string;
  metaDescription?: string;
  targetKeyword?: string;
  excerpt?: string;
};

/** Markdown → plain prose for counting (drops code, link targets, images, markup). */
export function plainText(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
const norm = (s: string) => words(s).join(" ");

function countPhrase(haystack: string[], phrase: string[]) {
  if (!phrase.length) return 0;
  let n = 0;
  for (let i = 0; i + phrase.length <= haystack.length; i++) {
    let ok = true;
    for (let j = 0; j < phrase.length; j++) if (haystack[i + j] !== phrase[j]) { ok = false; break; }
    if (ok) n++;
  }
  return n;
}

const contains = (text: string, kw: string) => Boolean(kw) && ` ${norm(text)} `.includes(` ${kw} `);

export function analyzeContent(input: AnalyzeInput): ContentAnalysis {
  const checks: ContentCheck[] = [];
  const add = (id: string, label: string, weight: number, status: CheckStatus, detail: string) => checks.push({ id, label, weight, status, detail });

  const body = input.body ?? "";
  const prose = plainText(body);
  const tokens = words(prose);
  const wordCount = tokens.length;
  const kw = norm(input.targetKeyword ?? "");
  const kwTokens = kw ? kw.split(" ") : [];
  const keywordCount = countPhrase(tokens, kwTokens);
  const keywordDensity = wordCount && kwTokens.length ? (keywordCount * kwTokens.length) / wordCount : 0;
  const seoTitle = (input.metaTitle || input.title || "").trim();
  const desc = (input.metaDescription ?? "").trim();
  const h2s = [...body.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]!);
  const h1InBody = /^#\s+\S/m.test(body);
  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p && !/^(#|```|[-*+]\s|\d+\.\s|>|!\[)/.test(p));
  const firstPara = plainText(paragraphs[0] ?? "");
  const links = [...body.matchAll(/(?<!!)\[[^\]]+\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g)].length;
  const images = [...body.matchAll(/!\[([^\]]*)\]\([^)]*\)/g)];
  const imagesNoAlt = images.filter((m) => !m[1]!.trim()).length;
  const sentences = prose.split(/(?<=[.!?])\s+/).map((s) => words(s).length).filter((n) => n > 0);
  const avgSentence = sentences.length ? sentences.reduce((a, b) => a + b, 0) / sentences.length : 0;
  const longestPara = paragraphs.reduce((m, p) => Math.max(m, words(plainText(p)).length), 0);

  // Keyword placement
  if (!kw) {
    add("keyword", "Target keyword set", 10, "fail", "Choose the one search phrase this post should rank for.");
  } else {
    add("keyword", "Target keyword set", 10, "pass", `“${input.targetKeyword!.trim()}”`);
    add("kw_title", "Keyword in SEO title", 10, contains(seoTitle, kw) ? "pass" : "fail", contains(seoTitle, kw) ? "Found in the title." : "Put the keyword (or a close variant) near the start of the title.");
    add("kw_intro", "Keyword in the introduction", 8, contains(firstPara, kw) ? "pass" : "warn", contains(firstPara, kw) ? "Found in the first paragraph." : "Mention the keyword naturally in the first paragraph.");
    const inH2 = h2s.some((h) => contains(h, kw));
    add("kw_h2", "Keyword in a subheading", 6, inH2 ? "pass" : "warn", inH2 ? "Found in an H2." : "Use the keyword or a variant in at least one ## heading.");
    const slugHas = contains(input.slug.replace(/-/g, " "), kw);
    add("kw_slug", "Keyword in URL slug", 5, slugHas ? "pass" : "warn", slugHas ? "Found in the slug." : "Include the keyword in the slug.");
    const pct = keywordDensity * 100;
    add(
      "kw_density", "Keyword density", 6,
      wordCount < 150 ? "warn" : pct > 3 ? "fail" : pct < 0.3 ? "warn" : "pass",
      wordCount < 150 ? "Too little text to judge." : pct > 3 ? `${pct.toFixed(1)}% looks like keyword stuffing; aim for 0.5–2.5%.` : pct < 0.3 ? `${pct.toFixed(1)}%: the keyword barely appears.` : `${pct.toFixed(1)}% (${keywordCount}×).`,
    );
  }

  // Metadata
  const tl = seoTitle.length;
  add("title_len", "SEO title length", 8, tl >= 30 && tl <= 60 ? "pass" : tl > 0 && tl <= 70 ? "warn" : "fail",
    tl === 0 ? "Missing title." : `${tl} characters (aim for 30–60 so it isn't truncated).`);
  const dl = desc.length;
  add("meta_desc", "Meta description", 8, dl >= 120 && dl <= 160 ? "pass" : dl >= 70 && dl <= 180 ? "warn" : "fail",
    dl === 0 ? "Missing. Write a 120–160 character summary that earns the click." : `${dl} characters (aim for 120–160).`);
  const slugOk = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(input.slug) && input.slug.length <= 60;
  add("slug", "Clean, short URL slug", 2, slugOk ? "pass" : "warn", slugOk ? `/${input.slug}` : "Use lowercase words separated by hyphens, under 60 characters.");
  add("excerpt", "Excerpt for listings and feeds", 2, (input.excerpt ?? "").trim().length >= 40 ? "pass" : "warn", (input.excerpt ?? "").trim() ? "Present." : "Add a one- or two-sentence excerpt.");

  // Depth and structure
  add("length", "Content depth", 12, wordCount >= 800 ? "pass" : wordCount >= 400 ? "warn" : "fail", `${wordCount.toLocaleString("en-US")} words${wordCount < 800 ? " (aim for 800+ for a full answer)" : ""}.`);
  add("headings", "Scannable structure", 6, h2s.length >= 2 ? "pass" : h2s.length === 1 ? "warn" : "fail", `${h2s.length} section heading(s) (##).`);
  add("single_h1", "Single H1", 4, h1InBody ? "warn" : "pass", h1InBody ? "The title is already the H1; use ## for sections in the body." : "Body uses ## and below.");
  add("links", "Links to related pages", 6, links >= 2 ? "pass" : links === 1 ? "warn" : "fail", `${links} link(s). Link to your product and to supporting sources.`);
  if (images.length) add("alt", "Image alt text", 3, imagesNoAlt ? "warn" : "pass", imagesNoAlt ? `${imagesNoAlt} image(s) without alt text.` : "All images have alt text.");

  // Readability
  add("sentences", "Sentence length", 6, !sentences.length ? "warn" : avgSentence <= 22 ? "pass" : avgSentence <= 28 ? "warn" : "fail",
    sentences.length ? `Average ${avgSentence.toFixed(0)} words per sentence (aim for ≤ 22).` : "No sentences yet.");
  add("paragraphs", "Paragraph length", 4, longestPara <= 150 ? "pass" : "warn", longestPara <= 150 ? "Paragraphs are a comfortable length." : `Longest paragraph is ${longestPara} words; split it up.`);

  const total = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.reduce((s, c) => s + c.weight * (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0), 0);
  return {
    score: total ? Math.round((got / total) * 100) : 0,
    wordCount,
    readingMinutes: Math.max(1, Math.round(wordCount / 230)),
    keywordCount,
    keywordDensity,
    checks,
  };
}
