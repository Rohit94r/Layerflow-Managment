"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, CircleAlert, CircleCheck, CircleDashed, Eye, PenLine } from "lucide-react";
import { cn } from "@/lib/format";
import { analyzeContent, type ContentCheck } from "@/modules/content/seo-score";
import { FUNNEL_STAGES, SEARCH_INTENTS, postLabel } from "@/modules/content/constants";
import { savePostAction, schedulePostAction } from "@/modules/content/actions";
import { Markdown } from "@/components/markdown";
import { ActionForm, Modal, SubmitButton } from "./forms";

export type EditorPost = {
  id: string; title: string; slug: string; excerpt: string; body: string; metaTitle: string; metaDescription: string; targetKeyword: string;
  secondaryKeywords: string[]; searchIntent: string; funnelStage: string; canonicalUrl: string | null; coverImageUrl: string | null; authorName: string; tags: string[];
};

export function scoreTone(score: number) {
  return score >= 75 ? "text-good" : score >= 50 ? "text-warn" : "text-bad";
}

const ICON = { pass: CircleCheck, warn: CircleDashed, fail: CircleAlert } as const;
const TONE = { pass: "text-good", warn: "text-warn", fail: "text-bad" } as const;

function Checklist({ checks }: { checks: ContentCheck[] }) {
  const order = { fail: 0, warn: 1, pass: 2 } as const;
  return (
    <ul className="divide-y divide-line">
      {[...checks].sort((a, b) => order[a.status] - order[b.status] || b.weight - a.weight).map((c) => {
        const Icon = ICON[c.status];
        return (
          <li key={c.id} className="flex gap-2.5 px-4 py-2">
            <Icon className={cn("mt-0.5 size-4 shrink-0", TONE[c.status])} aria-label={c.status} />
            <div className="min-w-0">
              <div className="text-[13px] font-medium">{c.label}</div>
              <div className="text-[12px] text-muted">{c.detail}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function PostEditor({ slug, post, readOnly, publicBase }: { slug: string; post: EditorPost; readOnly: boolean; publicBase: string }) {
  const [v, setV] = useState(post);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [dirty, setDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const a = useMemo(() => analyzeContent(v), [v]);
  const set = (k: keyof EditorPost) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setV((x) => ({ ...x, [k]: e.target.value }));
    setDirty(true);
  };

  // Ctrl/Cmd+S saves; warn before leaving with unsaved edits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && !readOnly) {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [dirty, readOnly]);

  const seoTitle = v.metaTitle || v.title;
  return (
    <ActionForm action={savePostAction.bind(null, slug, post.id)} onSuccess={() => setDirty(false)} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4" ref={(el) => { formRef.current = el?.closest("form") ?? null; }}>
        <input name="title" value={v.title} onChange={set("title")} readOnly={readOnly} required maxLength={200} aria-label="Title" placeholder="Post title"
          className="w-full bg-transparent font-serif text-[1.7rem] leading-tight outline-none sm:text-[2rem]" />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
          <span>{a.wordCount.toLocaleString("en-US")} words · {a.readingMinutes} min read</span>
          {dirty && !readOnly && <span className="text-warn">Unsaved changes</span>}
          <span className="ml-auto hidden sm:inline">Markdown · Ctrl+S to save</span>
        </div>

        <div className="flex gap-1 border-b border-line" role="tablist" aria-label="Editor mode">
          {(["write", "preview"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={cn("-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px]", tab === t ? "border-cobalt font-medium" : "border-transparent text-muted hover:text-ink")}>
              {t === "write" ? <PenLine className="size-3.5" /> : <Eye className="size-3.5" />} {t === "write" ? "Write" : "Preview"}
            </button>
          ))}
        </div>
        <div className={tab === "write" ? "" : "hidden"}>
          <textarea name="body" value={v.body} onChange={set("body")} readOnly={readOnly} aria-label="Body (Markdown)"
            placeholder={"Start with a direct answer that includes your keyword.\n\n## First section\n\nShort paragraphs, practical steps, links to your product."}
            className="input min-h-[60vh] font-mono text-[13.5px] leading-relaxed" />
        </div>
        {tab === "preview" && (
          <article className="panel min-h-[40vh] p-5 sm:p-8">
            <h1 className="mb-4 text-[1.9rem] leading-tight">{v.title || "Untitled"}</h1>
            <Markdown source={v.body || "_Nothing written yet._"} mode="public" />
          </article>
        )}

        <details className="panel" open={!post.excerpt && !post.metaDescription}>
          <summary className="cursor-pointer px-4 py-3 font-serif text-[16px]">Search & social metadata</summary>
          <div className="grid gap-4 border-t border-line p-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="excerpt">Excerpt</label>
              <textarea id="excerpt" name="excerpt" value={v.excerpt} onChange={set("excerpt")} readOnly={readOnly} maxLength={500} className="input min-h-[4rem]" placeholder="One or two sentences for listings, RSS and social cards." />
            </div>
            <div>
              <label className="label" htmlFor="metaTitle">SEO title <span className="text-muted">({seoTitle.length}/60)</span></label>
              <input id="metaTitle" name="metaTitle" value={v.metaTitle} onChange={set("metaTitle")} readOnly={readOnly} maxLength={120} className="input" placeholder={v.title} />
            </div>
            <div>
              <label className="label" htmlFor="slug">URL slug</label>
              <input id="slug" name="slug" value={v.slug} onChange={set("slug")} readOnly={readOnly} maxLength={80} className="input font-mono text-[13px]" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="metaDescription">Meta description <span className="text-muted">({v.metaDescription.length}/160)</span></label>
              <textarea id="metaDescription" name="metaDescription" value={v.metaDescription} onChange={set("metaDescription")} readOnly={readOnly} maxLength={320} className="input min-h-[4rem]" />
            </div>
            <div>
              <label className="label" htmlFor="secondaryKeywords">Secondary keywords</label>
              <input id="secondaryKeywords" name="secondaryKeywords" defaultValue={post.secondaryKeywords.join(", ")} onChange={() => setDirty(true)} readOnly={readOnly} className="input" placeholder="comma, separated" />
            </div>
            <div>
              <label className="label" htmlFor="tags">Tags</label>
              <input id="tags" name="tags" defaultValue={post.tags.join(", ")} onChange={() => setDirty(true)} readOnly={readOnly} className="input" placeholder="guides, launch" />
            </div>
            <div>
              <label className="label" htmlFor="searchIntent">Search intent</label>
              <select id="searchIntent" name="searchIntent" defaultValue={post.searchIntent} disabled={readOnly} onChange={() => setDirty(true)} className="input">
                {SEARCH_INTENTS.map((s) => <option key={s} value={s}>{postLabel(s)}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="funnelStage">Funnel stage</label>
              <select id="funnelStage" name="funnelStage" defaultValue={post.funnelStage} disabled={readOnly} onChange={() => setDirty(true)} className="input">
                {FUNNEL_STAGES.map((s) => <option key={s} value={s}>{postLabel(s)}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="authorName">Author</label>
              <input id="authorName" name="authorName" defaultValue={post.authorName} onChange={() => setDirty(true)} readOnly={readOnly} maxLength={120} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="coverImageUrl">Cover image URL</label>
              <input id="coverImageUrl" name="coverImageUrl" type="url" defaultValue={post.coverImageUrl ?? ""} onChange={() => setDirty(true)} readOnly={readOnly} className="input" placeholder="https://…" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="canonicalUrl">Canonical URL</label>
              <input id="canonicalUrl" name="canonicalUrl" type="url" defaultValue={post.canonicalUrl ?? ""} onChange={() => setDirty(true)} readOnly={readOnly} className="input" placeholder="Only if this post's original lives elsewhere" />
              <p className="hint">Leave empty to use the published URL.</p>
            </div>
          </div>
        </details>
        {!readOnly && (
          <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-10 flex justify-end lg:bottom-4">
            <SubmitButton className="shadow-float" pendingLabel="Saving…">Save</SubmitButton>
          </div>
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">SEO score</h2>
            <span className={cn("font-serif text-[1.8rem] leading-none tabular-nums", scoreTone(a.score))}>{a.score}</span>
          </div>
          <div className="space-y-3 p-4">
            <div>
              <label className="label" htmlFor="targetKeyword">Target keyword</label>
              <input id="targetKeyword" name="targetKeyword" value={v.targetKeyword} onChange={set("targetKeyword")} readOnly={readOnly} maxLength={120} className="input" placeholder="e.g. hackathon planner" />
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
              <div className={cn("h-full rounded-full", a.score >= 75 ? "bg-good" : a.score >= 50 ? "bg-warn" : "bg-bad")} style={{ width: `${a.score}%` }} />
            </div>
            <p className="text-[11.5px] text-muted">On-page checks from the text you wrote. A writing aid, not a ranking prediction.</p>
          </div>
          <Checklist checks={a.checks} />
        </section>
        <section className="panel p-4">
          <div className="eyebrow mb-2">Search result preview</div>
          <div className="truncate text-[12px] text-ink-2">{publicBase}/{v.slug || "post"}</div>
          <div className="mt-0.5 line-clamp-2 text-[16px] leading-snug text-cobalt">{seoTitle.length > 60 ? `${seoTitle.slice(0, 57)}…` : seoTitle || "Add a title"}</div>
          <div className="mt-1 line-clamp-3 text-[12.5px] text-ink-2">{v.metaDescription || v.excerpt || "Add a meta description so search engines show your summary, not a random sentence."}</div>
          <p className="mt-2 text-[11px] text-muted">Approximation. Search engines may rewrite titles and snippets.</p>
        </section>
      </aside>
    </ActionForm>
  );
}

export function ScheduleButton({ slug, id, current }: { slug: string; id: string; current: string | null }) {
  const [tz] = useState(() => new Date().getTimezoneOffset());
  // Computed once on mount (default: tomorrow 09:00 local), so it never shifts while the dialog is open.
  const [defaultAt] = useState(() => {
    const d = current ? new Date(current) : new Date(Date.now() + 86400000);
    if (!current) d.setHours(9, 0, 0, 0);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  });
  return (
    <Modal trigger={<><CalendarClock className="size-3.5" /> {current ? "Reschedule" : "Schedule"}</>} title="Schedule publishing" triggerClassName="btn btn-secondary btn-sm">
      {(close) => (
        <ActionForm action={schedulePostAction.bind(null, slug, id)} onSuccess={close} className="space-y-4">
          <div>
            <label className="label" htmlFor="at">Publish at (your local time)</label>
            <input id="at" name="at" type="datetime-local" required defaultValue={defaultAt} className="input" />
            <input type="hidden" name="tz" value={tz} />
            <p className="hint">Posts go out on the next scheduler run after this time. With a daily scheduler that can be up to 24 hours later; run the scheduler hourly for precise timing.</p>
          </div>
          <div className="flex justify-end"><SubmitButton>Schedule</SubmitButton></div>
        </ActionForm>
      )}
    </Modal>
  );
}
