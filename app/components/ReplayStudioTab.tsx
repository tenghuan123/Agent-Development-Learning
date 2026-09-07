import { useState, useEffect, useRef, useCallback } from "react";
import {
  FastForward,
  RotateCcw,
  Pause,
  Play,
  SkipForward,
} from "lucide-react";
import type { AgentEvent, ReplayStateSnapshot } from "~/core/events";

interface ReplayStudioTabProps {
  runId?: string | null;
}

export function ReplayStudioTab({ runId }: ReplayStudioTabProps) {
  const [replayEvents, setReplayEvents] = useState<AgentEvent[]>([]);
  const [replayIndex, setReplayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState<0.5 | 1 | 2>(1);
  const [projectedState, setProjectedState] = useState<ReplayStateSnapshot | null>(null);
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. 数据获取下沉：组件挂载或 runId 改变时加载回放数据
  useEffect(() => {
    if (!runId) return;

    let cancelled = false;

    async function loadReplayData() {
      try {
        const res = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "project_state", runId }),
        });
        const data = await res.json();
        if (!cancelled && data.success) {
          setReplayEvents(data.events || []);
          setReplayIndex(data.events ? data.events.length : 0);
          setProjectedState(data.state || null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Load replay error:", err);
        }
      }
    }

    loadReplayData();

    return () => {
      cancelled = true;
    };
  }, [runId]);

  // 2. 根据当前滑动条位置计算投影状态
  const updateProjectedStateAtIndex = useCallback(
    async (idx: number) => {
      if (!replayEvents || replayEvents.length === 0) return;
      const clampedIdx = Math.max(0, Math.min(idx, replayEvents.length));
      setReplayIndex(clampedIdx);

      const targetEvent = replayEvents[clampedIdx - 1];
      const upToSeqId = targetEvent ? targetEvent.seqId : 0;
      if (!runId) return;

      try {
        const res = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "project_state",
            runId,
            upToSeqId,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setProjectedState(data.state);
        }
      } catch (err) {
        console.error("Replay project error:", err);
      }
    },
    [replayEvents, runId]
  );

  // 3. 播放器定时器与严格清理
  useEffect(() => {
    if (!isPlaying) {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
      return;
    }

    const intervalMs = Math.round(500 / playSpeed);
    playTimerRef.current = setInterval(() => {
      setReplayIndex((prev) => {
        if (prev >= replayEvents.length) {
          setIsPlaying(false);
          return prev;
        }
        const next = prev + 1;
        updateProjectedStateAtIndex(next);
        return next;
      });
    }, intervalMs);

    return () => {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
      }
    };
  }, [isPlaying, playSpeed, replayEvents.length, updateProjectedStateAtIndex]);

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <FastForward className="w-5 h-5 text-indigo-400" />
              基于事件溯源的时间旅行回放 (Event Sourcing Replay)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              零消耗任何 Token，100% 依据不可变事件日志，像视频播放器一样精确投影还原任意时刻的 Agent 状态。
            </p>
          </div>

          {/* 播放控制按钮 */}
          <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-xl border border-slate-800">
            <button
              onClick={() => updateProjectedStateAtIndex(0)}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
              title="跳到开头"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-1 text-xs font-bold px-3"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isPlaying ? "暂停" : "播放"}
            </button>
            <button
              onClick={() => updateProjectedStateAtIndex(replayIndex + 1)}
              disabled={replayIndex >= replayEvents.length}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 transition"
              title="单步步进"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            {/* 倍速切换 */}
            <div className="border-l border-slate-800 pl-2 flex gap-1">
              {([0.5, 1, 2] as const).map((spd) => (
                <button
                  key={spd}
                  onClick={() => setPlaySpeed(spd)}
                  className={`px-2 py-1 rounded text-xs font-bold ${
                    playSpeed === spd
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 时间轴拖动滑动条 */}
        <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400 font-mono">
              当前事件索引: <b className="text-cyan-400">{replayIndex}</b> / {replayEvents.length}
            </span>
            <span className="text-indigo-400 font-mono">
              {replayEvents[replayIndex - 1]
                ? `当前事件: ${replayEvents[replayIndex - 1].type} (Seq: ${replayEvents[replayIndex - 1].seqId})`
                : "初始空闲状态"}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max={replayEvents.length}
            value={replayIndex}
            onChange={(e) => updateProjectedStateAtIndex(Number(e.target.value))}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
        </div>
      </div>

      {/* 投射出的状态快照展板 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左：当前时刻投影出的状态概览 */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2 flex items-center justify-between">
            <span>投射状态 (Projected State)</span>
            <span
              className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                projectedState?.currentState === "completed"
                  ? "bg-emerald-950 text-emerald-300"
                  : projectedState?.currentState === "running"
                  ? "bg-indigo-950 text-indigo-300"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {projectedState?.currentState || "idle"}
            </span>
          </h3>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between p-2 rounded bg-slate-950 border border-slate-800">
              <span className="text-slate-400">当前步骤 (Step):</span>
              <span className="font-bold text-white">第 {projectedState?.currentStep || 0} 步</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-slate-950 border border-slate-800">
              <span className="text-slate-400">工具调用数:</span>
              <span className="font-bold text-cyan-400">
                {projectedState?.toolCalls.length || 0} 个
              </span>
            </div>
            <div className="flex justify-between p-2 rounded bg-slate-950 border border-slate-800">
              <span className="text-slate-400">任务是否收敛:</span>
              <span
                className={`font-bold ${
                  projectedState?.isFinished ? "text-emerald-400" : "text-amber-400"
                }`}
              >
                {projectedState?.isFinished ? "已结束 (Finished)" : "运行中 (Active)"}
              </span>
            </div>
          </div>

          {projectedState?.finalAnswer && (
            <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-xs">
              <div className="font-semibold text-emerald-300 mb-1">最终输出答案:</div>
              <div className="text-slate-200">{projectedState.finalAnswer}</div>
            </div>
          )}
        </div>

        {/* 中/右：当时还原的思考与工具执行 */}
        <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2">
            历史思考与工具调用实时复现
          </h3>

          <div className="space-y-3 overflow-y-auto max-h-96 pr-2">
            {/* 思考流 */}
            {projectedState?.thoughts.map((th, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg bg-indigo-950/20 border border-indigo-500/20 text-xs"
              >
                <div className="text-indigo-300 font-bold mb-1">💭 Step {idx + 1} 思考推导:</div>
                <div className="text-slate-300 leading-relaxed">{th}</div>
              </div>
            ))}

            {/* 工具执行流 */}
            {projectedState?.toolCalls.map((tool) => (
              <div
                key={tool.id}
                className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between font-mono">
                  <span className="text-cyan-300 font-bold">🔧 工具: {tool.name}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      tool.status === "completed"
                        ? "bg-emerald-950 text-emerald-300"
                        : "bg-amber-950 text-amber-300"
                    }`}
                  >
                    {tool.status}
                  </span>
                </div>
                <div className="text-slate-400 text-[11px]">
                  参数: {JSON.stringify(tool.args)}
                </div>
                {tool.chunks.length > 0 && (
                  <div className="p-2 rounded bg-black/50 font-mono text-[10px] text-slate-300">
                    {tool.chunks.join("")}
                  </div>
                )}
                {tool.output && (
                  <div className="text-emerald-300 text-[11px] pt-1">
                    输出: {tool.output}
                  </div>
                )}
              </div>
            ))}

            {!projectedState?.thoughts.length && !projectedState?.toolCalls.length && (
              <div className="text-slate-500 text-center py-16 text-xs">
                拖动时间轴或点击播放，观察状态如何从事件历史中实时投射生长
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

