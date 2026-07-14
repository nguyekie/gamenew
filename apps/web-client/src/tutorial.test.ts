import { describe, expect, it } from "vitest";

import {
  CHAPTER_ONE,
  applyTutorialEvent,
  completeMission,
  contextualDialogue,
  createMissionRuntime,
  createStoryState
} from "./tutorial";

describe("engine nhiệm vụ Chương 1", () => {
  it("chỉ hoàn thành đúng mục tiêu theo sự kiện", () => {
    const mission = CHAPTER_ONE[1]!;
    const runtime = createMissionRuntime(mission.id);
    expect(applyTutorialEvent(mission, runtime, { type: "select-units", count: 2 })).toEqual(
      runtime
    );
    const selected = applyTutorialEvent(mission, runtime, { type: "select-units", count: 4 });
    const finished = applyTutorialEvent(mission, selected, { type: "move-units" });
    expect(finished.finished).toBe(true);
  });

  it("khởi động lại nhiệm vụ tạo trạng thái sạch", () => {
    expect(createMissionRuntime("tap-hop")).toEqual({
      missionId: "tap-hop",
      completedObjectiveIds: [],
      dialogueIndex: 0,
      finished: false
    });
  });

  it("lưu lựa chọn và làm thay đổi hội thoại sau", () => {
    const story = completeMission(createStoryState(), "nga-re", {
      id: "forest-fate",
      value: "rescue"
    });
    expect(contextualDialogue(CHAPTER_ONE[4]!, story).at(-1)).toContain("bạn cứu");
  });
});
