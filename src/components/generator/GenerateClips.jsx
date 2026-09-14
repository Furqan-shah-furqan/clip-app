import React, { useState, useRef, useEffect } from "react";
import ProgressCard from "./ProgressCard";

export default function GenerateClips({
  onStartGeneration = () => {},
  isGenerating: propIsGenerating = false,
  generationProgress: propProgress = 0,
  generationStage: propStage = "Finding the best moments with AI magic.",
  videoMetadata = {
    title: "YouTube Video",
    thumbnail: "",
    duration: "01:14:58",
  },
  currentMoment = null,
  totalMoments = null,
  clips: propClips = [],
  jobId = null,
}) {
  const [url, setUrl] = useState("");
  const [clips, setClips] = useState(propClips || []);
  const [isGenerating, setIsGenerating] = useState(propIsGenerating);
  const [progress, setProgress] = useState(propProgress);
  const [stage, setStage] = useState(propStage);
  const [activeJobId, setActiveJobId] = useState(jobId);
  const fileInputRef = useRef(null);
  const pollTimerRef = useRef(null);

  // Sync props if controlled externally
  useEffect(() => {
    if (propClips && propClips.length > 0) {
      setClips(propClips);
      setIsGenerating(false);
      setProgress(null);
    }
  }, [propClips]);

  useEffect(() => {
    setIsGenerating(propIsGenerating);
  }, [propIsGenerating]);

  useEffect(() => {
    setProgress(propProgress);
  }, [propProgress]);

  useEffect(() => {
    setStage(propStage);
  }, [propStage]);

  useEffect(() => {
    if (jobId) {
      setActiveJobId(jobId);
    }
  }, [jobId]);

  // Polling handler for job status (GET /api/clips/status/:jobId)
  useEffect(() => {
    if (!activeJobId || !isGenerating) return;

    let isMounted = true;

    const pollStatus = async () => {
      try {
        const response = await fetch(`/api/clips/status/${encodeURIComponent(activeJobId)}`);
        if (!response.ok) {
          // Fallback to /api/clips/generation-jobs/:jobId
          const altResponse = await fetch(`/api/clips/generation-jobs/${encodeURIComponent(activeJobId)}`);
          if (!altResponse.ok) return;
          const altData = await altResponse.json();
          handlePollResponse(altData);
          return;
        }
        const data = await response.json();
        handlePollResponse(data);
      } catch (err) {
        console.warn("[GenerateClips] Polling error:", err.message);
      }
    };

    const handlePollResponse = (data) => {
      if (!isMounted) return;

      const job = data.job || data;
      const status = String(job.status || data.status || "").toLowerCase();
      const currentProg = typeof job.progress === "number" ? job.progress : data.progress;
      const currentStage = job.stage || job.message || data.stage || data.message;

      if (currentProg !== undefined) setProgress(currentProg);
      if (currentStage) setStage(currentStage);

      // PART 1: 100% Completion State Handoff
      if (status === "completed" || currentProg === 100) {
        const returnedClips = data.clips || job.clips || [];
        if (returnedClips && returnedClips.length > 0) {
          console.log(`[GenerateClips] Job completed! Received ${returnedClips.length} clips.`);
          setClips(returnedClips);
          setIsGenerating(false);
          setProgress(null);
          setActiveJobId(null);
          return;
        }
      }

      if (status === "failed" || status === "cancelled") {
        setIsGenerating(false);
        setProgress(null);
        setActiveJobId(null);
        return;
      }

      // Continue polling
      pollTimerRef.current = setTimeout(pollStatus, 2000);
    };

    pollTimerRef.current = setTimeout(pollStatus, 1500);

    return () => {
      isMounted = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [activeJobId, isGenerating]);

  const handleClear = () => {
    setUrl("");
  };

  const handleGenerateClick = async () => {
    if (!url.trim()) return;
    setIsGenerating(true);
    setProgress(5);
    setStage("Starting generation...");
    setClips([]);

    try {
      const result = await onStartGeneration({ type: "youtube", url: url.trim() });
      if (result && result.jobId) {
        setActiveJobId(result.jobId);
      }
    } catch (err) {
      console.error("[GenerateClips] Generation error:", err);
      setIsGenerating(false);
      setProgress(null);
    }
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsGenerating(true);
      setProgress(5);
      setStage("Uploading video...");
      setClips([]);

      try {
        const result = await onStartGeneration({ type: "upload", file });
        if (result && result.jobId) {
          setActiveJobId(result.jobId);
        }
      } catch (err) {
        console.error("[GenerateClips] Upload error:", err);
        setIsGenerating(false);
        setProgress(null);
      }
    }
  };

  const handleResetToNew = () => {
    setClips([]);
    setIsGenerating(false);
    setProgress(null);
    setActiveJobId(null);
    setUrl("");
  };

  const hasClips = clips && Array.isArray(clips) && clips.length > 0;

  return (
    <div className="relative min-h-screen bg-[#F8FAFC] dark:bg-[#0A0B0E] text-gray-950 dark:text-white overflow-hidden font-sans select-none transition-colors duration-300">
      {/* ─── Subtle Ambient Background Glows ─── */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-96 h-96 bg-purple-200/30 dark:bg-purple-900/10 rounded-full blur-3xl filter" />
      <div className="pointer-events-none absolute top-20 -right-40 w-[500px] h-[500px] bg-cyan-200/30 dark:bg-cyan-900/10 rounded-full blur-3xl filter" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 w-[600px] h-[300px] bg-indigo-100/40 dark:bg-indigo-950/10 rounded-full blur-3xl filter" />

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
          <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-gray-950 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
            ClipFlow
          </span>
        </div>

        {hasClips && (
          <button
            type="button"
            onClick={handleResetToNew}
            className="text-xs font-semibold px-4 py-2 rounded-xl bg-white dark:bg-[#161922] border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 transition-all shadow-sm flex items-center gap-2"
          >
            <span>+</span>
            <span>New Video</span>
          </button>
        )}
      </header>

      {/* ─── Main Content ─── */}
      <main className="relative z-10 max-w-5xl mx-auto px-6 pt-6 pb-20">
        {/* ─── Clean, Centered Hero Headlines ─── */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <h1 className="text-gray-950 dark:text-white font-extrabold text-4xl md:text-5xl text-center tracking-tight leading-[1.15]">
            Long Videos. Shorter{" "}
            <span className="bg-gradient-to-r from-purple-600 via-indigo-500 to-cyan-400 bg-clip-text text-transparent">
              Fame.
            </span>
          </h1>
          <p className="text-gray-600 dark:text-gray-300 text-sm md:text-base text-center mt-3 max-w-xl mx-auto leading-relaxed">
            Paste a YouTube link, upload a file, or import from Google Drive — let AI find, cut, and polish your best moments.
          </p>
        </div>

        {/* ─── Dynamic Main Area: Generating vs Results vs Input Card ─── */}
        {isGenerating ? (
          <div className="transition-all duration-500 transform animate-in fade-in zoom-in-95">
            <ProgressCard
              progress={progress}
              stage={stage}
              title={videoMetadata.title}
              thumbnail={videoMetadata.thumbnail}
              duration={videoMetadata.duration}
              currentMoment={currentMoment}
              totalMoments={totalMoments}
            />
          </div>
        ) : hasClips ? (
          /* ─── Results Grid View: Render all generated clips ─── */
          <section className="transition-all duration-500 animate-in fade-in">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-gray-950 dark:text-white flex items-center gap-2">
                  <span>✨ Smart Clips Generated</span>
                  <span className="text-sm font-semibold px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                    {clips.length} {clips.length === 1 ? "Clip" : "Clips"}
                  </span>
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Ready to preview, edit captions, or export in 9:16 vertical format.
                </p>
              </div>

              <button
                type="button"
                onClick={handleResetToNew}
                className="px-4 py-2.5 rounded-xl bg-white dark:bg-[#161922] border border-slate-200 dark:border-white/10 hover:border-indigo-400 text-xs font-bold text-gray-800 dark:text-gray-200 transition-all shadow-sm"
              >
                Clip Another Video →
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {clips.map((clip, index) => {
                const clipUrl =
                  clip.downloadUrl ||
                  clip.url ||
                  clip.storageUrl ||
                  clip.previewUrl ||
                  (clip.fileName ? `/api/files/download/${encodeURIComponent(clip.fileName)}` : "");
                const title = clip.title || clip.hook || `Smart Clip #${index + 1}`;
                const score = Math.round(Number(clip.score || clip.smartScore || 85));
                const startTime = clip.startTime || clip.start || "00:00";
                const endTime = clip.endTime || clip.end || "00:30";
                const duration = clip.durationSec || clip.duration || 30;

                return (
                  <article
                    key={clip.id || clip.fileName || index}
                    className="group bg-white dark:bg-[#12141A] rounded-3xl overflow-hidden border border-slate-100 dark:border-white/10 shadow-lg hover:shadow-2xl transition-all duration-300 flex flex-col"
                  >
                    {/* Video Player Container */}
                    <div className="relative aspect-[9/16] bg-black overflow-hidden flex items-center justify-center">
                      {/* Score Badge */}
                      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-white shadow-lg">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-xs font-bold font-mono">{score}</span>
                      </div>

                      {/* Clip Number */}
                      <div className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white/90 text-xs font-bold">
                        #{String(index + 1).padStart(2, "0")}
                      </div>

                      {clipUrl ? (
                        <video
                          src={clipUrl}
                          poster={clip.thumbnail || videoMetadata.thumbnail}
                          controls
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">
                          Preview Unavailable
                        </div>
                      )}
                    </div>

                    {/* Clip Metadata Footer */}
                    <div className="p-4 flex-1 flex flex-col justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-gray-950 dark:text-white line-clamp-2 leading-snug">
                          {title}
                        </h3>
                        {clip.reason && (
                          <p className="text-[11px] text-cyan-600 dark:text-cyan-400 font-medium mt-1">
                            ✦ {clip.reason}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500 mt-2 font-mono">
                          <span>⏱ {startTime} - {endTime}</span>
                          <span>•</span>
                          <span>{duration}s</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-white/10">
                        {clipUrl ? (
                          <a
                            href={clipUrl}
                            download={clip.fileName || `clip-${index + 1}.mp4`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-95 text-white text-xs font-bold text-center transition-all shadow-md shadow-indigo-500/20"
                          >
                            Download Clip
                          </a>
                        ) : null}

                        <a
                          href={`/captions.html?index=${index}`}
                          className="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-gray-800 dark:text-gray-200 text-xs font-bold transition-all text-center"
                          title="Open Caption Studio"
                        >
                          Studio ↗
                        </a>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          /* ─── Clean Input Container Card ─── */
          <div className="bg-white dark:bg-[#12141A] rounded-3xl p-6 md:p-8 shadow-xl border border-gray-100 dark:border-white/10 max-w-2xl mx-auto transition-all">
            {/* Primary Input: Pill container with link icon, input field, and clear (X) button */}
            <div className="relative flex items-center bg-slate-50 dark:bg-[#1A1D24] border border-slate-200 dark:border-white/10 rounded-2xl px-4 py-3.5 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all shadow-inner">
              <span className="text-slate-400 text-lg mr-3">🔗</span>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleGenerateClick()}
                placeholder="Paste YouTube link here..."
                className="w-full bg-transparent text-slate-900 dark:text-white text-sm sm:text-base placeholder:text-slate-400 focus:outline-none"
              />
              {url && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="w-6 h-6 rounded-full bg-slate-200 dark:bg-white/15 hover:bg-slate-300 dark:hover:bg-white/25 text-slate-600 dark:text-gray-300 text-xs flex items-center justify-center transition-colors ml-2 shrink-0"
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
                className="flex items-center justify-center gap-2.5 px-4 py-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1A1D24] hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all hover:border-slate-300 shadow-sm"
              >
                <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span>Upload: Video file (MP4, MOV, etc.)</span>
              </button>

              <button
                type="button"
                className="flex items-center justify-center gap-2.5 px-4 py-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1A1D24] text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all shadow-sm opacity-60 cursor-not-allowed"
                disabled
              >
                <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="currentColor">
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
                  : "bg-slate-300 dark:bg-slate-700 cursor-not-allowed opacity-60"
              }`}
            >
              <span>✨ Generate Clips</span>
              <span>→</span>
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
