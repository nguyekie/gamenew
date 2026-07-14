export type TutorialEvent =
  | { type: "move-hero" }
  | { type: "enter-zone"; zoneId: string }
  | { type: "select-units"; count: number }
  | { type: "move-units" }
  | { type: "build"; building: string }
  | { type: "train-unit" }
  | { type: "finish-battle" };

export interface StoryState {
  completedMissionIds: string[];
  choices: Record<string, string>;
  currentMissionId: string;
}

export interface MissionObjective {
  id: string;
  text: string;
  hint: string;
  event: TutorialEvent["type"];
  minimum?: number;
  target?: string;
}

export interface Mission {
  id: string;
  title: string;
  briefing: string;
  dialogue: string[];
  objectives: MissionObjective[];
  triggerZones: { id: string; label: string; x: number; y: number; radius: number }[];
  spawnWaves: { triggerObjectiveId: string; unit: string; count: number }[];
  choice?: { id: string; prompt: string; options: { id: string; label: string }[] };
}

export interface MissionRuntime {
  missionId: string;
  completedObjectiveIds: string[];
  dialogueIndex: number;
  finished: boolean;
}

export const CHAPTER_ONE: readonly Mission[] = [
  {
    id: "thuc-tinh",
    title: "1. Thức tỉnh tại Tiền đồn",
    briefing: "Làm quen với Lyra và tiến đến đài quan sát.",
    dialogue: [
      "Lyra: Mạch Aether đang dao động. Ta cần nhìn rõ chiến trường trước khi hành động.",
      "Kael: Hãy di chuyển đến vòng sáng phía đông. Tôi sẽ giữ liên lạc."
    ],
    objectives: [
      {
        id: "move",
        text: "Di chuyển Lyra bằng WASD",
        hint: "Giữ một phím WASD để di chuyển.",
        event: "move-hero"
      },
      {
        id: "zone",
        text: "Tiến vào đài quan sát",
        hint: "Đi tới vùng được đánh dấu trên chiến trường.",
        event: "enter-zone",
        target: "watch"
      }
    ],
    triggerZones: [{ id: "watch", label: "Đài quan sát", x: 640, y: 420, radius: 90 }],
    spawnWaves: []
  },
  {
    id: "tap-hop",
    title: "2. Tập hợp đội quân",
    briefing: "Chọn binh sĩ và đưa họ qua cầu đá.",
    dialogue: ["Kael: Một chỉ huy không chiến đấu một mình. Hãy tập hợp đội hình."],
    objectives: [
      {
        id: "select",
        text: "Chọn ít nhất 4 đơn vị",
        hint: "Kéo chuột trái quanh các đơn vị.",
        event: "select-units",
        minimum: 4
      },
      {
        id: "formation",
        text: "Ra lệnh di chuyển đội hình",
        hint: "Nhấp chuột phải tới điểm đến.",
        event: "move-units"
      }
    ],
    triggerZones: [{ id: "bridge", label: "Cầu trung tâm", x: 1200, y: 780, radius: 150 }],
    spawnWaves: [{ triggerObjectiveId: "formation", unit: "kiếm sĩ đồng minh", count: 4 }]
  },
  {
    id: "nen-mong",
    title: "3. Nền móng kháng chiến",
    briefing: "Xây doanh trại và huấn luyện quân tiếp viện.",
    dialogue: ["Lyra: Chúng ta cần một cứ điểm có thể trụ vững sau đêm nay."],
    objectives: [
      {
        id: "build",
        text: "Xây một doanh trại",
        hint: "Nhấn F2, chọn vị trí hợp lệ rồi nhấp chuột trái.",
        event: "build",
        target: "barracks"
      },
      {
        id: "train",
        text: "Huấn luyện một đơn vị",
        hint: "Chọn doanh trại và nhấn J.",
        event: "train-unit"
      }
    ],
    triggerZones: [],
    spawnWaves: [{ triggerObjectiveId: "train", unit: "trinh sát địch", count: 3 }]
  },
  {
    id: "nga-re",
    title: "4. Ngã rẽ ở Rừng Sương",
    briefing: "Chọn cách xử lý toán quân lạc trong rừng.",
    dialogue: [
      "Kael: Có tín hiệu từ khu rừng. Họ có thể là đồng minh, cũng có thể là một cái bẫy."
    ],
    objectives: [
      {
        id: "forest",
        text: "Trinh sát Rừng Sương",
        hint: "Nhấn C để bắn pháo sáng trinh sát.",
        event: "enter-zone",
        target: "mist-forest"
      }
    ],
    triggerZones: [{ id: "mist-forest", label: "Rừng Sương", x: 1910, y: 700, radius: 180 }],
    spawnWaves: [],
    choice: {
      id: "forest-fate",
      prompt: "Bạn sẽ làm gì với toán quân lạc?",
      options: [
        { id: "rescue", label: "Giải cứu và kết nạp" },
        { id: "observe", label: "Ẩn mình quan sát" }
      ]
    }
  },
  {
    id: "giu-cau",
    title: "5. Giữ cầu Bình Minh",
    briefing: "Vận dụng mọi kỹ năng để bảo vệ đầu cầu.",
    dialogue: ["Lyra: Bình minh đang tới. Trụ vững tại cây cầu, và Aetherion sẽ còn hy vọng."],
    objectives: [
      {
        id: "battle",
        text: "Đánh bại đợt tấn công",
        hint: "Dùng đội hình, kỹ năng Q/E và lợi thế địa hình.",
        event: "finish-battle"
      }
    ],
    triggerZones: [{ id: "last-stand", label: "Đầu cầu", x: 1200, y: 800, radius: 240 }],
    spawnWaves: [
      { triggerObjectiveId: "battle", unit: "kỵ binh địch", count: 4 },
      { triggerObjectiveId: "battle", unit: "cung thủ địch", count: 6 }
    ]
  }
] as const;

export const createStoryState = (): StoryState => ({
  completedMissionIds: [],
  choices: {},
  currentMissionId: CHAPTER_ONE[0]?.id ?? ""
});

export const createMissionRuntime = (missionId: string): MissionRuntime => ({
  missionId,
  completedObjectiveIds: [],
  dialogueIndex: 0,
  finished: false
});

export const applyTutorialEvent = (
  mission: Mission,
  runtime: MissionRuntime,
  event: TutorialEvent
): MissionRuntime => {
  if (runtime.finished) return runtime;
  const objective = mission.objectives.find(
    (candidate) =>
      !runtime.completedObjectiveIds.includes(candidate.id) &&
      candidate.event === event.type &&
      (event.type !== "select-units" || event.count >= (candidate.minimum ?? 1)) &&
      (event.type !== "enter-zone" || event.zoneId === candidate.target) &&
      (event.type !== "build" || event.building === candidate.target)
  );
  if (!objective) return runtime;
  const completedObjectiveIds = [...runtime.completedObjectiveIds, objective.id];
  return {
    ...runtime,
    completedObjectiveIds,
    finished: completedObjectiveIds.length === mission.objectives.length
  };
};

export const completeMission = (
  story: StoryState,
  missionId: string,
  choice?: { id: string; value: string }
): StoryState => {
  const completedMissionIds = story.completedMissionIds.includes(missionId)
    ? story.completedMissionIds
    : [...story.completedMissionIds, missionId];
  const currentIndex = CHAPTER_ONE.findIndex((mission) => mission.id === missionId);
  return {
    completedMissionIds,
    choices: choice ? { ...story.choices, [choice.id]: choice.value } : story.choices,
    currentMissionId: CHAPTER_ONE[currentIndex + 1]?.id ?? missionId
  };
};

export const contextualDialogue = (mission: Mission, story: StoryState) => {
  if (mission.id === "giu-cau" && story.choices["forest-fate"] === "rescue")
    return [...mission.dialogue, "Kael: Những người bạn cứu trong rừng đã tới giữ cánh trái."];
  if (mission.id === "giu-cau" && story.choices["forest-fate"] === "observe")
    return [
      ...mission.dialogue,
      "Kael: Nhờ quan sát kiên nhẫn, ta đã biết hướng tiến quân của địch."
    ];
  return mission.dialogue;
};

const STORAGE_KEY = "aetherion-story-v1";

export const loadStory = (): StoryState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as StoryState) : createStoryState();
  } catch {
    return createStoryState();
  }
};

export const saveStory = (story: StoryState) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(story));
