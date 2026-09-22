import React, { useState } from "react";

/**
 * Subcomponent: Interactive Step Progress Bar
 * 5 steps: Create Project, Add Media, Set Goals, Team, Launch
 * - Steps 1-3: Completed state with checkmark inside glowing dark/green nodes + gradient fill
 * - Step 4: Semi-active state with highlighted ring
 * - Step 5: Inactive state with a plus (+) icon
 */
export function ProgressBar({ currentStep = 4, onSelectStep = () => {} }) {
  const steps = [
    { id: 1, label: "Create Project" },
    { id: 2, label: "Add Media" },
    { id: 3, label: "Set Goals" },
    { id: 4, label: "Team" },
    { id: 5, label: "Launch" },
  ];

  return (
    <div className="w-full py-4">
      <div className="relative flex items-center justify-between">
        {/* Connecting Progress Track Line */}
        <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1.5 bg-slate-100 rounded-full z-0 overflow-hidden shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500 transition-all duration-500 ease-out rounded-full"
            style={{ width: `${Math.min(100, Math.max(0, ((currentStep - 1) / (steps.length - 1)) * 100))}%` }}
          />
        </div>

        {/* Step Nodes */}
        {steps.map((s) => {
          const isCompleted = s.id < currentStep;
          const isSemiActive = s.id === currentStep;
          const isInactive = s.id > currentStep;

          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelectStep(s.id)}
              className="relative z-10 flex flex-col items-center group cursor-pointer focus:outline-none"
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs transition-all duration-300 ${
                  isCompleted
                    ? "bg-emerald-500 text-white shadow-[0_0_14px_rgba(16,185,129,0.55)] scale-100"
                    : isSemiActive
                    ? "bg-white text-indigo-600 ring-4 ring-indigo-500/25 border-2 border-indigo-600 shadow-[0_4px_16px_rgba(99,102,241,0.35)] scale-110"
                    : "bg-slate-50 text-slate-400 border border-slate-200/80 shadow-sm hover:border-slate-300"
                }`}
              >
                {isCompleted ? (
                  <svg className="w-5 h-5 text-white stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : isSemiActive ? (
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse" />
                ) : (
                  <span className="text-base leading-none font-semibold text-slate-400">+</span>
                )}
              </div>
              <span
                className={`mt-2 text-[11px] md:text-xs font-semibold whitespace-nowrap transition-colors duration-200 ${
                  isCompleted
                    ? "text-emerald-700"
                    : isSemiActive
                    ? "text-indigo-950 font-bold"
                    : "text-slate-400"
                }`}
              >
                {s.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Subcomponent: White List Tile with explicitly sized YouTube thumbnail (200px x 150px)
 */
export function ListTile({
  title = "Viral Moments - Podcast Ep. 42",
  channel = "Creator Studio AI",
  thumbnail = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=80",
  targetAmount = "$25,000",
  onAmountChange = () => {},
}) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-100/80 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col md:flex-row items-center gap-5 transition-all">
      {/* Explicit YouTube Thumbnail: 200px by 150px */}
      <div
        className="relative shrink-0 rounded-xl overflow-hidden bg-slate-900 border border-slate-200/70 shadow-inner group"
        style={{ width: "200px", height: "150px" }}
      >
        <img
          src={thumbnail}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
        <span className="absolute top-2 left-2 bg-red-600/90 backdrop-blur-xs text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider shadow">
          YouTube
        </span>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-md text-red-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
            <svg className="w-5 h-5 fill-current ml-0.5" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Inputs & Metadata */}
      <div className="flex-1 w-full min-w-0 flex flex-col justify-between self-stretch py-1">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-bold text-slate-800 line-clamp-1">{title}</h4>
              <p className="text-xs text-slate-400 mt-0.5">{channel}</p>
            </div>
            <span className="shrink-0 text-emerald-600 bg-emerald-50 border border-emerald-200/60 text-[10px] font-bold px-2 py-0.5 rounded-full">
              Live Media
            </span>
          </div>

          {/* Goal Input Field */}
          <div className="mt-3">
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Target Allocation
            </label>
            <div className="relative rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2 flex items-center focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all">
              <span className="text-slate-400 font-bold text-xs mr-2">USD</span>
              <input
                type="text"
                defaultValue={targetAmount}
                onChange={(e) => onAmountChange(e.target.value)}
                className="w-full bg-transparent text-sm font-semibold text-slate-800 focus:outline-none"
                placeholder="e.g. $25,000"
              />
            </div>
          </div>
        </div>

        {/* Action footer */}
        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-400">
          <span className="text-[11px]">Auto-calculated split: 100%</span>
          <button type="button" className="text-indigo-600 hover:text-indigo-700 font-semibold text-[11px] transition-colors">
            Edit Details →
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Subcomponent: Floating Dropdown / Tooltip Box
 * Positioned above the progress bar with smooth accordion expansion.
 */
export function FundingGoalDropdown({ isOpen, onToggle, thumbnail, targetAmount, onAmountChange }) {
  return (
    <div className="w-full mb-6">
      {/* Container with neomorphic depth */}
      <div className="rounded-2xl bg-slate-50/80 border border-slate-200/80 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] overflow-hidden transition-all duration-300">
        {/* Accordion Trigger Header */}
        <button
          type="button"
          onClick={onToggle}
          className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-slate-100/60 transition-colors focus:outline-none"
        >
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200/60 flex items-center justify-center text-indigo-600 text-sm">
              🎯
            </div>
            <div>
              <span className="text-sm font-bold text-slate-800">Funding goal</span>
              <span className="ml-2 text-xs text-slate-400 font-medium">Campaign Target &amp; Assets</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 bg-white border border-slate-200 px-2.5 py-1 rounded-full shadow-xs">
              {targetAmount}
            </span>
            <svg
              className={`w-4 h-4 text-slate-500 transition-transform duration-300 ${isOpen ? "rotate-180" : "rotate-0"}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {/* Collapsible Content */}
        <div
          className={`grid transition-all duration-300 ease-in-out ${
            isOpen ? "grid-rows-[1fr] opacity-100 p-4 pt-0" : "grid-rows-[0fr] opacity-0 p-0"
          }`}
        >
          <div className="overflow-hidden">
            <ListTile
              thumbnail={thumbnail}
              targetAmount={targetAmount}
              onAmountChange={onAmountChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Subcomponent: Clip Generation & Cancel Button Row
 * On the exact same row. Cancel button appears with smooth fade/slide when isGenerating is true.
 */
export function ClipGenerationRow({
  isGenerating,
  onStartGeneration,
  onCancelGeneration,
}) {
  return (
    <div className="flex items-center gap-3 w-full mt-6">
      {/* Primary Trigger Button */}
      <button
        type="button"
        onClick={onStartGeneration}
        disabled={isGenerating}
        className={`flex-1 py-3.5 px-6 rounded-2xl font-bold text-sm text-white transition-all duration-300 flex items-center justify-center gap-2 shadow-lg ${
          isGenerating
            ? "bg-slate-400 cursor-not-allowed opacity-90 shadow-none"
            : "bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:opacity-95 hover:shadow-indigo-500/25 active:scale-[0.99] cursor-pointer"
        }`}
      >
        {isGenerating ? (
          <>
            <svg className="w-4 h-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span>Generating Clips...</span>
          </>
        ) : (
          <>
            <span>✨ Clip Generation</span>
            <span className="text-xs">→</span>
          </>
        )}
      </button>

      {/* Cancel Button - In exact same row, smooth animated slide & fade */}
      <div
        className={`transition-all duration-300 ease-out overflow-hidden flex items-center ${
          isGenerating
            ? "w-32 opacity-100 translate-x-0 ml-0 pointer-events-auto"
            : "w-0 opacity-0 translate-x-4 ml-0 pointer-events-none"
        }`}
      >
        <button
          type="button"
          onClick={onCancelGeneration}
          className="w-full py-3.5 px-4 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 border border-rose-200/80 font-bold text-xs tracking-wide transition-all shadow-sm active:scale-95 whitespace-nowrap flex items-center justify-center gap-1.5"
          title="Abort generation immediately"
        >
          <svg className="w-3.5 h-3.5 stroke-[2.5]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span>Cancel</span>
        </button>
      </div>
    </div>
  );
}

/**
 * Subcomponent: Compact Progress Card & Purple Accent Metrics
 * Strict small typography inside purple accents: text-xs or text-sm
 */
export function CompactProgressCard({ progress = 65, stage = "Analyzing viral moments..." }) {
  return (
    <div className="w-full mt-6 bg-slate-50/70 border border-slate-200/70 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-slate-700">Generation Status</span>
        <span className="text-xs font-mono font-bold text-indigo-600">{progress}%</span>
      </div>

      {/* Progress Track */}
      <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden shadow-inner">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Purple Accent Box Elements with small text sizing (text-xs / text-sm) */}
      <div className="grid grid-cols-2 gap-3 mt-3">
        <div className="rounded-xl bg-purple-50/90 border border-purple-200/60 p-2.5">
          <p className="text-xs font-bold text-purple-900 leading-tight">Stage Phase</p>
          <p className="text-[11px] text-purple-700 font-medium mt-0.5 truncate">{stage}</p>
        </div>
        <div className="rounded-xl bg-purple-50/90 border border-purple-200/60 p-2.5 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-purple-900 leading-tight">Clips Target</p>
            <p className="text-[11px] text-purple-700 font-medium mt-0.5">3-5 Vertical</p>
          </div>
          <span className="w-2 h-2 rounded-full bg-purple-500 animate-ping" />
        </div>
      </div>
    </div>
  );
}

/**
 * Subcomponent: Tip Footer
 * Pill-shaped tip banner: "Tip: Use round numbers to attract backers."
 */
export function TipFooter() {
  return (
    <div className="mt-8 pt-5 border-t border-slate-100 flex items-center justify-center">
      <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-slate-50 border border-slate-200/70 shadow-xs text-slate-600 text-xs font-medium">
        <div className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-[10px] leading-none shrink-0 border border-emerald-300/60">
          +
        </div>
        <span>
          <strong className="font-semibold text-slate-800">Tip:</strong> Use round numbers to attract backers.
        </span>
      </div>
    </div>
  );
}

/**
 * Main Component: NeomorphicCard
 * Clean white background, smooth rounded-3xl corners, subtle multi-layered drop shadows.
 */
export default function NeomorphicCard({
  onGenerate = () => {},
  onCancel = () => {},
  isGeneratingProp = false,
  generationProgress = 45,
  thumbnailProp = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=80",
}) {
  const [currentStep, setCurrentStep] = useState(4);
  const [dropdownOpen, setDropdownOpen] = useState(true);
  const [isGenerating, setIsGenerating] = useState(isGeneratingProp);
  const [targetAmount, setTargetAmount] = useState("$25,000");

  const handleStartGeneration = () => {
    setIsGenerating(true);
    onGenerate();
  };

  const handleCancelGeneration = () => {
    setIsGenerating(false);
    onCancel();
  };

  return (
    <div className="w-full max-w-2xl mx-auto my-6 p-2 md:p-4">
      {/* ─── Soft Neomorphic Base Card ─── */}
      <div className="relative bg-white rounded-3xl p-6 md:p-8 border border-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.03),inset_0_1px_1px_rgba(255,255,255,0.9)] transition-all">
        {/* Main Card Heading */}
        <div className="mb-6 text-left">
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">
            You're almost there!
          </h2>
          <p className="text-xs md:text-sm text-slate-500 mt-1 font-medium">
            Review your funding goal, inspect media assets, and trigger automatic clip generation.
          </p>
        </div>

        {/* 1. Floating Dropdown / Tooltip Box with 200px x 150px Thumbnail */}
        <FundingGoalDropdown
          isOpen={dropdownOpen}
          onToggle={() => setDropdownOpen((prev) => !prev)}
          thumbnail={thumbnailProp}
          targetAmount={targetAmount}
          onAmountChange={setTargetAmount}
        />

        {/* 2. Interactive Step Progress Bar */}
        <ProgressBar
          currentStep={currentStep}
          onSelectStep={setCurrentStep}
        />

        {/* 3. Compact Progress Card (Shown during generation or monitoring) */}
        {isGenerating && (
          <CompactProgressCard
            progress={generationProgress}
            stage="Finding viral hooks & extracting captions..."
          />
        )}

        {/* 4. Clip Generation & Cancel Button Row */}
        <ClipGenerationRow
          isGenerating={isGenerating}
          onStartGeneration={handleStartGeneration}
          onCancelGeneration={handleCancelGeneration}
        />

        {/* 5. Tip Footer */}
        <TipFooter />
      </div>
    </div>
  );
}
