"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { updateOrganizationAction } from "../actions/settings.actions";

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  legalName: string | null;
  email: string;
  phone: string | null;
  logoUrl: string | null;
  currency: string;
  timezone: string;
  plan: string;
}

export function OrganizationForm({ organization }: { organization: OrganizationRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: organization.name,
    legalName: organization.legalName ?? "",
    email: organization.email,
    phone: organization.phone ?? "",
    currency: organization.currency,
    timezone: organization.timezone,
    logoUrl: organization.logoUrl ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = () =>
    startTransition(async () => {
      const result = await updateOrganizationAction(form);
      if (result.ok) {
        setErrors({});
        toast.success("Organization updated");
        router.refresh();
      } else {
        setErrors(result.error.fields ?? {});
        toast.error(result.error.message);
      }
    });

  const field = (
    key: keyof typeof form,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
  ) => (
    <div className="space-y-2">
      <Label htmlFor={`org-${key}`}>{label}</Label>
      <Input id={`org-${key}`} value={form[key]} onChange={set(key)} {...props} />
      {errors[key] && <p className="text-xs text-red-600">{errors[key]}</p>}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Organization profile</CardTitle>
        <CardDescription>
          Slug <code className="font-mono">{organization.slug}</code> · plan{" "}
          <span className="capitalize">{organization.plan}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {field("name", "Display name *")}
          {field("legalName", "Legal name")}
          {field("email", "Billing email *", { type: "email" })}
          {field("phone", "Phone")}
          {field("currency", "Currency *", { placeholder: "USD", maxLength: 3 })}
          {field("timezone", "Timezone *", { placeholder: "America/New_York" })}
        </div>
        {field("logoUrl", "Logo URL", { placeholder: "https://…" })}
        <div className="flex justify-end">
          <Button onClick={submit} disabled={pending || !form.name.trim() || !form.email.trim()}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
