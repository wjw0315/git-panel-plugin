import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { TextButton } from "./kit";
import type { Strings } from "./strings";

/**
 * 更新分支对话框（原型变体 A：操作卡片二选一 + 分支选择 + 预检块 + 重置/确认）。
 * 纯展示组件：分支数据与预检数据由 OverviewTab 查询后传入，
 * 本组件只回调 onSelectOperation / onSelect / onRun / onOpenChange。
 */
export function UpdateBranchDialog({
  theme,
  strings,
  open,
  current,
  operation,
  data,
  selected,
  preview,
  workspaceClean,
  branchState,
  conflictedFiles,
  pending,
  onSelectOperation,
  onSelect,
  onRun,
  onAbort,
  onOpenChange,
}: {
  theme: PluginTheme;
  strings: Strings;
  open: boolean;
  /** 当前分支名（副标题与方向文案用）。 */
  current: string;
  operation: "merge" | "rebase";
  data:
    | {
        local: Array<{ name: string }>;
        remote: Array<{ name: string }>;
      }
    | undefined;
  selected: string | null;
  /** 预检数据；null 表示暂无数据（未选分支或查询失败）。 */
  preview: {
    commitCount: number;
    conflicts: string[] | null;
    previewSupported: boolean;
  } | null;
  /** 工作区是否干净；null 表示未知（预检查询失败）。false 时禁用确认。 */
  workspaceClean: boolean | null;
  /** 合并/变基进行中状态；非 null 时对话框整体切换为进行中态。 */
  branchState: "merging" | "rebasing" | null;
  /** 当前 conflicted 文件路径（来自快照 changes）。 */
  conflictedFiles: string[];
  pending: boolean;
  onSelectOperation: (op: "merge" | "rebase") => void;
  onSelect: (branch: string | null) => void;
  onRun: () => void;
  onAbort: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const sameBranch = selected !== null && selected === current;
  const canRun =
    selected !== null && !sameBranch && !pending && workspaceClean !== false;
  const [pickerOpen, setPickerOpen] = useState(false);

  if (branchState !== null) {
    const merging = branchState === "merging";
    return (
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title={strings.updateBranch}
        icon={<Icon name="GitMerge" size={18} color={theme.colors.statusWarning} />}
      >
        <Modal.Content>
          <View style={{ gap: 12 }}>
            <Text style={{ color: theme.colors.statusWarning, fontSize: 14, fontWeight: "600" }}>
              {merging ? strings.updateInProgressMerging : strings.updateInProgressRebasing}
            </Text>
            {conflictedFiles.length > 0 ? (
              <View>
                <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>
                  ⚠ {conflictedFiles.length} {strings.conflicted}
                </Text>
                {conflictedFiles.slice(0, 8).map((file) => (
                  <Text
                    key={file}
                    style={{ color: theme.colors.statusDanger, fontSize: 11, fontFamily: "monospace" }}
                    numberOfLines={1}
                  >
                    {file}
                  </Text>
                ))}
              </View>
            ) : null}
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
              {strings.updateConflictHint}
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <TextButton
                theme={theme}
                label={strings.cancel}
                hint={strings.hintCancel}
                onPress={() => onOpenChange(false)}
              />
              <TextButton
                theme={theme}
                label={merging ? strings.updateAbortMerge : strings.updateAbortRebase}
                hint={strings.updateConflictHint}
                onPress={onAbort}
              />
            </View>
          </View>
        </Modal.Content>
      </Modal>
    );
  }

  return (
    <>
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title={strings.updateBranch}
        icon={<Icon name="GitMerge" size={18} color={theme.colors.foreground} />}
      >
        <Modal.Content>
          <View style={{ gap: 12 }}>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
              {strings.updateBringInto}{" "}
              <Text style={{ color: theme.colors.foreground, fontFamily: "monospace" }}>
                {current}
              </Text>
            </Text>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <OperationCard
                theme={theme}
                selected={operation === "merge"}
                title={strings.updateMergeCard}
                desc={strings.updateMergeCardDesc}
                icon="GitMerge"
                onPress={() => onSelectOperation("merge")}
              />
              <OperationCard
                theme={theme}
                selected={operation === "rebase"}
                title={strings.updateRebaseCard}
                desc={strings.updateRebaseCardDesc}
                icon="GitBranch"
                onPress={() => onSelectOperation("rebase")}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={strings.updatePickBranch}
              onPress={() => setPickerOpen(true)}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: 8,
                backgroundColor: theme.colors.surface1,
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}
            >
              <Text
                style={{
                  color: selected ? theme.colors.foreground : theme.colors.foregroundMuted,
                  fontSize: 12.5,
                  fontFamily: selected ? "monospace" : undefined,
                }}
                numberOfLines={1}
              >
                {selected ?? strings.updatePickBranch}
              </Text>
            </Pressable>

            {sameBranch ? (
              <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>
                {strings.updateSameBranch}
              </Text>
            ) : null}

            {selected !== null && preview !== null ? (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: 9,
                  backgroundColor: theme.colors.surface1,
                  padding: 11,
                }}
              >
                {operation === "merge" ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ color: theme.colors.foreground, fontSize: 12.5, fontFamily: "monospace" }}>
                      {selected}
                    </Text>
                    <Text style={{ color: theme.colors.accent, fontSize: 12.5 }}>→</Text>
                    <Text style={{ color: theme.colors.foreground, fontSize: 12.5, fontFamily: "monospace" }}>
                      {current}
                    </Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ color: theme.colors.foreground, fontSize: 12.5, fontFamily: "monospace" }}>
                      {current}
                    </Text>
                    <Text style={{ color: theme.colors.accent, fontSize: 12.5 }}>
                      → {strings.updateOntoArrow} →
                    </Text>
                    <Text style={{ color: theme.colors.foreground, fontSize: 12.5, fontFamily: "monospace" }}>
                      {selected}
                    </Text>
                  </View>
                )}
                <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, marginTop: 4 }}>
                  {operation === "merge" ? strings.updateBrings : strings.updateMoves}: {preview.commitCount}
                </Text>
                {operation === "merge" && !preview.previewSupported ? (
                  <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, marginTop: 2, fontStyle: "italic" }}>
                    {strings.updatePreviewUnavailable}
                  </Text>
                ) : null}
                {operation === "merge" && preview.previewSupported && preview.conflicts && preview.conflicts.length > 0 ? (
                  <View style={{ marginTop: 2 }}>
                    <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>
                      ⚠ {preview.conflicts.length} {strings.updateConflicts}
                    </Text>
                    {preview.conflicts.map((file) => (
                      <Text
                        key={file}
                        style={{ color: theme.colors.statusDanger, fontSize: 11, fontFamily: "monospace" }}
                        numberOfLines={1}
                      >
                        {file}
                      </Text>
                    ))}
                  </View>
                ) : null}
                {operation === "merge" && preview.previewSupported && preview.conflicts?.length === 0 ? (
                  <Text style={{ color: theme.colors.statusSuccess, fontSize: 12, marginTop: 2 }}>
                    ✓ {strings.updateNoConflicts}
                  </Text>
                ) : null}
                <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, marginTop: 2 }}>
                  {operation === "merge" ? strings.updateMergeNote : strings.updateRebaseNote}
                </Text>
              </View>
            ) : null}

            {workspaceClean === false ? (
              <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>
                {strings.updateDirtyWarning}
              </Text>
            ) : null}

            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
              <TextButton
                theme={theme}
                label={strings.updateReset}
                hint={strings.hintCancel}
                onPress={() => onSelect(null)}
                disabled={pending}
              />
              <TextButton
                theme={theme}
                label={operation === "merge" ? strings.updateMergeCard : strings.updateRebaseCard}
                hint={strings.hintUpdateBranch}
                primary
                disabled={!canRun}
                onPress={onRun}
              />
            </View>
          </View>
        </Modal.Content>
      </Modal>

      <Modal
        open={open && pickerOpen}
        onOpenChange={(next) => {
          if (!next) setPickerOpen(false);
        }}
        title={strings.updatePickBranch}
        icon={<Icon name="GitBranch" size={18} color={theme.colors.foreground} />}
      >
        <Modal.Content scrollable={false} style={{ maxHeight: 380 }}>
          <ScrollView style={{ maxHeight: 340 }}>
            <GroupLabel theme={theme} label={strings.local} />
            {(data?.local ?? []).map((branch) => (
              <BranchRow
                key={branch.name}
                theme={theme}
                name={branch.name}
                current={branch.name === current}
                onPress={() => {
                  onSelect(branch.name);
                  setPickerOpen(false);
                }}
              />
            ))}
            <GroupLabel theme={theme} label={strings.remote} />
            {(data?.remote ?? []).map((branch) => (
              <BranchRow
                key={branch.name}
                theme={theme}
                name={branch.name}
                current={false}
                onPress={() => {
                  onSelect(branch.name);
                  setPickerOpen(false);
                }}
              />
            ))}
          </ScrollView>
        </Modal.Content>
      </Modal>
    </>
  );
}

function OperationCard({
  theme,
  selected,
  title,
  desc,
  icon,
  onPress,
}: {
  theme: PluginTheme;
  selected: boolean;
  title: string;
  desc: string;
  icon: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        borderWidth: 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
        borderRadius: 10,
        backgroundColor: selected
          ? theme.colors.surface2
          : pressed
            ? theme.colors.surface2
            : theme.colors.surface1,
        paddingVertical: 10,
        paddingHorizontal: 12,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon
          name={icon}
          size={13}
          color={selected ? theme.colors.accent : theme.colors.foregroundMuted}
        />
        <Text style={{ color: theme.colors.foreground, fontSize: 12.5, fontWeight: "600" }}>
          {title}
        </Text>
      </View>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, marginTop: 4 }}>
        {desc}
      </Text>
    </Pressable>
  );
}

function GroupLabel({ theme, label }: { theme: PluginTheme; label: string }) {
  return (
    <Text
      style={{
        color: theme.colors.foregroundMuted,
        fontSize: 10.5,
        paddingHorizontal: 8,
        paddingTop: 6,
        paddingBottom: 2,
      }}
    >
      {label}
    </Text>
  );
}

function BranchRow({
  theme,
  name,
  current,
  onPress,
}: {
  theme: PluginTheme;
  name: string;
  current: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 8,
        paddingVertical: 6,
        backgroundColor: pressed ? theme.colors.surface1 : "transparent",
      })}
    >
      <Icon
        name={current ? "Check" : "GitBranch"}
        size={12}
        color={current ? theme.colors.statusSuccess : theme.colors.foregroundMuted}
      />
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          color: current ? theme.colors.foreground : theme.colors.foregroundMuted,
          fontSize: 12,
          fontFamily: "monospace",
        }}
      >
        {name}
      </Text>
    </Pressable>
  );
}
