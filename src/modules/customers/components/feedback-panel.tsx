"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, Check, MessageSquareWarning } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { resolveFeedbackAction } from "../actions/customer.actions";

export interface FeedbackRow {
  id: string;
  customerName: string;
  rating: number;
  comment: string | null;
  isComplaint: boolean;
  resolvedAt: Date | string | null;
  createdAt: Date | string;
}

interface Props {
  feedback: FeedbackRow[];
  openComplaints: number;
}

const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

export function FeedbackPanel({ feedback, openComplaints }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const resolve = (id: string) =>
    startTransition(async () => {
      const result = await resolveFeedbackAction({ feedbackId: id });
      if (result.ok) {
        toast.success("Marked as resolved");
        router.refresh();
      } else toast.error(result.error.message);
    });

  const averageRating =
    feedback.length > 0
      ? (feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length).toFixed(1)
      : "—";

  return (
    <Card className="gap-0 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Recent feedback</h2>
          <p className="text-sm text-muted-foreground">
            Average rating {averageRating}
            {openComplaints > 0 && (
              <span className="ml-2 font-medium text-destructive">
                {openComplaints} unresolved complaint{openComplaints === 1 ? "" : "s"}
              </span>
            )}
          </p>
        </div>
        <MessageSquareWarning
          className={cn("size-4", openComplaints > 0 ? "text-destructive" : "text-muted-foreground")}
          aria-hidden
        />
      </div>

      <ul className="mt-4 divide-y">
        {feedback.length === 0 && (
          <li className="py-6 text-center text-sm text-muted-foreground">No feedback yet.</li>
        )}
        {feedback.map((item) => (
          <li key={item.id} className="flex items-start gap-3 py-3">
            <div className="flex w-16 shrink-0 items-center gap-0.5" aria-label={`${item.rating} of 5`}>
              {Array.from({ length: 5 }, (_, i) => (
                <Star
                  key={i}
                  className={cn(
                    "size-3",
                    i < item.rating ? "fill-yellow-500 text-yellow-500" : "text-muted",
                  )}
                  aria-hidden
                />
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{item.customerName}</span>
                {item.isComplaint && (
                  <Badge variant={item.resolvedAt ? "secondary" : "destructive"} className="text-[10px]">
                    {item.resolvedAt ? "resolved" : "complaint"}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {dateFormat.format(new Date(item.createdAt))}
                </span>
              </div>
              {item.comment && (
                <p className="mt-0.5 text-sm text-muted-foreground">{item.comment}</p>
              )}
            </div>
            {item.isComplaint && !item.resolvedAt && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => resolve(item.id)}
              >
                <Check className="size-3.5" /> Resolve
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
