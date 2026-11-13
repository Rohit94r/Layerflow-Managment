import { Fragment } from "react";

/**
 * Minimal, safe Markdown renderer. Builds React elements directly (no HTML injection),
 * and only allows http(s) and mailto links.
 */

function safeHref(url: string) {
  return /^(https?:\/\/|mailto:)/i.test(url) ? url : null;
}

function inline(text: string, key = 0): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s<]+[^\s<.,:;"')\]])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${key}-${i++}`;
    if (m[1]) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{inline(tok.slice(2, -2), i)}</strong>);
    else if (m[3]) out.push(<em key={k}>{inline(tok.slice(1, -1), i)}</em>);
    else if (m[4]) {
      const [, labelText, url] = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/) ?? [];
      const href = safeHref(url ?? "");
      out.push(href ? <a key={k} href={href} target="_blank" rel="noopener noreferrer nofollow">{labelText}</a> : labelText);
    } else if (m[5]) out.push(<a key={k} href={tok} target="_blank" rel="noopener noreferrer nofollow">{tok}</a>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) code.push(lines[i++]!);
      i++;
      blocks.push(<pre key={k++}><code>{code.join("\n")}</code></pre>);
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1]!.length;
      const content = inline(h[2]!, k);
      blocks.push(level === 1 ? <h2 key={k++}>{content}</h2> : level === 2 ? <h2 key={k++}>{content}</h2> : <h3 key={k++}>{content}</h3>);
      i++;
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*([-*]|\d+\.)\s+/, ""));
      const children = items.map((it, j) => {
        const task = it.match(/^\[( |x|X)\]\s*(.*)$/);
        return (
          <li key={j} className={task ? "list-none -ml-5" : undefined}>
            {task ? (
              <span className="inline-flex items-start gap-2">
                <input type="checkbox" checked={task[1] !== " "} readOnly disabled className="mt-1.5" />
                <span>{inline(task[2]!, j)}</span>
              </span>
            ) : (
              inline(it, j)
            )}
          </li>
        );
      });
      blocks.push(ordered ? <ol key={k++}>{children}</ol> : <ul key={k++}>{children}</ul>);
      continue;
    }
    if (line.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i]!.startsWith(">")) quote.push(lines[i++]!.replace(/^>\s?/, ""));
      blocks.push(<blockquote key={k++}>{inline(quote.join(" "), k)}</blockquote>);
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,3}\s|```|>|\s*([-*]|\d+\.)\s)/.test(lines[i]!)) para.push(lines[i++]!);
    blocks.push(
      <p key={k++}>
        {para.map((p, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(p, j)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <div className="prose-doc">{blocks}</div>;
}
