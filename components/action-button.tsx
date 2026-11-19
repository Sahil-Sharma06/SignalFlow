"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/app/actions";

type Props = {
  action: () => Promise<ActionResult<unknown>>;
  children: ReactNode;
  pending?: string;
  icon?: ReactNode;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  size?: "default" | "sm" | "xs" | "lg";
  className?: string;
  disabled?: boolean;
  onDone?: (r: ActionResult<unknown>) => void;
};

/** Runs a server action with a loading state and toasts the result. */
export function ActionButton({ action, children, pending, icon, variant = "default", size = "sm", className, disabled, onDone }: Props) {
  const [isPending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={disabled || isPending}
      onClick={() =>
        start(async () => {
          const id = toast.loading(pending ?? "Working…");
          try {
            const r = await action();
            if (r.ok) toast.success(r.message, { id });
            else toast.error(r.message, { id });
            onDone?.(r);
            router.refresh();
          } catch {
            toast.error("Request failed", { id });
          }
        })
      }
    >
      {isPending ? <Loader2 className="animate-spin" /> : icon}
      {children}
    </Button>
  );
}
