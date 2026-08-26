import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "../ds/button.js";

export function PlaybookCopyButton({ value, label = "text" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      aria-label={`Copy ${label}`}
      data-testid="opencode-playbook-copy"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1_500);
        });
      }}
      size="sm"
      type="button"
      variant="ghost"
    >
      {copied ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
      <span className="ml-1">{copied ? "Copied" : "Copy"}</span>
    </Button>
  );
}
