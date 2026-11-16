import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import {
  SettingsCard,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { DEFAULT_SETTINGS, gitPanelSettings } from "../shared/git";
import { Text, View } from "react-native";
import { useStrings } from "./strings";

export function GitPanelSettings({ theme }: PluginSurfaceProps) {
  const strings = useStrings();
  const settings = useSettings(gitPanelSettings);
  const values = settings.status === "ready" ? settings.values : DEFAULT_SETTINGS;
  const revision = settings.status === "ready" ? settings.revision : "";

  const save = (patch: Partial<typeof values>) => {
    if (settings.status !== "ready") return;
    void settings.save({ ...values, ...patch }, revision);
  };

  return (
    <View style={{ gap: 18 }}>
      <Status theme={theme} settings={settings} />
      <SettingsSection title={strings.settings}>
        <SettingsCard>
          <SettingsSwitch
            label={strings.showPill}
            hint={strings.showPillHint}
            value={values.showComposerPill}
            onValueChange={(value) => save({ showComposerPill: value })}
            disabled={settings.status !== "ready"}
          />
          <SettingsSwitch
            label={strings.allowEdit}
            hint={strings.allowEditHint}
            value={values.allowFileEdit}
            onValueChange={(value) => save({ allowFileEdit: value })}
            disabled={settings.status !== "ready"}
          />
          <SettingsSwitch
            label={strings.autoSave}
            hint={strings.autoSaveHint}
            value={values.autoSaveFile}
            onValueChange={(value) => save({ autoSaveFile: value })}
            disabled={settings.status !== "ready"}
          />
          <SettingsSwitch
            label={strings.syntaxHighlight}
            hint={strings.syntaxHighlightHint}
            value={values.editorSyntaxHighlight}
            onValueChange={(value) => save({ editorSyntaxHighlight: value })}
            disabled={settings.status !== "ready"}
          />
          <SettingsSwitch
            label={strings.filesFollowRepo}
            hint={strings.filesFollowRepoHint}
            value={values.filesFollowRepo}
            onValueChange={(value) => save({ filesFollowRepo: value })}
            disabled={settings.status !== "ready"}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={strings.defaultDiff}>
        <SettingsCard>
          <SettingsSelect
            label={strings.defaultDiff}
            hint={strings.defaultDiffHint}
            value={values.defaultDiffView}
            options={[
              { label: strings.unified, value: "unified" },
              { label: strings.split, value: "split" },
            ]}
            onValueChange={(value) => save({ defaultDiffView: value })}
            disabled={settings.status !== "ready"}
          />
          <SettingsSelect
            label={strings.changesView}
            hint={strings.changesViewHint}
            value={values.changesView}
            options={[
              { label: strings.flat, value: "flat" },
              { label: strings.tree, value: "tree" },
            ]}
            onValueChange={(value) => save({ changesView: value })}
            disabled={settings.status !== "ready"}
          />
          <SettingsSelect
            label={strings.refreshInterval}
            hint={strings.refreshIntervalHint}
            value={String(values.refreshIntervalMs)}
            options={[
              { label: strings.off, value: "0" },
              { label: `2 ${strings.seconds}`, value: "2000" },
              { label: `5 ${strings.seconds}`, value: "5000" },
              { label: `10 ${strings.seconds}`, value: "10000" },
            ]}
            onValueChange={(value) => save({ refreshIntervalMs: Number(value) })}
            disabled={settings.status !== "ready"}
          />
        </SettingsCard>
      </SettingsSection>
    </View>
  );
}

function Status({
  theme,
  settings,
}: {
  theme: PluginTheme;
  settings: ReturnType<typeof useSettings>;
}) {
  if (settings.status === "ready") {
    if (!settings.saveError) return null;
    return (
      <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>
        {settings.saveError}
      </Text>
    );
  }
  if (settings.status === "loading") {
    return <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>…</Text>;
  }
  return (
    <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>
      {settings.status === "invalid" ? settings.error : settings.status === "error" ? settings.error : ""}
    </Text>
  );
}
