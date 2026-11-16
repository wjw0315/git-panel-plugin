import type { PluginClientContext } from "@getpaseo/plugin/client";
import { GitAgentPanel, GitPanel } from "./client/panel";
import { contributePills } from "./client/pill";
import { GitPanelSettings } from "./client/settings";

export default function contribute(client: PluginClientContext) {
  client.addWorkspacePanel({
    id: "git-panel",
    title: "Git",
    icon: "GitBranch",
    context: "workspace",
    locations: ["workspace", "explorer"],
    Component: GitPanel,
  });

  client.addAgentPanel({
    id: "git-panel-agent",
    title: "Git",
    icon: "GitBranch",
    locations: ["workspace", "explorer"],
    Component: GitAgentPanel,
  });

  client.addSettingsScreen({
    id: "git-panel-settings",
    title: "Git panel",
    icon: "GitBranch",
    Component: GitPanelSettings,
  });

  client.addCommandCenterItem({
    id: "git-panel-settings",
    title: "Configure Git panel",
    icon: "Settings",
    context: "global",
    onSelect({ openSettings }) {
      openSettings("git-panel-settings");
    },
  });

  client.addCommandCenterItem({
    id: "open-git-panel-agent",
    title: "Open Git panel for this agent",
    icon: "GitBranch",
    context: "agent",
    onSelect({ openPanel }) {
      openPanel("git-panel-agent");
    },
  });

  client.addCommandCenterItem({
    id: "open-git-panel",
    title: "Open Git panel",
    icon: "GitBranch",
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("git-panel");
    },
  });

  return contributePills(client);
}
