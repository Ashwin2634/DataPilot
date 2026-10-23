import React from 'react';
import logoImg from '../assets/logo.png';
import GrokBot from './GrokBot';

const TopNavigation = ({
  jobId,
  status,
  onRunPipeline,
  isRunning,
  configuredCount,
  targetStage = 'cleaner',
  onTargetStageChange,
  botState = 'idle',
}) => {
  const getRunButtonText = () => {
    if (isRunning) return 'Processing...';
    if (targetStage === 'cleaner') return 'Run Cleaner';
    if (targetStage === 'validator') return 'Run up to Validator';
    if (targetStage === 'scraper') return 'Run up to Scraper';
    return 'Run Pipeline';
  };

  const getRunButtonIcon = () => {
    if (isRunning) return 'ph-bold ph-spinner animate-spin';
    if (targetStage === 'cleaner') return 'ph-duotone ph-broom';
    if (targetStage === 'validator') return 'ph-duotone ph-shield-check';
    if (targetStage === 'scraper') return 'ph-duotone ph-globe';
    return 'ph-bold ph-play';
  };

  return (
    <header className="relative h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-5 z-30 shrink-0 text-white select-none">
      {/* Left: Brand Logo & Styled DataPilot Name */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-800/90 border border-slate-700/80 p-1.5 shadow-sm shrink-0">
          <img src={logoImg} alt="DataPilot" className="w-full h-full object-contain" />
        </div>
        <div className="flex items-center text-xl font-bold tracking-tight">
          <span className="text-white">Data</span>
          <span className="text-[#38bdf8]">Pilot</span>
        </div>
      </div>

      {/* Center: Stage Selector & Run Pipeline Action Button */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3">
        {/* Step-by-Step Stage Target Selector */}
        <div className="flex items-center space-x-1.5 bg-slate-800/90 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs shadow-2xs">
          <span className="text-slate-400 text-[11px] font-medium flex items-center gap-1">
            <i className="ph-bold ph-git-commit text-indigo-400"></i> Target:
          </span>
          <select
            value={targetStage}
            onChange={(e) => onTargetStageChange?.(e.target.value)}
            disabled={isRunning}
            className="bg-transparent text-slate-100 text-xs font-semibold focus:outline-none cursor-pointer"
            title="Choose which pipeline stage to execute and inspect"
          >
            <option value="cleaner" className="bg-slate-800 text-white">1. Cleaner Only (Step 2)</option>
            <option value="validator" className="bg-slate-800 text-white">2. Up to Validation (Step 3)</option>
            <option value="scraper" className="bg-slate-800 text-white">3. Up to Scraper (Step 4)</option>
            <option value="all" className="bg-slate-800 text-white">⚡ All Pipelines (Full)</option>
          </select>
        </div>

        {/* Run Pipeline Action Button */}
        <button
          onClick={onRunPipeline}
          disabled={isRunning || configuredCount === 0}
          className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-all duration-200 border ${
            isRunning
              ? 'bg-slate-800/90 border-slate-700 text-indigo-300 opacity-90 cursor-wait'
              : configuredCount === 0
              ? 'bg-slate-800/80 border-slate-700/70 opacity-60 cursor-not-allowed text-slate-400'
              : targetStage === 'cleaner'
              ? 'bg-indigo-600 hover:bg-indigo-500 border-indigo-500 text-white shadow-indigo-600/20 active:bg-indigo-700'
              : 'bg-slate-800/90 hover:bg-slate-700/90 border-slate-700 hover:border-slate-600 text-slate-200 hover:text-white active:bg-slate-800'
          }`}
          title={configuredCount === 0 ? 'Upload at least one file to run' : `Run pipeline in ${targetStage} mode`}
        >
          <i className={`${getRunButtonIcon()} text-sm`}></i>
          <span>{getRunButtonText()}</span>
        </button>

        {/* Status / Idle Tag */}
        {jobId ? (
          <div className="flex items-center gap-1.5 text-xs text-slate-300 font-mono">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isRunning ? 'bg-indigo-400' : 'bg-emerald-400'} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isRunning ? 'bg-indigo-500' : 'bg-emerald-500'}`}></span>
            </span>
            <span className="text-slate-300">
              Run: <span className="text-indigo-300 font-medium">{jobId.substring(0, 8)}...</span>
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-slate-500"></span>
            <span>Idle</span>
          </div>
        )}
      </div>

      {/* Right: Pilot Companion & User Avatar */}
      <div className="flex items-center space-x-3">
        <div
          className="flex items-center gap-2 bg-slate-800/90 border border-slate-700/80 px-2.5 py-1 rounded-full text-xs shadow-2xs hover:bg-slate-800 transition-all cursor-pointer group"
          title={`Pilot is ${botState}`}
        >
          <GrokBot
            state={botState}
            size={22}
            color="#0b1120"
            eyeColor={
              botState === 'loading'
                ? '#38bdf8'
                : botState === 'thinking'
                ? '#a78bfa'
                : botState === 'excited' || botState === 'happy'
                ? '#34d399'
                : botState === 'curious'
                ? '#fbbf24'
                : '#94a3b8'
            }
            followCursor={true}
            label="Pilot"
          />
          <span className="text-slate-300 text-[11px] font-medium pr-1">
            Pilot is <span className="capitalize text-indigo-300 font-semibold">{botState}</span>
          </span>
        </div>

        <div
          className="w-7 h-7 rounded-full bg-slate-700 text-slate-200 border border-slate-600 flex items-center justify-center font-bold text-xs cursor-pointer hover:border-indigo-400 transition-colors"
          title="Alexander F. (Admin)"
        >
          AF
        </div>
      </div>
    </header>
  );
};

export default TopNavigation;
