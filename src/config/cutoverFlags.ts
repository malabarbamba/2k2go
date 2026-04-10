import type { DataMode } from "@/hooks/usePreviewMode";

type RuntimeCutoverConfig = {
  DECK_PERSO_REAL_MODE_ENABLED?: boolean;
  PROGRESSION_REAL_MODE_ENABLED?: boolean;
  DECK_PERSO_FORCE_MODE?: DataMode | null;
  PROGRESSION_FORCE_MODE?: DataMode | null;
  DECK_PERSO_ROLLBACK_TO_PREVIEW?: boolean;
  PROGRESSION_ROLLBACK_TO_PREVIEW?: boolean;
};

type RuntimeConfigWindow = Window & {
  __SUPABASE_CONFIG__?: RuntimeCutoverConfig;
};

export type CutoverScope = "deck" | "progression";

export interface CutoverPolicy {
  scope: CutoverScope;
  realModeAllowed: boolean;
  forcedMode: DataMode | null;
  rollbackToPreview: boolean;
  previewForced: boolean;
  realForced: boolean;
  reason: string | null;
  rollbackHook: string | null;
}

const booleanEnv = (value: string | undefined): boolean | undefined => {
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return undefined;
};

const getRuntimeConfig = (): RuntimeCutoverConfig | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }
  return (window as RuntimeConfigWindow).__SUPABASE_CONFIG__;
};

const resolveBooleanFlag = (
  runtimeKey: keyof RuntimeCutoverConfig,
  envValue: string | undefined,
): boolean | undefined => {
  const envOverride = booleanEnv(envValue);
  if (typeof envOverride !== "undefined") {
    return envOverride;
  }

  const runtimeConfig = getRuntimeConfig();
  const runtimeOverride = runtimeConfig?.[runtimeKey];
  if (typeof runtimeOverride === "boolean") {
    return runtimeOverride;
  }

  return undefined;
};

const resolveForcedMode = (
  runtimeValue: DataMode | null | undefined,
  envValue: string | undefined,
): DataMode | null => {
  const normalizedEnv = envValue?.toLowerCase();
  if (normalizedEnv === "preview" || normalizedEnv === "real") {
    return normalizedEnv;
  }

  if (runtimeValue === "preview" || runtimeValue === "real") {
    return runtimeValue;
  }

  return null;
};

export function isRealModeAllowed(scope: CutoverScope): boolean {
  return getCutoverPolicy(scope).realModeAllowed;
}

export function getForcedMode(scope: CutoverScope): DataMode | null {
  return getCutoverPolicy(scope).forcedMode;
}

export function getRollbackToPreview(scope: CutoverScope): boolean {
  return getCutoverPolicy(scope).rollbackToPreview;
}

export function getCutoverPolicy(scope: CutoverScope): CutoverPolicy {
  const realEnabledEnv = scope === "deck"
    ? import.meta.env.VITE_DECK_PERSO_REAL_MODE_ENABLED
    : import.meta.env.VITE_PROGRESSION_REAL_MODE_ENABLED;

  const runtimeKey = scope === "deck"
    ? "DECK_PERSO_REAL_MODE_ENABLED"
    : "PROGRESSION_REAL_MODE_ENABLED";

  const resolvedRealMode = resolveBooleanFlag(runtimeKey, realEnabledEnv);
  const realModeAllowed = typeof resolvedRealMode !== "undefined" ? resolvedRealMode : true;

  const forcedModeEnv = scope === "deck"
    ? import.meta.env.VITE_DECK_PERSO_FORCE_MODE
    : import.meta.env.VITE_PROGRESSION_FORCE_MODE;

  const runtimeConfig = getRuntimeConfig();
  const runtimeValue = scope === "deck"
    ? runtimeConfig?.DECK_PERSO_FORCE_MODE
    : runtimeConfig?.PROGRESSION_FORCE_MODE;

  const forcedMode = resolveForcedMode(runtimeValue ?? null, forcedModeEnv);

  const rollbackEnvKey = scope === "deck"
    ? import.meta.env.VITE_DECK_PERSO_ROLLBACK_TO_PREVIEW
    : import.meta.env.VITE_PROGRESSION_ROLLBACK_TO_PREVIEW;
  const rollbackRuntimeKey = scope === "deck"
    ? "DECK_PERSO_ROLLBACK_TO_PREVIEW"
    : "PROGRESSION_ROLLBACK_TO_PREVIEW";
  const rollbackToPreview = resolveBooleanFlag(rollbackRuntimeKey, rollbackEnvKey) === true;

  const previewForced = rollbackToPreview || !realModeAllowed || forcedMode === "preview";
  const realForced = !previewForced && forcedMode === "real";
  const rollbackHook = rollbackToPreview
    ? `Set ${scope === "deck" ? "VITE_DECK_PERSO_ROLLBACK_TO_PREVIEW" : "VITE_PROGRESSION_ROLLBACK_TO_PREVIEW"}=false once cutover stabilizes.`
    : null;
  const reason = rollbackToPreview
    ? "Rollback actif: mode preview forcé pour sécuriser la migration."
    : !realModeAllowed
      ? "Mode réel temporairement désactivé (cutover)."
      : forcedMode === "preview"
        ? "Mode preview forcé par configuration."
        : forcedMode === "real"
          ? "Mode preview désactivé par configuration."
          : null;

  return {
    scope,
    realModeAllowed,
    forcedMode,
    rollbackToPreview,
    previewForced,
    realForced,
    reason,
    rollbackHook,
  };
}
