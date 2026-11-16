export interface GraphCommitInput {
  hash: string;
  parents: readonly string[];
}

export interface GraphRow {
  lane: number;
  color: number;
  /** Lane occupancy above this row (hash per lane, null = empty). */
  before: Array<string | null>;
  /** Lane occupancy below this row. */
  after: Array<string | null>;
  /** Parent lanes that continue from this commit. */
  parentLanes: number[];
}

const MAX_LANES = 16;

/**
 * Assign each commit a lane and the lane occupancy above/below it. This is a
 * compact single-pass layout: the checked-out line stays in lane 0, feature
 * lines fill the first free lane, and merges keep their first parent in place.
 */
export function layoutGraph(commits: readonly GraphCommitInput[]): GraphRow[] {
  const rows: GraphRow[] = [];
  let lanes: Array<string | null> = [];

  for (const commit of commits) {
    let lane = lanes.indexOf(commit.hash);
    if (lane === -1) {
      lane = lanes.indexOf(null);
      if (lane === -1) {
        lane = lanes.length;
        lanes.push(commit.hash);
      } else {
        lanes[lane] = commit.hash;
      }
    }
    const before = [...lanes];

    lanes[lane] = null;
    const parents = commit.parents.slice(0, 4);
    if (parents.length > 0) {
      const first = parents[0];
      if (first && !lanes.includes(first)) {
        lanes[lane] = first;
      }
      for (const parent of parents.slice(1)) {
        if (!parent || lanes.includes(parent)) continue;
        const empty = lanes.indexOf(null);
        if (empty === -1) {
          if (lanes.length < MAX_LANES) lanes.push(parent);
        } else {
          lanes[empty] = parent;
        }
      }
    }

    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
    const after = [...lanes];
    const parentLanes = parents
      .map((parent) => after.indexOf(parent))
      .filter((index) => index >= 0);

    rows.push({
      lane: Math.min(lane, MAX_LANES - 1),
      color: lane % 8,
      before: before.slice(0, MAX_LANES),
      after: after.slice(0, MAX_LANES),
      parentLanes: [...new Set(parentLanes)],
    });
  }

  return rows;
}

export function laneCount(rows: readonly GraphRow[]): number {
  let max = 1;
  for (const row of rows) {
    max = Math.max(max, row.before.length, row.after.length, row.lane + 1);
  }
  return Math.min(max, MAX_LANES);
}

export const GRAPH_COLORS = [
  "#4C9AFF",
  "#2EA043",
  "#D29922",
  "#DB6D28",
  "#A371F7",
  "#39C5CF",
  "#F778BA",
  "#8B949E",
];
