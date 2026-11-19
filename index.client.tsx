import type { PluginClientContext, PluginNewWorkspaceItemProps } from "@getpaseo/plugin/client";
import { contributeHeaderButtons } from "./client/header-button";
import { GitNewWorkspaceItem } from "./client/new-workspace-item";
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

  // The item needs the client to open a panel; bind it once so the component
  // identity stays stable across renders.
  const NewWorkspaceItem = (props: PluginNewWorkspaceItemProps) => (
    <GitNewWorkspaceItem {...props} client={client} />
  );
  client.addNewWorkspaceItem({
    id: "git-panel-new-workspace",
    Component: NewWorkspaceItem,
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

  const disposePills = contributePills(client);
  // The workspace header keeps the panel reachable before an agent exists; the
  // composer pill only appears from the first session onwards.
  const disposeHeaderButtons = contributeHeaderButtons(client);
  return () => {
    disposeHeaderButtons();
    disposePills();
  };
}
