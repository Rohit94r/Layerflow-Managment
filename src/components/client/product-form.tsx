"use client";

import { FOCUSES, HEALTHS, LIFECYCLES, PRIORITIES, PRODUCT_ROLES, PRODUCT_TYPES, label } from "@/modules/portfolio/constants";
import type { ActionResult } from "@/server/action";
import { ActionForm, SubmitButton } from "./forms";

type Option = { id: string; name: string };
export type ProductFormValues = Partial<{
  name: string; slug: string; summary: string; description: string; type: string; brandColor: string;
  role: string; lifecycle: string; priority: string; focus: string; health: string; healthReason: string;
  ownerId: string | null; groupId: string | null; parentId: string | null; businessModel: string; targetAudience: string;
  strategicObjective: string; techStack: string[]; tags: string[]; launchDate: string | null; nextReviewDate: string | null;
}>;

const SWATCHES = ["#171717", "#525252", "#A3A3A3", "#1F7A3F", "#B42318", "#9A5B06", "#1D4ED8", "#7C3AED"];

function Select({ name, label: l, value, options, hint }: { name: string; label: string; value?: string | null; options: { value: string; label: string }[]; hint?: string }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{l}</label>
      <select id={name} name={name} className="input" defaultValue={value ?? ""}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

const opts = (xs: readonly string[]) => xs.map((v) => ({ value: v, label: label(v) }));

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-5 border-t border-line py-7 first:border-t-0 first:pt-0 lg:grid-cols-[220px_1fr]">
      <div>
        <h2 className="text-lg">{title}</h2>
        <p className="mt-1 text-[13px] text-muted">{description}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function ProductForm({
  action,
  values = {},
  people,
  groups,
  products,
  submitLabel,
}: {
  action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  values?: ProductFormValues;
  people: Option[];
  groups: Option[];
  products: Option[];
  submitLabel: string;
}) {
  const v = values;
  return (
    <ActionForm action={action}>
      {v.slug && <input type="hidden" name="currentSlug" value={v.slug} />}
      <Section title="Basics" description="What it is, in a sentence.">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="name">Name</label>
          <input id="name" name="name" className="input" defaultValue={v.name} required maxLength={80} autoFocus={!v.name} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="summary">One-line summary</label>
          <input id="summary" name="summary" className="input" defaultValue={v.summary} maxLength={200} placeholder="Who it's for and what it does" />
        </div>
        <Select name="type" label="Type" value={v.type ?? "saas"} options={opts(PRODUCT_TYPES)} />
        <div>
          <label className="label" htmlFor="brandColor">Colour</label>
          <div className="flex items-center gap-2">
            <input id="brandColor" name="brandColor" type="color" defaultValue={v.brandColor ?? "#171717"} className="h-[2.125rem] w-12 cursor-pointer rounded-md border border-line-strong bg-surface p-1" />
            <div className="flex flex-wrap gap-1">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Use ${c}`}
                  className="size-5 rounded border border-line"
                  style={{ background: c }}
                  onClick={(e) => {
                    const input = e.currentTarget.form?.elements.namedItem("brandColor") as HTMLInputElement | null;
                    if (input) input.value = c.toLowerCase();
                  }}
                />
              ))}
            </div>
          </div>
        </div>
        {v.slug && (
          <div className="sm:col-span-2">
            <label className="label" htmlFor="slug">URL address</label>
            <input id="slug" name="slug" className="input font-mono text-[13px]" defaultValue={v.slug} maxLength={48} />
            <p className="hint">Changing this changes the project&apos;s links.</p>
          </div>
        )}
      </Section>

      <Section title="Classification" description="Five independent dimensions. Stage is not health, and priority is not focus.">
        <Select name="lifecycle" label="Stage" value={v.lifecycle ?? "idea"} options={opts(LIFECYCLES)} />
        <Select name="role" label="Role among your projects" value={v.role ?? "secondary"} options={opts(PRODUCT_ROLES)} />
        <Select name="priority" label="Priority" value={v.priority ?? "p2"} options={opts(PRIORITIES)} />
        <Select name="focus" label="Focus" value={v.focus ?? "none"} options={opts(FOCUSES).map((o) => (o.value === "none" ? { ...o, label: "None" } : o))} />
        <Select name="health" label="Health" value={v.health ?? "unknown"} options={opts(HEALTHS)} hint="Your assessment. Leave Unknown until you have evidence." />
        <div>
          <label className="label" htmlFor="healthReason">Why this health?</label>
          <input id="healthReason" name="healthReason" className="input" defaultValue={v.healthReason} maxLength={500} placeholder="e.g. Signups down 30% after pricing change" />
        </div>
      </Section>

      <Section title="Ownership" description="Who is accountable, and where it sits.">
        <Select name="ownerId" label="Owner" value={v.ownerId} options={[{ value: "", label: v.name ? "Unassigned" : "Me (default)" }, ...people.map((p) => ({ value: p.id, label: p.name }))]} />
        <Select name="groupId" label="Group" value={v.groupId} options={[{ value: "", label: "No group" }, ...groups.map((g) => ({ value: g.id, label: g.name }))]} />
        <Select name="parentId" label="Parent project" value={v.parentId} options={[{ value: "", label: "None" }, ...products.map((p) => ({ value: p.id, label: p.name }))]} />
        <div>
          <label className="label" htmlFor="nextReviewDate">Next review</label>
          <input id="nextReviewDate" name="nextReviewDate" type="date" className="input" defaultValue={v.nextReviewDate ?? ""} />
          <p className="hint">Flagged on the command center once it passes.</p>
        </div>
      </Section>

      <Section title="Strategy & details" description="Optional, but it makes reviews faster.">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="strategicObjective">Current objective</label>
          <input id="strategicObjective" name="strategicObjective" className="input" defaultValue={v.strategicObjective} maxLength={500} placeholder="e.g. Reach 100 paying teams by March" />
        </div>
        <div>
          <label className="label" htmlFor="targetAudience">Target audience</label>
          <input id="targetAudience" name="targetAudience" className="input" defaultValue={v.targetAudience} maxLength={300} />
        </div>
        <div>
          <label className="label" htmlFor="businessModel">Business model</label>
          <input id="businessModel" name="businessModel" className="input" defaultValue={v.businessModel} maxLength={200} placeholder="e.g. Subscription, $12/seat" />
        </div>
        <div>
          <label className="label" htmlFor="techStack">Tech stack</label>
          <input id="techStack" name="techStack" className="input" defaultValue={v.techStack?.join(", ")} placeholder="Next.js, Postgres, Vercel" />
          <p className="hint">Comma separated.</p>
        </div>
        <div>
          <label className="label" htmlFor="tags">Tags</label>
          <input id="tags" name="tags" className="input" defaultValue={v.tags?.join(", ")} placeholder="b2b, ai, side-project" />
        </div>
        <div>
          <label className="label" htmlFor="launchDate">Launch date</label>
          <input id="launchDate" name="launchDate" type="date" className="input" defaultValue={v.launchDate ?? ""} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="description">Description</label>
          <textarea id="description" name="description" className="input" rows={5} defaultValue={v.description} maxLength={5000} />
        </div>
      </Section>

      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:mx-0 sm:px-0">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
