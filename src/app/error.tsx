"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="grid min-h-[60dvh] place-items-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-3xl">Something went wrong</h1>
        <p className="mt-2 text-ink-2">The error has been logged. Try again, and if it keeps happening, reload the page.</p>
        {error.digest && <p className="mt-2 font-mono text-[12px] text-muted">Reference: {error.digest}</p>}
        <button onClick={reset} className="btn btn-primary mt-6">Try again</button>
      </div>
    </div>
  );
}
