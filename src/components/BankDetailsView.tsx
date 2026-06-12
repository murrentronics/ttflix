import { useState } from "react";
import { Copy, Check } from "lucide-react";
import type { BankDetails } from "@/lib/admin";

const ROWS: { key: keyof BankDetails; label: string }[] = [
  { key: "bank_name", label: "Bank" },
  { key: "account_name", label: "Account Name" },
  { key: "account_number", label: "Account Number" },
  { key: "account_type", label: "Account Type" },
  { key: "branch", label: "Branch" },
];

export function BankDetailsView({ details }: { details: BankDetails | null }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      /* clipboard not available */
    }
  };

  const hasAny = details && ROWS.some((r) => details[r.key]);

  if (!hasAny) {
    return (
      <p className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Bank transfer details have not been set up yet. Please check back shortly.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {ROWS.map((r) => {
        const value = (details?.[r.key] ?? "").toString();
        if (!value) return null;
        return (
          <div
            key={r.key}
            className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{r.label}</p>
              <p className="truncate font-medium">{value}</p>
            </div>
            <button
              type="button"
              onClick={() => copy(r.key, value)}
              className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition hover:bg-accent"
              aria-label={`Copy ${r.label}`}
            >
              {copied === r.key ? (
                <>
                  <Check className="h-3.5 w-3.5 text-primary" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Copy
                </>
              )}
            </button>
          </div>
        );
      })}
      {details?.instructions && (
        <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          {details.instructions}
        </div>
      )}
    </div>
  );
}
