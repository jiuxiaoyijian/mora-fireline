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
  return { id, name, efficientBudget: (options.budget ?? 4) - 1, layout, houseTypes, budget: 4, goal: counts(layout).homes, duration: 30,
    tools: ["break", "station", "erase"], weather: [{ at: 0, direction: "east", strength: 1 }], emberInterval: 0, seed: Number(id),
    ...options, lesson, hint };
}
export const LEVELS: readonly Level[] = [
  level("1", "第一道防线", ["########", "F...HH##", "########", "########", "########", "########", "########", "########"],
    { budget: 2, tools: ["break", "erase"], duration: 20 }, "居民已撤离。你第一次独立值守：在山火和两间木屋之间，留下一道不会燃烧的空隙。", "选择防火带，点击 C2，再开始演练。绿色短线表示火被挡住；草地会传火，拆除不等于隔离。"),
  level("2", "绕过缺口", ["########", "F..HH###", "#..HH###", "########", "########", "########", "########", "########"],
    { budget: 3, tools: ["break", "erase"] }, "山火会沿六个方向绕行。守住这片四户的小聚落，试着连接一条完整防线。", "可拖动铺设防火带。B2 和 B3 是两条入口；只堵一格，火会从旁边绕过。"),
  level("3", "屋前的雨", ["########", "#..HH###", "F..HH###", "########", "########", "########", "########", "########"],
    { budget: 4, efficientBudget: 4, tools: ["station", "erase"] }, "补给车只送来一座喷淋器。让它覆盖受威胁的草地与住宅，观察热量如何消退。", "喷淋花费 4 点，覆盖两步六边形距离。试着放在 B2；降温由受热地块共享，无法扑灭已经起火的房屋。"),
  level("4", "越过防线的火星", ["########", "##F.HH##", "###.HH##", "########", "########", "########", "########", "########"],
    { budget: 5, emberInterval: 4 }, "强风带来飞火：它会越过防火带，在落点预警后点燃远处木屋。用湿润屋顶接住火星。", "橙色圈标记 1.5 秒后飞火落点。防火带只挡地面；D3 的喷淋可覆盖四户，再考虑 D2 的地面火。"),
  level("5", "先守木屋", ["########", "##F.HH##", "###.HH##", "########", "#..BBB##", "F..BBB##", "#..#####", "########"],
    { budget: 8, goal: 8, emberInterval: 4, duration: 40 }, "北侧木屋怕火星，南侧砖屋更耐热，却也经不起持续燃烧。把有限补给分给两片街区。", "木屋受热 40 起火，砖屋为 90；砖屋不是防火墙。北侧喷淋护屋顶，南侧尝试用便宜的连续隔离带。"),
  level("6", "风向变了", ["########", "##F.HH##", "###.HH##", "########", "##HH...F", "##HH...#", "#####..#", "########"],
    { budget: 9, goal: 6, emberInterval: 4, duration: 40, weather: [{ at: 0, direction: "east", strength: 1 }, { at: 12, direction: "west", strength: 1.2 }], sourceStarts: { 39: 12 } },
    "预报说 12 秒后风将转向，东侧也会出现火头。开局就要为第二轮威胁预留防线。", "看顶部风向预报。北侧保护飞火落点，南侧可在 G5、G6、G7 封住东面的入口。"),
  level("7", "紧缺的补给", ["########", "##F.HH##", "###.HH##", "########", "###.HH##", "##F.HH##", "########", "########"],
    { budget: 8, efficientBudget: 8, goal: 6, emberInterval: 3, duration: 40 }, "两处火源都离木屋很近，补给只够两座喷淋。找出兼顾屋顶与地面降温的位置。", "上下各四户。比较 D2/D3 与 D5/D6 的覆盖；不能依赖便宜的隔离带应对飞火。"),
  level("8", "山海守夜", ["########", "##F.HB##", "###.BH##", "########", "##HB.F##", "##BH..##", "########", "########"],
    { budget: 10, emberInterval: 2.5, duration: 45, weather: [{ at: 0, direction: "east", strength: 1.3 }, { at: 12, direction: "west", strength: 1.3 }, { at: 28, direction: "east", strength: 1.5 }], sourceStarts: { 37: 12 } },
    "最后一夜，风会两次转向。把前七次值守学到的经验，用在两片木砖混合的家园上。", "先让两片屋顶都处于喷淋覆盖，再用余下 2 点堵住紧邻火源的地面。观察预热和飞火，而不只盯着已经燃起的火。"),
];

export interface Campaign { current: number; unlocked: number; stars: number[]; layouts: Record<string, Layout> }
export const newCampaign = (): Campaign => ({ current: 0, unlocked: 0, stars: LEVELS.map(() => 0), layouts: {} });
export function readCampaign(raw: unknown): Campaign {
  const next = newCampaign();
  if (!raw || typeof raw !== "object") return next;
  const value = raw as Partial<Campaign>;
  if (Array.isArray(value.stars)) next.stars = LEVELS.map((_, i) => Number.isInteger(value.stars![i]) && value.stars![i] >= 0 && value.stars![i] <= 3 ? value.stars![i] : 0);
  while (next.unlocked < LEVELS.length - 1 && next.stars[next.unlocked] > 0) next.unlocked++;
  if (Number.isInteger(value.current) && value.current! >= 0 && value.current! <= next.unlocked) next.current = value.current!;
  for (const stage of LEVELS) if (value.layouts && validateScenarioLayout(value.layouts[stage.id], stage)) next.layouts[stage.id] = value.layouts[stage.id].slice();
  return next;
}
export function awardStars(saved: number, spent: number, stage: Level): number {
  return saved < stage.goal ? 0 : saved < counts(stage.layout).homes ? 1 : spent > stage.efficientBudget ? 2 : 3;
}
