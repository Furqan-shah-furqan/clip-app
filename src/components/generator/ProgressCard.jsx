import React from "react";

const STAGES = [
  { id: 1, name: "Analyze Video" },
  { id: 2, name: "Extract Audio & Script" },
  { id: 3, name: "Score Viral Hooks" },
  { id: 4, name: "Trim & Polish Clips" },
  { id: 5, name: "Ready in Studio" },
];

/**
 * Calculates current step index (0 to 4) based on progress and stage message.
 */
function getActiveStepIndex(progress, stageText = "") {
  const p = Number(progress) || 0;
  const s = String(stageText || "").toLowerCase();

  if (p >= 100 || s.includes("completed") || s.includes("ready in studio")) return 4;
  if (p >= 90 || s.includes("finalizing") || s.includes("ready")) return 3;
  if (p >= 45 || s.includes("trimming") || s.includes("clipping") || s.includes("downloading & clipping") || s.includes("moment")) return 3;
  if (p >= 25 || s.includes("analyzing content") || s.includes("viral") || s.includes("hooks") || s.includes("moments selected")) return 2;
  if (p >= 10 || s.includes("transcript") || s.includes("extracting") || s.includes("audio") || s.includes("script")) return 1;
  return 0;
}

/**
 * Extracts moment X of Y from stage string if available.
 */
function extractMomentCount(stageText = "", currentProp, totalProp) {
  if (currentProp != null && totalProp != null) {
    return { current: currentProp, total: totalProp };
  }
  const match = String(stageText).match(/moment\s+(\d+)\s+of\s+(\d+)/i);
  if (match) {
    return { current: Number(match[1]), total: Number(match[2]) };
  }
  const clipMatch = String(stageText).match(/clip\s+(\d+)\s+of\s+(\d+)/i);
  if (clipMatch) {
    return { current: Number(clipMatch[1]), total: Number(clipMatch[2]) };
  }
  return null;
}

export default function ProgressCard({
  progress = 0,
  stage = "Finding the best moments with AI magic.",
  thumbnail = "",
  title = "YouTube Video",
  duration = "01:14:58",
  currentMoment = null,
  totalMoments = null,
}) {
  const numericProgress = Math.min(100, Math.max(0, Math.round(Number(progress) || 0)));
  const activeStepIdx = getActiveStepIndex(numericProgress, stage);
  const momentInfo = extractMomentCount(stage, currentMoment, totalMoments);

  // SVG circle calculation
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference - (numericProgress / 100) * circumference;

  return (
    <div className="w-full max-w-3xl mx-auto rounded-3xl bg-[#0D0F14] text-white p-6 md:p-8 shadow-2xl border border-white/10 transition-all duration-300">
      {/* ─── Top Row ─── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">
            Creating your viral clips...
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Finding the best moments with AI magic.
          </p>
        </div>

        {/* SVG Circular Progress Ring */}
        <div className="relative w-16 h-16 flex items-center justify-center shrink-0">
          <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 72 72">
            {/* Background track circle */}
            <circle
              cx="36"
              cy="36"
              r={radius}
              stroke="rgba(255, 255, 255, 0.1)"
              strokeWidth="5"
              fill="transparent"
            />
            {/* Progress indicator circle */}
            <circle
              cx="36"
              cy="36"
              r={radius}
              stroke="#06b6d4"
              strokeWidth="5"
              strokeDasharray={circumference}
              strokeDashoffset={strokeOffset}
              strokeLinecap="round"
              fill="transparent"
              className="transition-all duration-500 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-bold font-mono text-cyan-400">
              {numericProgress}%
            </span>
          </div>
        </div>
      </div>

      {/* ─── Stepped Progress Track ─── */}
      <div className="mt-8 relative">
        {/* Connecting Horizontal Track Line */}
        <div className="absolute top-4 left-6 right-6 h-[2px] bg-white/10 -translate-y-1/2 z-0">
          <div
            className="h-full bg-cyan-500 transition-all duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, (activeStepIdx / (STAGES.length - 1)) * 100))}%` }}
          />
        </div>

        {/* 5 Numbered Nodes */}
        <div className="relative z-10 flex justify-between items-start">
          {STAGES.map((st, idx) => {
            const isCompleted = idx < activeStepIdx || numericProgress >= 100;
            const isActive = idx === activeStepIdx && numericProgress < 100;

            return (
              <div key={st.id} className="flex flex-col items-center flex-1">
                {/* Node Circle */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                    isCompleted
                      ? "bg-cyan-500 text-black shadow-[0_0_12px_rgba(6,182,212,0.5)]"
                      : isActive
                      ? "bg-[#06b6d4] text-black ring-4 ring-cyan-500/20 shadow-[0_0_14px_rgba(6,182,212,0.8)] animate-pulse"
                      : "bg-[#161922] text-white/40 border border-white/10"
                  }`}
                >
                  {isCompleted ? (
                    <svg
                      className="w-4 h-4 text-black stroke-[3]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span>{st.id}</span>
                  )}
                </div>

                {/* Node Name */}
                <span
                  className={`mt-2 text-[11px] text-center font-medium leading-tight max-w-[70px] md:max-w-[90px] transition-colors ${
                    isCompleted
                      ? "text-cyan-300"
                      : isActive
                      ? "text-white font-semibold"
                      : "text-gray-500"
                  }`}
                >
                  {st.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Inner Media Status Pill ─── */}
      <div className="bg-[#161922] border border-white/5 p-3 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 mt-8">
        {/* Left: Video Thumbnail + Badge + Duration */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-16 h-11 rounded-lg overflow-hidden bg-black/60 shrink-0 border border-white/10">
            {thumbnail ? (
              <img
                src={thumbnail}
                alt={title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-white/5 text-gray-600">
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
            )}
            <span className="absolute top-1 left-1 bg-black/70 text-[8px] font-bold px-1 rounded text-white tracking-wider">
              SOURCE
            </span>
          </div>

          {/* Middle: Title & Duration */}
          <div className="min-w-0">
            <h4 className="text-xs font-semibold text-white truncate max-w-[200px] md:max-w-[240px]">
              {title || "YouTube Video"}
            </h4>
            <p className="text-[11px] text-gray-400 mt-0.5">
              YouTube • {duration || "01:14:58"}
            </p>
          </div>
        </div>

        {/* Right: Status Pill Displaying Live Dynamic Count */}
        <div className="w-full sm:w-auto flex justify-end">
          <div className="bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs px-3.5 py-1.5 rounded-full flex items-center gap-2 font-medium whitespace-nowrap shadow-sm">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping inline-block" />
            <span>
              {momentInfo
                ? `Downloading & clipping moment ${momentInfo.current} of ${momentInfo.total}...`
                : stage || "Processing video..."}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
