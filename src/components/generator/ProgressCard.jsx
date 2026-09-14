import React from "react";

const STAGES = [
  { id: 1, name: "Analyze Video" },
  { id: 2, name: "Extract Audio & Script" },
  { id: 3, name: "Score Viral Hooks" },
  { id: 4, name: "Trim & Polish Clips" },
  { id: 5, name: "Ready in Studio" },
];

/**
 * Calculates current step (1 to 5) from progress percentage and/or stage message.
 */
function getActiveStepIndex(progress, stageText = "") {
  const p = Number(progress) || 0;
  const s = String(stageText || "").toLowerCase();

  if (p >= 100 || s.includes("completed")) return 5;
  if (p >= 95 || s.includes("finalizing") || s.includes("ready")) return 4;
  if (p >= 45 || s.includes("trimming") || s.includes("clipping") || s.includes("downloading")) return 3;
  if (p >= 25 || s.includes("analyzing") || s.includes("viral") || s.includes("hooks") || s.includes("moments")) return 2;
  if (p >= 10 || s.includes("transcript") || s.includes("audio") || s.includes("script")) return 1;
  return 0;
}

export default function ProgressCard({
  progress = 0,
  stage = "Analyzing video...",
  thumbnail = "",
  title = "YouTube Video",
  duration = "00:00",
}) {
  const numericProgress = Math.min(100, Math.max(0, Math.round(Number(progress) || 0)));
  const activeStepIdx = getActiveStepIndex(numericProgress, stage);

  // Dynamic left position for tooltip pointer alignment over active segment (each is 20%)
  const tooltipLeftPercent = Math.min(80, Math.max(0, activeStepIdx * 20));

  return (
    <div className="w-full max-w-5xl rounded-3xl bg-[#121316] border border-white/10 p-6 md:p-8 shadow-2xl transition-all duration-300">
      <div className="flex flex-col md:flex-row gap-8 items-stretch">
        
        {/* ─── Left Column (65% Width — Stepped Progress UI) ─── */}
        <div className="md:w-[65%] flex flex-col justify-between">
          <div>
            {/* Header: Title & Real-time percentage badge */}
            <div className="flex items-center justify-between gap-4 mb-8">
              <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                Creating your viral clips...
              </h2>
              <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold px-3 py-1 rounded-full text-sm">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{numericProgress}%</span>
              </div>
            </div>

            {/* Stepped Progress Track Area */}
            <div className="relative pt-8 pb-4">
              {/* Status Tooltip Bubble (Positioned directly above active step) */}
              <div
                className="absolute top-0 transition-all duration-500 ease-out z-10"
                style={{ left: `calc(${tooltipLeftPercent}% + 4px)` }}
              >
                <div className="bg-[#1A1D23] border border-white/10 text-xs text-white px-4 py-2 rounded-xl shadow-lg relative inline-flex items-center gap-2 whitespace-nowrap after:content-[''] after:absolute after:top-full after:left-6 after:border-4 after:border-transparent after:border-t-[#1A1D23]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span className="font-medium">{stage || "Processing..."}</span>
                </div>
              </div>

              {/* Segmented Pill Track */}
              <div className="w-full flex rounded-2xl overflow-hidden divide-x divide-[#0E1013] bg-white/5 h-10 border border-white/5 shadow-inner">
                {STAGES.map((st, idx) => {
                  const isCompleted = idx < activeStepIdx || numericProgress >= 100;
                  const isActive = idx === activeStepIdx && numericProgress < 100;

                  if (isCompleted) {
                    return (
                      <div
                        key={st.id}
                        className="flex-1 bg-emerald-500 flex items-center justify-center text-white transition-colors duration-300"
                        title={`${st.name} (Completed)`}
                      >
                        <svg
                          className="w-4 h-4 text-white stroke-[3]"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                    );
                  }

                  if (isActive) {
                    return (
                      <div
                        key={st.id}
                        className="flex-1 bg-emerald-500/20 flex items-center justify-center transition-colors duration-300 relative overflow-hidden"
                        title={`${st.name} (In Progress)`}
                      >
                        <div className="absolute inset-0 bg-emerald-500/10 animate-pulse" />
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                        </span>
                      </div>
                    );
                  }

                  // Pending
                  return (
                    <div
                      key={st.id}
                      className="flex-1 bg-white/5 flex items-center justify-center text-gray-500 text-xs font-semibold transition-colors duration-300"
                      title={`${st.name} (Pending)`}
                    >
                      <span className="opacity-40">{st.id}</span>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Labels: Step numbers (1 to 5) and stage names */}
              <div className="grid grid-cols-5 gap-1 text-center mt-3">
                {STAGES.map((st, idx) => {
                  const isCompleted = idx < activeStepIdx || numericProgress >= 100;
                  const isActive = idx === activeStepIdx && numericProgress < 100;

                  return (
                    <div key={st.id} className="flex flex-col items-center px-1">
                      <span
                        className={`text-[10px] font-mono mb-0.5 ${
                          isCompleted
                            ? "text-emerald-400 font-bold"
                            : isActive
                            ? "text-white font-bold"
                            : "text-gray-600"
                        }`}
                      >
                        0{st.id}
                      </span>
                      <span
                        className={`text-[11px] leading-tight transition-colors ${
                          isCompleted
                            ? "text-gray-200 font-medium"
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
          </div>

          {/* Tip Banner (Footer) */}
          <div className="bg-white/[0.04] border border-white/5 rounded-xl px-4 py-2.5 text-xs text-gray-400 mt-6 flex items-center gap-2">
            <span className="text-emerald-400 font-bold text-sm">+</span>
            <span>
              <strong className="text-gray-300">Tip:</strong> High-scoring moments (80+) get prioritized first in your editor.
            </span>
          </div>
        </div>

        {/* ─── Right Column (35% Width — Media Preview) ─── */}
        <div className="md:w-[35%] flex flex-col justify-center">
          {/* Video Thumbnail Frame */}
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-white/10 bg-black/40 shadow-inner group">
            {thumbnail ? (
              <img
                src={thumbnail}
                alt={title || "Video Preview"}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-600 bg-[#0c0d10]">
                <svg
                  className="w-8 h-8 mb-1 text-gray-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                <span className="text-xs">No preview available</span>
              </div>
            )}

            {/* Badges over image */}
            <div className="absolute top-2.5 left-2.5">
              <span className="bg-black/60 backdrop-blur-sm text-[10px] font-semibold text-white px-2 py-0.5 rounded tracking-wider uppercase border border-white/10">
                SOURCE
              </span>
            </div>

            {duration && (
              <div className="absolute bottom-2.5 right-2.5">
                <span className="bg-black/70 backdrop-blur-sm text-[11px] font-mono text-white px-2 py-0.5 rounded border border-white/10">
                  {duration}
                </span>
              </div>
            )}
          </div>

          {/* Title display */}
          <div className="mt-3">
            <h3
              className="text-sm font-medium text-white line-clamp-2 leading-snug"
              title={title}
            >
              {title || "Untitled Video"}
            </h3>
          </div>
        </div>

      </div>
    </div>
  );
}
