import type { FormValues } from "@calcom/features/eventtypes/lib/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { validateNexusCustomCode } from "@calcom/prisma/nexus-custom-code";
import type { NexusAppearance } from "@calcom/prisma/zod-utils";
import { Alert } from "@calcom/ui/components/alert";
import { Button } from "@calcom/ui/components/button";
import { Label, Switch, TextAreaField, TextField } from "@calcom/ui/components/form";
import { TriangleAlertIcon } from "@coss/ui/icons";
import { useMemo } from "react";
import { useFormContext } from "react-hook-form";
import { buildPreviewDocument } from "./buildPreviewDocument";

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

type ColorKey = "primaryColor" | "backgroundColor";

const ColorField = ({
  label,
  value,
  fallback,
  clearLabel,
  testId,
  error,
  onChange,
}: {
  label: string;
  value?: string | null;
  fallback: string;
  clearLabel: string;
  testId: string;
  error?: string;
  onChange: (value: string | null) => void;
}) => {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          className="h-9 w-12 cursor-pointer rounded-md border border-default bg-default p-1"
          value={value && HEX_COLOR.test(value) && value.length === 7 ? value : fallback}
          onChange={(event) => onChange(event.target.value)}
        />
        <TextField
          containerClassName="max-w-40"
          className="font-mono"
          data-testid={testId}
          placeholder={fallback}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value.trim() || null)}
        />
        {value && (
          <Button type="button" color="minimal" size="sm" onClick={() => onChange(null)}>
            {clearLabel}
          </Button>
        )}
      </div>
      {error && (
        <div data-testid={`${testId}-error`}>
          <Alert className="mt-1" severity="error" message={error} />
        </div>
      )}
    </div>
  );
};

export const EventAppearanceTab = () => {
  const { t } = useLocale();
  const form = useFormContext<FormValues>();
  const appearance = (form.watch("metadata")?.nexusAppearance ?? {}) as NexusAppearance;
  const title = form.watch("title") ?? "";
  const length = form.watch("length");
  const customCode = appearance.customCode ?? "";
  const scriptBlocked = !validateNexusCustomCode(customCode).ok;

  // Validação no resolver do form (useEventTypeForm); aqui só se mostra o erro de cada campo.
  const fieldErrors = (
    form.formState.errors.metadata as
      | { nexusAppearance?: Partial<Record<keyof NexusAppearance, { message?: string }>> }
      | undefined
  )?.nexusAppearance;
  const errorText = (key: keyof NexusAppearance) => {
    const message = fieldErrors?.[key]?.message;
    return message ? t(message) : undefined;
  };

  const update = <K extends keyof NexusAppearance>(key: K, value: NexusAppearance[K]) => {
    form.setValue(
      "metadata.nexusAppearance",
      { ...appearance, [key]: value },
      { shouldDirty: true, shouldValidate: true }
    );
  };

  const previewDocument = useMemo(
    () =>
      buildPreviewDocument({
        appearance: scriptBlocked ? { ...appearance, customCode: "" } : appearance,
        title,
        durationLabel: `${length} ${t("minute_timeUnit")}`,
        buttonLabel: t("confirm"),
      }),
    // biome-ignore lint/correctness/useExhaustiveDependencies: appearance é reconstruído a cada watch
    [JSON.stringify(appearance), title, length, scriptBlocked, t]
  );

  const colors: { key: ColorKey; label: string; fallback: string; testId: string }[] = [
    {
      key: "primaryColor",
      label: t("nexus_appearance_primary_color"),
      fallback: "#111827",
      testId: "nexus-primary-color",
    },
    {
      key: "backgroundColor",
      label: t("nexus_appearance_background_color"),
      fallback: "#ffffff",
      testId: "nexus-background-color",
    },
  ];

  return (
    <div
      className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]"
      data-testid="nexus-appearance-tab">
      <div className="border-subtle min-w-0 rounded-lg border p-6 lg:col-start-1 lg:row-start-1">
        <h3 className="text-emphasis text-base font-semibold">{t("nexus_appearance_public_page")}</h3>
        <p className="text-subtle mb-4 text-sm">{t("nexus_appearance_public_page_description")}</p>
        <div className="stack-y-4">
          <TextField
            name="nexusCoverImageUrl"
            label={t("nexus_appearance_cover_image")}
            hint={t("nexus_appearance_cover_image_help")}
            data-testid="nexus-cover-url"
            type="url"
            placeholder="https://"
            value={appearance.coverImageUrl ?? ""}
            onChange={(event) => update("coverImageUrl", event.target.value.trim() || null)}
          />
          {errorText("coverImageUrl") && (
            <div data-testid="nexus-cover-url-error">
              <Alert severity="error" message={errorText("coverImageUrl")} />
            </div>
          )}
          {colors.map((color) => (
            <ColorField
              key={color.key}
              label={color.label}
              value={appearance[color.key]}
              fallback={color.fallback}
              clearLabel={t("nexus_appearance_color_clear")}
              testId={color.testId}
              error={errorText(color.key)}
              onChange={(value) => update(color.key, value)}
            />
          ))}
          <TextField
            name="nexusButtonText"
            label={t("nexus_appearance_button_text")}
            data-testid="nexus-button-text"
            maxLength={40}
            value={appearance.buttonText ?? ""}
            onChange={(event) => update("buttonText", event.target.value || null)}
          />
          <Switch
            label={t("nexus_appearance_show_title")}
            data-testid="nexus-show-title"
            checked={appearance.showTitle !== false}
            onCheckedChange={(checked) => update("showTitle", checked)}
          />
          <Switch
            label={t("nexus_appearance_show_description")}
            data-testid="nexus-show-description"
            checked={appearance.showDescription !== false}
            onCheckedChange={(checked) => update("showDescription", checked)}
          />
        </div>
      </div>

      {/* Ordem no celular: formulário, prévia, código. No computador a prévia fica na coluna da direita, parada ao rolar. */}
      <div className="min-w-0 self-start lg:sticky lg:top-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <Label>{t("nexus_appearance_preview")}</Label>
        <iframe
          sandbox=""
          title={t("nexus_appearance_preview")}
          data-testid="nexus-appearance-preview"
          srcDoc={previewDocument}
          className="border-subtle h-[28rem] w-full rounded-md border"
        />
      </div>

      <div className="border-subtle min-w-0 rounded-lg border p-6 lg:col-start-1 lg:row-start-2">
        <h3 className="text-emphasis text-base font-semibold">{t("nexus_custom_code")}</h3>
        <p className="text-subtle mb-3 text-sm">{t("nexus_custom_code_description")}</p>
        <TextAreaField
          name="nexusCustomCode"
          label=""
          spellCheck={false}
          rows={10}
          maxLength={20000}
          className="font-mono text-sm"
          data-testid="nexus-custom-code"
          value={customCode}
          onChange={(event) => update("customCode", event.target.value || null)}
        />
        {errorText("customCode") && (
          <div data-testid="nexus-custom-code-error">
            <Alert className="mt-2" severity="error" message={errorText("customCode")} />
          </div>
        )}
        <p className="text-subtle mt-3 flex items-start gap-2 text-sm" data-testid="nexus-custom-code-warning">
          <TriangleAlertIcon className="text-semantic-attention mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t("nexus_custom_code_warning")}</span>
        </p>
      </div>
    </div>
  );
};
