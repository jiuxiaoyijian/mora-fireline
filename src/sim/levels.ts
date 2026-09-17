import { counts, validateScenarioLayout } from "./model.ts";
import type { Layout, Scenario } from "./model.ts";

export interface Level extends Scenario { id: string; name: string; efficientBudget: number; lesson: string; hint: string }
function level(id: string, name: string, rows: string[], options: Partial<Scenario> & { efficientBudget?: number }, lesson: string, hint: string): Level {
  const houseTypes: Scenario["houseTypes"] = {};
  const kinds = { ".": "grass", "#": "stone", H: "house", B: "house", F: "source" } as const;
  const layout = rows.join("").split("").map((c, i) => {
    if (c === "H" || c === "B") houseTypes[i] = c === "H" ? "timber" : "brick";
    return kinds[c as keyof typeof kinds];
  });
  return { id, name, sprinkler: { radius: 1, cooling: 48, charges: 2, refillSeconds: 4 }, efficientBudget: (options.budget ?? 4) - 1, layout, houseTypes, budget: 4, goal: counts(layout).homes, duration: 30,
    tools: ["break", "station", "erase"], weather: [{ at: 0, direction: "east", strength: 1 }], emberInterval: 0, seed: Number(id),
    ...options, lesson, hint };
}
export const LEVELS: readonly Level[] = [
  level("1", "第一道防线", ["########", "F...HH##", "########", "########", "########", "########", "########", "########"],
    { budget: 2, tools: ["break", "erase"], duration: 20 }, "居民已撤离。你第一次独立值守：在山火和两间木屋之间，留下一道不会燃烧的空隙。", "选择防火带，点击 C2，再开始演练。绿色短线表示火被挡住；草地会传火，拆除不等于隔离。"),
  level("2", "绕过缺口", ["########", "F..HH###", "#..HH###", "########", "########", "########", "########", "########"],
    { budget: 3, tools: ["break", "erase"] }, "山火会沿六个方向绕行。守住这片四户的小聚落，试着连接一条完整防线。", "可拖动铺设防火带。B2 和 B3 是两条入口；只堵一格，火会从旁边绕过。"),
  level("3", "屋前的雨", ["########", "#..HH###", "F..HH###", "########", "########", "########", "########", "########"],
    { budget: 4, efficientBudget: 4, tools: ["station", "erase"] }, "补给车只送来一座喷淋器。让它覆盖受威胁的草地与住宅，观察热量如何消退。", "喷淋花费 4 点，只覆盖相邻一圈。试着放在 B2 冷却入口草地；每秒 48 降温量由受热地块共享，不能扑灭已燃房屋。"),
  level("4", "越过防线的火星", ["########", "##F..HH#", "###.HH##", "########", "########", "########", "########", "########"],
    { budget: 5, emberInterval: 6 }, "强风带来飞火：它会越过防火带，在落点预警后点燃远处木屋。喷淋每座只有 2 次拦截储备，每 4 秒补回 1 次。", "橙圈预警 1.5 秒后的飞火。E2 能覆盖附近三户；远处房屋要靠防线阻止草地成为新的飞火跳板。青色表示当前有水压，不是永久免疫。"),
  level("5", "先守木屋", ["########", "##F..HH#", "###.HH##", "########", "#...BBB#", "F...BBB#", "#..#####", "########"],
    { budget: 8, goal: 8, emberInterval: 4, duration: 40 }, "北侧木屋怕火星，南侧砖屋更耐热，却也经不起持续燃烧。把有限补给分给两片街区。", "木屋受热 40 起火，砖屋为 90；砖屋不是防火墙。北侧近火木屋需要局部喷淋；南侧房屋离初始火源较远，优先切断草地跳板，比铺满喷淋更省预算。"),
  level("6", "风向变了", ["########", "##FH.H##", "###.HH##", "########", "##H.H..F", "##HH...#", "#####..#", "########"],
    { budget: 10, efficientBudget: 10, goal: 6, emberInterval: 4, duration: 40, weather: [{ at: 0, direction: "east", strength: 1 }, { at: 12, direction: "west", strength: 1.2 }], sourceStarts: { 39: 12 } },
    "预报说 12 秒后风将转向，东侧也会出现火头。开局就要为第二轮威胁预留防线。", "北侧房屋紧邻火源，既要冷却又要切断侧面绕行。南侧 D5 是屋群中心；还要防止东侧草地把热量带到屋前。"),
  level("7", "紧缺的补给", ["########", "##F..HH#", "###.HH##", "########", "########", "##F..HH#", "###.HH##", "########"],
    { budget: 10, efficientBudget: 9, goal: 6, emberInterval: 4, emberVolley: 2, duration: 40 }, "阵风每 4 秒最多卷起 2 枚飞火。每个燃烧地块都可能成为发射源，任由草地烧起来会让局部水压耗尽。", "先用两座喷淋守住两片木屋，再用剩余预算切断草地跳板。观察哪座喷淋先耗尽水压；同样两座喷淋，加一段隔离可能改变结果。"),
  level("8", "山海守夜", ["########", "##F..HB#", "###.BH##", "########", "##B.H..F", "##HB...#", "########", "########"],
    { budget: 12, efficientBudget: 8, emberInterval: 4, emberVolley: 3, duration: 45, weather: [{ at: 0, direction: "east", strength: 1.3 }, { at: 12, direction: "west", strength: 1.3 }, { at: 28, direction: "east", strength: 1.5 }], sourceStarts: { 39: 12 } },
    "最后一夜，风会两次转向。把前七次值守学到的经验，用在两片木砖混合的家园上。", "阵风最多同时携带 3 枚飞火。利用风向时序与砖屋耐热，把喷淋留给真正暴露的木屋；在草地开始送出飞火之前隔断通路。三星需全保且不超过 8 点。"),
];

export interface Campaign { inheritedUnlocked: number; current: number; unlocked: number; stars: number[]; layouts: Record<string, Layout> }
export const newCampaign = (): Campaign => ({ inheritedUnlocked: 0, current: 0, unlocked: 0, stars: LEVELS.map(() => 0), layouts: {} });
export function readCampaign(raw: unknown): Campaign {
  const next = newCampaign();
  if (!raw || typeof raw !== "object") return next;
  const value = raw as Partial<Campaign>;
  if (Number.isInteger(value.inheritedUnlocked) && value.inheritedUnlocked! >= 0 && value.inheritedUnlocked! < LEVELS.length) next.inheritedUnlocked = value.inheritedUnlocked!;
  if (Array.isArray(value.stars)) next.stars = LEVELS.map((_, i) => Number.isInteger(value.stars![i]) && value.stars![i] >= 0 && value.stars![i] <= 3 ? value.stars![i] : 0);
  next.unlocked = next.inheritedUnlocked;
  while (next.unlocked < LEVELS.length - 1 && next.stars[next.unlocked] > 0) next.unlocked++;
  if (Number.isInteger(value.current) && value.current! >= 0 && value.current! <= next.unlocked) next.current = value.current!;
  for (const stage of LEVELS) if (value.layouts && validateScenarioLayout(value.layouts[stage.id], stage)) next.layouts[stage.id] = value.layouts[stage.id].slice();
  return next;
}
export function awardStars(saved: number, spent: number, stage: Level): number {
  return saved < stage.goal ? 0 : saved < counts(stage.layout).homes ? 1 : spent > stage.efficientBudget ? 2 : 3;
}

/** Old unlocks are retained, but changed maps/rules must earn their own stars. */
export function migrateCampaign(raw: unknown): Campaign {
  const legacy = readCampaign(raw);
  return { ...newCampaign(), current: legacy.current, unlocked: legacy.unlocked, inheritedUnlocked: legacy.unlocked };
}
