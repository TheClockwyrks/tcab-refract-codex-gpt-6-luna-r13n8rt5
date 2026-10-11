import { describe, expect, it } from "vitest";
import type { InitApi } from "@clockwyrks/simple-2d";
import { game, type RefractState } from "./game";

async function setup() {
  const actions: string[] = [];
  const sources: string[] = [];
  const api = {
    input: { register: (name: string) => actions.push(name) },
    audio: { define: () => undefined },
    diagnostics: { register: (name: string) => sources.push(name) },
  } as unknown as InitApi<RefractState>;
  const [state, debug] = await game.initialize(api);
  return { state, debug, actions, sources };
}

describe("Refract state and debug surface", () => {
  it("initializes every action and diagnostic with a complete title state", async () => {
    const { state, debug, actions, sources } = await setup();
    expect(state).toMatchObject({
      screen: "title",
      mode: "campaign",
      menuIndex: 0,
      unlockedCount: 1,
      tier: 1,
    });
    expect(actions).toHaveLength(8);
    expect(sources).toContain("screen");
    expect(sources).toContain("solved");
    expect(debug.snapshot(state).targets.map((target) => target.id)).toEqual([
      "menu-0",
      "menu-1",
      "menu-2",
    ]);
  });

  it("loads canonical campaign notation and reports geometry and empty beams", async () => {
    const { state, debug } = await setup();
    const board = debug.loadBoard(state, [".Tt", "ttT", ".tt"]);
    const snapshot = debug.snapshot(board);
    expect(snapshot.board).toMatchObject({ cols: 3, rows: 3 });
    expect(snapshot.board.nodes[0]).toMatchObject({
      col: 1,
      row: 0,
      x: 640,
      y: 296,
      kind: "emitter",
    });
    expect(snapshot.beams.triangle.cells).toEqual([]);
    expect(snapshot.targets.map((target) => target.id)).toEqual([
      "clear",
      "back",
    ]);
  });

  it("traces a legal segment and keeps it when released", async () => {
    const { state, debug } = await setup();
    const board = debug.loadBoard(state, ["TtT"]);
    const started = debug.pointerDown(board, 544, 392, "touch");
    expect(debug.snapshot(started).tracing).toEqual({
      channel: "triangle",
      live: { col: 0, row: 0 },
    });
    expect(debug.snapshot(started).pointer.device).toBe("touch");
    const extended = debug.pointerMove(started, 640, 392, "touch");
    expect(debug.snapshot(extended).beams.triangle.cells).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
    const released = debug.pointerUp(extended, "touch");
    expect(debug.snapshot(released).beams.triangle.cells).toHaveLength(2);
  });

  it("rejects invalid board notation and resets all declared progression", async () => {
    const { state, debug } = await setup();
    expect(() => debug.loadBoard(state, ["T.", "..."])).toThrow(
      "Invalid board dimensions",
    );
    const posed = debug.setSolvedCount(
      debug.setTier(debug.setMode(state, "cascade"), 4),
      12,
    );
    const reset = debug.reset(posed);
    expect(debug.snapshot(reset)).toMatchObject({
      screen: "title",
      mode: "campaign",
      solvedCount: 0,
      tier: 1,
      unlockedCount: 1,
    });
  });

  it("generates a board inside every cascade tier's published shape bounds", async () => {
    const { state, debug } = await setup();
    for (let tier = 1; tier <= 5; tier++) {
      const generated = debug.generateBoard(state, tier);
      const snapshot = debug.snapshot(generated);
      expect(snapshot.screen).toBe("playing");
      expect(snapshot.board.cols).toBeGreaterThanOrEqual(
        [3, 4, 4, 5, 6][tier - 1],
      );
      expect(
        snapshot.board.nodes.filter((node) => node.kind === "crystal").length,
      ).toBeGreaterThanOrEqual([0, 0, 2, 3, 4][tier - 1]);
      expect(snapshot.solved).toBe(false);
    }
  });
});
