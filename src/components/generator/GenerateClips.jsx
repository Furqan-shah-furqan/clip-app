import React, { useState, useRef } from "react";
import ProgressCard from "./ProgressCard";

export default function GenerateClips({
  onStartGeneration = () => {},
  isGenerating = false,
  generationProgress = 0,
  generationStage = "Finding the best moments with AI magic.",
  videoMetadata = {
    title: "YouTube Video",
    thumbnail: "",
    duration: "01:14:58",
  },
  currentMoment = null,
  totalMoments = null,
}) {
  const [url, setUrl] = useState("");
  const fileInputRef = useRef(null);

  const handleClear = () => {
    setUrl("");
  };

  const handleGenerateClick = () => {
    if (!url.trim()) return;
    onStartGeneration({ type: "youtube", url: url.trim() });
  };

  const handleFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onStartGeneration({ type: "upload", file });
    }
  };

  return (
    <div className="relative min-h-screen bg-[#F8FAFC] text-slate-900 overflow-hidden font-sans select-none">
      {/* ─── Subtle Pastel Mesh Ambient Blurs in Corners ─── */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-96 h-96 bg-purple-200/40 rounded-full blur-3xl filter" />
      <div className="pointer-events-none absolute top-20 -right-40 w-[500px] h-[500px] bg-cyan-200/40 rounded-full blur-3xl filter" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 w-[600px] h-[300px] bg-indigo-100/50 rounded-full blur-3xl filter" />

      {/* ─── Top Brand Header ─── */}
      <header className="relative z-20 max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-400 flex items-center justify-center shadow-md shadow-indigo-500/20">
            <svg
              className="w-5 h-5 text-white ml-0.5"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
            ClipFlow
          </span>
        </div>
      </header>

      {/* ─── Main Hero Section ─── */}
      <main className="relative z-10 max-w-5xl mx-auto px-6 pt-8 pb-20">
        {/* Floating Micro-Badges & Visual Accents (Desktop) */}
        <div className="hidden lg:block">
          {/* Left Badge: 3D YouTube */}
          <div className="absolute top-28 -left-8 xl:-left-20 animate-bounce duration-1000 delay-150">
            <div className="flex items-center gap-2 bg-white/90 backdrop-blur-md px-3.5 py-2 rounded-2xl shadow-lg border border-slate-100">
              <div className="w-7 h-7 rounded-lg bg-red-600 flex items-center justify-center shadow-sm">
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </div>
              <span className="text-xs font-semibold text-slate-700">From YouTube</span>
            </div>
            {/* Playful curved annotation */}
            <p className="text-[11px] text-slate-400 font-medium ml-3 mt-1.5">
              Turn hours into viral clips ↗
            </p>
          </div>

          {/* Right Badge: 3D Google Drive */}
          <div className="absolute top-28 -right-8 xl:-right-20 animate-bounce duration-1000">
            <div className="flex items-center gap-2 bg-white/90 backdrop-blur-md px-3.5 py-2 rounded-2xl shadow-lg border border-slate-100">
              <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center shadow-sm">
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7.71 3.5L1.15 15l3.43 6 6.55-11.5L7.71 3.5zm4.87 0l6.55 11.5h-6.86L5.72 3.5h6.86zm7.71 12.5L16.86 21H3.14l3.43-5h13.72z" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-slate-700">Or your Google Drive</span>
            </div>
            {/* Lower floating glass badge */}
            <div className="mt-2.5 bg-white/70 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200/60 shadow-sm max-w-[200px]">
              <p className="text-[11px] text-slate-500 font-medium leading-snug">
                ✦ AI finds the best moments — You just create more.
              </p>
            </div>
          </div>
        </div>

        {/* ─── Typography & Hero Headlines ─── */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-slate-900 leading-[1.15]">
            Long Videos. Shorter{" "}
            <span className="bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 bg-clip-text text-transparent">
              Fame.
            </span>
          </h1>
          <p className="text-base sm:text-lg text-slate-500 mt-4 leading-relaxed max-w-2xl mx-auto">
            Paste a YouTube link, upload a file, or import from Google Drive — let AI find, cut, and polish your best moments.
          </p>
        </div>

        {/* ─── Input Container / Embedded Luxury Progress Card ─── */}
        {isGenerating ? (
          <div className="transition-all duration-500 transform animate-in fade-in zoom-in-95">
            <ProgressCard
              progress={generationProgress}
              stage={generationStage}
              title={videoMetadata.title}
              thumbnail={videoMetadata.thumbnail}
              duration={videoMetadata.duration}
              currentMoment={currentMoment}
              totalMoments={totalMoments}
            />
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xl border border-gray-100 max-w-2xl mx-auto transition-all">
            {/* Primary Input: Pill container with link icon, input field, and clear (X) button */}
            <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all shadow-inner">
              <span className="text-slate-400 text-lg mr-3">🔗</span>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleGenerateClick()}
                placeholder="Paste YouTube link here..."
                className="w-full bg-transparent text-slate-900 text-sm sm:text-base placeholder:text-slate-400 focus:outline-none"
              />
              {url && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="w-6 h-6 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 text-xs flex items-center justify-center transition-colors ml-2 shrink-0"
                  title="Clear input"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelected}
              accept="video/*"
              className="hidden"
            />

            {/* Source Selectors: Two rounded selection pills underneath */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2.5 px-4 py-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all hover:border-slate-300 shadow-sm"
              >
                <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span>Upload: Video file (MP4, MOV, etc.)</span>
              </button>

              <button
                type="button"
                className="flex items-center justify-center gap-2.5 px-4 py-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all hover:border-slate-300 shadow-sm opacity-80"
              >
                <svg className="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7.71 3.5L1.15 15l3.43 6 6.55-11.5L7.71 3.5zm4.87 0l6.55 11.5h-6.86L5.72 3.5h6.86zm7.71 12.5L16.86 21H3.14l3.43-5h13.72z" />
                </svg>
                <span>Google Drive: Import from your Drive</span>
              </button>
            </div>

            {/* CTA Button: Full-width vibrant gradient button */}
            <button
              type="button"
              onClick={handleGenerateClick}
              disabled={!url.trim()}
              className={`w-full mt-6 py-4 rounded-2xl font-semibold text-white text-base shadow-lg transition-all duration-300 flex items-center justify-center gap-2 ${
                url.trim()
                  ? "bg-gradient-to-r from-purple-600 via-indigo-500 to-cyan-400 hover:opacity-95 hover:shadow-indigo-500/25 active:scale-[0.99] cursor-pointer"
                  : "bg-slate-300 cursor-not-allowed opacity-70"
              }`}
            >
              <span>✨ Generate Clips</span>
              <span>→</span>
            </button>
          </div>
        )}

        {/* ─── Value Proposition Footer (3 Columns) ─── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 max-w-4xl mx-auto pt-8 border-t border-slate-200/60 text-center">
          <div className="flex flex-col items-center">
            <span className="text-2xl mb-1">⚡</span>
            <h3 className="text-sm font-bold text-slate-800">AI-Powered</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Finds viral moments automatically
            </p>
          </div>

          <div className="flex flex-col items-center">
            <span className="text-2xl mb-1">⏱️</span>
            <h3 className="text-sm font-bold text-slate-800">Save Hours</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Turn long content into shorts
            </p>
          </div>

          <div className="flex flex-col items-center">
            <span className="text-2xl mb-1">📈</span>
            <h3 className="text-sm font-bold text-slate-800">More Reach</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Create. Post. Grow.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
