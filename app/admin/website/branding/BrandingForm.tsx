"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { ImageUploader } from "@/components/app/ImageUploader";
import { SITE_ICON_NAMES, siteIcon } from "@/lib/site-icons";
import type { FooterTrustItem } from "@/lib/platform-settings";
import { saveWebsiteSettings, saveFooterTrustItems } from "../actions";

export function BrandingForm({
  branding,
}: {
  branding: { logoUrl: string; faviconUrl: string; footerTagline: string; footerCopyright: string; footerTrust: FooterTrustItem[] };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const [logoUrl, setLogoUrl] = useState(branding.logoUrl);
  const [faviconUrl, setFaviconUrl] = useState(branding.faviconUrl);
  const [tagline, setTagline] = useState(branding.footerTagline);
  const [copyright, setCopyright] = useState(branding.footerCopyright);
  const [trust, setTrust] = useState<FooterTrustItem[]>(branding.footerTrust);

  const saveBranding = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("site_logo_url", logoUrl);
      fd.set("site_favicon_url", faviconUrl);
      fd.set("footer_tagline", tagline);
      fd.set("footer_copyright", copyright);
      await saveWebsiteSettings(fd);
      toast("Saved", "success");
      router.refresh();
    });

  const saveTrust = () =>
    start(async () => {
      await saveFooterTrustItems(trust);
      toast("Saved", "success");
      router.refresh();
    });

  const updateTrust = (i: number, patch: Partial<FooterTrustItem>) => setTrust((t) => t.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Logo & favicon</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex items-center gap-4">
            <ImageUploader
              value={logoUrl ? [logoUrl] : []}
              onChange={(urls) => setLogoUrl(urls[urls.length - 1] ?? "")}
              max={1}
              compact
              signEndpoint="/api/admin/media/sign"
              recordMetadata={false}
            />
            <div>
              <p className="text-sm font-medium text-fg">Site logo</p>
              <p className="text-xs text-fg-subtle">Shown in the header and footer. Leave empty to use the default Zotomic mark.</p>
              {logoUrl && (
                <button type="button" onClick={() => setLogoUrl("")} className="mt-1 flex items-center gap-1 text-xs text-fg-subtle hover:text-danger">
                  <RotateCcw className="h-3 w-3" /> Reset to default
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ImageUploader
              value={faviconUrl ? [faviconUrl] : []}
              onChange={(urls) => setFaviconUrl(urls[urls.length - 1] ?? "")}
              max={1}
              compact
              signEndpoint="/api/admin/media/sign"
              recordMetadata={false}
            />
            <div>
              <p className="text-sm font-medium text-fg">Favicon</p>
              <p className="text-xs text-fg-subtle">Browser tab icon, site-wide. Square image recommended. Leave empty to use the default.</p>
              {faviconUrl && (
                <button type="button" onClick={() => setFaviconUrl("")} className="mt-1 flex items-center gap-1 text-xs text-fg-subtle hover:text-danger">
                  <RotateCcw className="h-3 w-3" /> Reset to default
                </button>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Footer</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <Field label="Tagline (under the logo)">
            <Textarea value={tagline} onChange={(e) => setTagline(e.target.value)} rows={2} />
          </Field>
          <Field label="Copyright line">
            <Input value={copyright} onChange={(e) => setCopyright(e.target.value)} placeholder="Zotomic. All rights reserved." />
            <p className="mt-1 text-xs text-fg-subtle">The current year is added automatically before this text.</p>
          </Field>
        </CardBody>
      </Card>

      <Button disabled={pending} onClick={saveBranding}>
        {pending ? "Saving…" : "Save logo, favicon & footer text"}
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Footer trust strip</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-xs text-fg-subtle">The 4 cards shown at the top of the footer on every page.</p>
          {trust.map((t, i) => {
            const Icon = siteIcon(t.icon);
            return (
              <div key={i} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[100px_1fr_1fr]">
                <Field label="Icon">
                  <Select value={t.icon} onChange={(e) => updateTrust(i, { icon: e.target.value })}>
                    {SITE_ICON_NAMES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                  <Icon className="mt-1 h-4 w-4 text-primary" />
                </Field>
                <Field label="Title">
                  <Input value={t.title} onChange={(e) => updateTrust(i, { title: e.target.value })} />
                </Field>
                <Field label="Text">
                  <Input value={t.text} onChange={(e) => updateTrust(i, { text: e.target.value })} />
                </Field>
              </div>
            );
          })}
          <Button disabled={pending} onClick={saveTrust} variant="secondary">
            {pending ? "Saving…" : "Save trust strip"}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
