"use client";

import { useState } from "react";
import { useToast } from "@/lib/toast";

/** Click-to-copy icon button. Shows a brief check on success. */
export function CopyButton({ value, className = "" }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1100);
      toast.success("Copied to clipboard");
    } catch {
      // clipboard unavailable (insecure context / denied permission)
      toast.error("Couldn't copy — clipboard unavailable");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copy to clipboard"
      title={copied ? "Copied" : "Copy"}
      className={`inline-flex h-5 w-5 items-center justify-center rounded text-fg-dim transition-colors hover:bg-surface-3 hover:text-fg ${className}`}
    >
      {copied ? (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M13 4.5 6.5 11 3 7.5" stroke="var(--color-acc-green)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="5.25" y="5.25" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M3.25 10.5h-.5a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v.5" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      )}
    </button>
  );
}
