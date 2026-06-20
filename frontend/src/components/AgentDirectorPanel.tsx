import { motion } from "framer-motion";
import type { AgentTraceItem } from "../lib/api";
import { IconWave, IconShell, IconIsland, IconQuill, IconLighthouse, IconCheck } from "./IslandIcons";
import { EASE_OUT_EXPO } from "../lib/motion";
import { useImmersion } from "../hooks/useImmersion";

interface Props {
  agents: AgentTraceItem[];
  done?: boolean;
}

type Status = "waiting" | "running" | "done";

// 5 位「岛屿信使」——用 SVG 替代 emoji，文案改成叙事语
const MESSENGERS: { key: string; name: string; role: string; Icon: typeof IconWave; tint: string }[] = [
  { key: "emotion", name: "潮汐", role: "替你读懂心情的起落", Icon: IconWave, tint: "#7fd3dd" },
  { key: "memory", name: "贝壳", role: "翻找岛屿记得的你", Icon: IconShell, tint: "#f4f1d0" },
  { key: "environment", name: "岛屿天气", role: "为这一刻挑一片天", Icon: IconIsland, tint: "#9fb4f0" },
  { key: "narrative", name: "羽毛笔", role: "把回应写在风里", Icon: IconQuill, tint: "#aeb9d6" },
  { key: "safety", name: "灯塔", role: "守在最深的那段海", Icon: IconLighthouse, tint: "#f5d28a" },
];

/**
 * 「岛屿派出了 5 位信使」——多智能体协作的叙事化展示。
 * 每个信使有自己的名字 + 1.5px SVG 图标 + 暖色调，逐个出场，
 * 处理中时光晕脉动，完成后变成 check + 渐隐的连接线连向下一位。
 */
export default function AgentDirectorPanel({ agents, done }: Props) {
  const { immersive } = useImmersion();
  const byKey = new Map(agents.map((a) => [a.agent, a]));
  const firstPendingIndex = MESSENGERS.findIndex((m) => !byKey.has(m.key));

  return (
    <div className="w-full max-w-md mx-auto mt-4">
      <motion.p
        className="text-center text-mist-200 text-on-scene text-caption tracking-[0.32em] mb-1 font-serif"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        岛屿派出了 5 位信使
      </motion.p>
      <motion.p
        className="text-center text-mist-300 text-on-scene text-[10px] tracking-[0.2em] mb-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.5 }}
      >
        它们正自己决定要不要翻记忆、读岛屿
      </motion.p>

      <div className="relative flex flex-col gap-2" style={{ perspective: "800px" }}>
        {MESSENGERS.map((meta, i) => {
          const trace = byKey.get(meta.key);
          let status: Status = "waiting";
          if (trace) status = "done";
          else if (!done && i === firstPendingIndex) status = "running";

          const isLast = i === MESSENGERS.length - 1;
          const nextDone = !isLast && (byKey.has(MESSENGERS[i + 1].key) || (!done && i + 1 === firstPendingIndex));

          return (
            <motion.div
              key={meta.key}
              className="relative"
              initial={{ opacity: 0, x: -12, filter: "blur(4px)" }}
              animate={{
                opacity: status === "waiting" ? 0.4 : 1,
                x: 0,
                filter: "blur(0px)",
                // Z 错落：被点名（done）的信使微微前移一档，景深里"靠近你"；静海/reduced 下归零
                z: immersive ? (status === "done" ? 20 : status === "running" ? 10 : 0) : 0,
              }}
              transition={{ duration: 0.55, delay: i * 0.08, ease: EASE_OUT_EXPO }}
            >
              {/* 信使卡 */}
              <div
                className="relative flex items-center gap-3 panel-glass-1 rounded-card px-3.5 py-2 overflow-hidden"
                style={status !== "waiting" ? { borderColor: `${meta.tint}55` } : undefined}
              >
                {/* 处理中：背景径向光晕脉动 */}
                {status === "running" && (
                  <motion.div
                    aria-hidden
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: `radial-gradient(circle at 20% 50%, ${meta.tint}30, transparent 70%)` }}
                    animate={{ opacity: [0.4, 0.9, 0.4] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}

                {/* 头像圆 */}
                <div
                  className="relative shrink-0 grid place-items-center h-9 w-9 rounded-full"
                  style={{
                    background: status === "done" ? `${meta.tint}22` : "rgba(255,255,255,0.05)",
                    border: `1px solid ${status === "waiting" ? "rgba(255,255,255,0.12)" : `${meta.tint}66`}`,
                    boxShadow: status === "done" ? `0 0 16px -4px ${meta.tint}77` : undefined,
                    color: status === "waiting" ? "rgba(255,255,255,0.45)" : meta.tint,
                  }}
                >
                  <motion.div
                    animate={status === "running" ? { rotate: [0, 6, -6, 0] } : status === "done" ? { scale: [1, 1.08, 1] } : {}}
                    transition={
                      status === "running"
                        ? { duration: 2.8, repeat: Infinity, ease: "easeInOut" }
                        : { duration: 0.6, delay: 0.1, ease: "easeOut" }
                    }
                  >
                    <meta.Icon size={18} />
                  </motion.div>
                  {status === "done" && (
                    <motion.div
                      className="absolute -right-0.5 -bottom-0.5 grid place-items-center h-3.5 w-3.5 rounded-full"
                      style={{ background: meta.tint, color: "#0a0e1f" }}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 380, damping: 22, delay: 0.15 }}
                    >
                      <IconCheck size={10} />
                    </motion.div>
                  )}
                </div>

                {/* 文字 */}
                <div className="relative flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-serif text-mist-100 text-[13px]">{meta.name}</span>
                    <span className="text-mist-300 text-caption">· {meta.role}</span>
                  </div>
                  <motion.p
                    className="text-mist-300 text-caption leading-snug truncate mt-0.5"
                    initial={false}
                    animate={{ opacity: trace ? 1 : 0.7 }}
                  >
                    {trace?.output ?? (status === "running" ? "正在赶来……" : "在岛屿那头等着")}
                  </motion.p>
                </div>

                {/* 处理中点 */}
                {status === "running" && (
                  <motion.span
                    aria-hidden
                    className="relative h-1.5 w-1.5 rounded-full"
                    style={{ background: meta.tint, boxShadow: `0 0 8px ${meta.tint}` }}
                    animate={{ opacity: [0.4, 1, 0.4], scale: [0.8, 1.3, 0.8] }}
                    transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}
              </div>

              {/* 连接线：done 信使到下一位 */}
              {!isLast && (
                <div
                  aria-hidden
                  className="absolute left-[26px] -bottom-2 h-2 w-px overflow-hidden"
                >
                  <motion.div
                    className="h-full w-full"
                    style={{
                      background: nextDone ? `linear-gradient(180deg, ${meta.tint}88, transparent)` : "rgba(255,255,255,0.12)",
                    }}
                    initial={{ scaleY: 0, originY: 0 }}
                    animate={{ scaleY: status === "done" ? 1 : 0 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
