import React, { useState, useRef } from 'react';
import WorkingFileModal from './WorkingFileModal';
import { downloadStageOutput } from '../services/api';
import GrokBot from './GrokBot';

const formatFileSize = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const WorkflowCanvas = ({
  jobId,
  status,
  progressMessage,
  files,
  onFileChange,
  onFileRemove,
  onDownload,
  activeLogs = [],
  jobData = null,
  botState = 'idle',
  targetStage = 'cleaner',
}) => {
  const [zoom, setZoom] = useState(100);
  const [showWorkerConsole, setShowWorkerConsole] = useState(false);
  const [dragOverKey, setDragOverKey] = useState(null);
  const [botClickReaction, setBotClickReaction] = useState(null);

  // Stage Working File Preview Modal State
  const [previewModal, setPreviewModal] = useState({
    isOpen: false,
    stageName: 'cleaner',
    fileName: '',
    rowCount: 0,
    colCount: 23,
  });

  const openPreview = (stageName, outputInfo) => {
    setPreviewModal({
      isOpen: true,
      stageName,
      fileName: outputInfo?.file_name || (jobId ? `${jobId.substring(0, 8)}_working_${stageName}.xlsx` : ''),
      rowCount: outputInfo?.row_count || 0,
      colCount: outputInfo?.col_count || 23,
    });
  };

  const closePreview = () => {
    setPreviewModal((prev) => ({ ...prev, isOpen: false }));
  };

  const cleanerOutput = jobData?.stage_outputs?.cleaner;
  const validatorOutput = jobData?.stage_outputs?.validator;
  const scraperOutput = jobData?.stage_outputs?.scraper;
  const exporterOutput = jobData?.stage_outputs?.exporter;

  const qcInputRef = useRef(null);
  const specsInputRef = useRef(null);
  const ulmInputRef = useRef(null);
  const lastWorkingInputRef = useRef(null);

  const uploadSlots = [
    {
      key: 'qc',
      title: 'Master QC Sheet',
      emptyLabel: 'Master Sheet',
      accept: '.xlsx,.xls,.csv',
      icon: 'ph-file-xls text-emerald-600',
      ref: qcInputRef,
    },
    {
      key: 'specs',
      title: 'Specs Master',
      emptyLabel: 'Specs File',
      accept: '.xlsx,.xls,.csv',
      icon: 'ph-database text-indigo-600',
      ref: specsInputRef,
    },
    {
      key: 'ulm',
      title: 'ULM File (Universal Listing Model)',
      emptyLabel: 'ULM File (Universal Listing Model)',
      accept: '.xlsx,.xls,.csv',
      icon: 'ph-tree-structure text-amber-600',
      ref: ulmInputRef,
    },
    {
      key: 'lastWorking',
      title: 'Last Working File',
      emptyLabel: 'Last Working File',
      accept: '.xlsx,.xls,.csv',
      icon: 'ph-clock-counter-clockwise text-purple-600',
      ref: lastWorkingInputRef,
    },
  ];

  const handleDrop = (e, key) => {
    e.preventDefault();
    setDragOverKey(null);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileChange?.(key, e.dataTransfer.files[0]);
    }
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 10, 150));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 10, 60));
  const handleZoomReset = () => setZoom(100);

  // Determine stage states
  const isPending = !status || status === 'pending';
  const isCleaning = status === 'cleaning';
  const isValidating = status === 'validating';
  const isScraping = status === 'scraping';
  const isCompleted = status === 'completed';
  const isFailed = status === 'failed';

  const effectiveTargetStage = (jobData?.target_stage || targetStage || 'all').toLowerCase().trim();

  const cleanerDone = Boolean(cleanerOutput);
  const validatorDone = Boolean(validatorOutput);
  const scraperDone = Boolean(scraperOutput);
  const exporterDone = Boolean(exporterOutput);

  const step1Done = Boolean(files.qc || files.specs || files.ulm || files.lastWorking || jobId);

  // Step 2 (Cleaner): Done if cleaner output exists, or if downstream stage is active/completed
  const step2Active = isCleaning;
  const step2Done = cleanerDone || isValidating || isScraping || validatorDone || scraperDone || exporterDone || (isCompleted && effectiveTargetStage === 'cleaner');

  // Step 3 (Validator): Done ONLY if validator actually produced output, or scraper/exporter active/completed
  const step3Active = isValidating;
  const step3Done = validatorDone || isScraping || scraperDone || exporterDone || (isCompleted && ['validator', 'validation'].includes(effectiveTargetStage) && validatorDone);

  // Step 4 (Scraper): Done ONLY if scraper actually produced output or exporter completed
  const step4Active = isScraping;
  const step4Done = scraperDone || exporterDone || (isCompleted && ['scraper', 'scraping'].includes(effectiveTargetStage) && scraperDone);

  // Step 5 (Exporter): Ready ONLY if exporter output exists or full pipeline completed
  const step5Ready = exporterDone || (isCompleted && (effectiveTargetStage === 'all' || effectiveTargetStage === 'exporter'));

  // Compute file name badges for Node 1
  const feedNames = [
    files.qc?.name || (jobId ? 'Master_QC_Sheet.xlsx' : null),
    files.specs?.name || (jobId ? 'Specs_Master_v4.csv' : null),
    files.ulm?.name,
    files.lastWorking?.name,
  ].filter(Boolean);

  const feedsLoadedCount = Math.max(
    feedNames.length,
    [files.qc, files.specs, files.ulm, files.lastWorking].filter(Boolean).length
  );

  const getPilotStatus = () => {
    if (status === 'cleaning') {
      return {
        botState: 'loading',
        eyeColor: '#38bdf8',
        badgeBg: 'bg-indigo-950/45 border-indigo-400/30 text-indigo-100 hover:bg-indigo-950/60',
        pillBg: 'bg-indigo-500/25 text-indigo-200 border-indigo-400/30 backdrop-blur-md',
        title: 'Cleaning Feeds...',
        desc: progressMessage || 'Normalizing rows, columns & barcode data',
      };
    }
    if (status === 'validating') {
      return {
        botState: 'thinking',
        eyeColor: '#a78bfa',
        badgeBg: 'bg-purple-950/45 border-purple-400/30 text-purple-100 hover:bg-purple-950/60',
        pillBg: 'bg-purple-500/25 text-purple-200 border-purple-400/30 backdrop-blur-md',
        title: 'Validating Specs...',
        desc: progressMessage || 'Cross-referencing attributes against Specs Master',
      };
    }
    if (status === 'scraping') {
      return {
        botState: 'loading',
        eyeColor: '#38bdf8',
        badgeBg: 'bg-sky-950/45 border-sky-400/30 text-sky-100 hover:bg-sky-950/60',
        pillBg: 'bg-sky-500/25 text-sky-200 border-sky-400/30 backdrop-blur-md',
        title: 'Playwright Scraping...',
        desc: progressMessage || 'Headless browser querying target domains',
      };
    }
    if (status === 'pending') {
      return {
        botState: 'thinking',
        eyeColor: '#fbbf24',
        badgeBg: 'bg-amber-950/45 border-amber-400/30 text-amber-100 hover:bg-amber-950/60',
        pillBg: 'bg-amber-500/25 text-amber-200 border-amber-400/30 backdrop-blur-md',
        title: 'Pipeline In Queue...',
        desc: progressMessage || 'Worker cluster initializing pipeline runtime',
      };
    }
    if (status === 'completed') {
      if (effectiveTargetStage === 'cleaner') {
        return {
          botState: 'excited',
          eyeColor: '#34d399',
          badgeBg: 'bg-emerald-950/45 border-emerald-400/30 text-emerald-100 hover:bg-emerald-950/60',
          pillBg: 'bg-emerald-500/25 text-emerald-200 border-emerald-400/30 backdrop-blur-md',
          title: 'Cleaner Pipeline Completed!',
          desc: cleanerOutput?.row_count
            ? `Cleaned ${cleanerOutput.row_count.toLocaleString()} rows into standard schema. Working file ready.`
            : 'Data cleaning completed. Cleaned working file ready.',
        };
      }
      if (['validator', 'validation'].includes(effectiveTargetStage)) {
        return {
          botState: 'excited',
          eyeColor: '#34d399',
          badgeBg: 'bg-emerald-950/45 border-emerald-400/30 text-emerald-100 hover:bg-emerald-950/60',
          pillBg: 'bg-emerald-500/25 text-emerald-200 border-emerald-400/30 backdrop-blur-md',
          title: 'Validation Completed!',
          desc: validatorOutput?.new_products_count !== undefined
            ? `Validated ${validatorOutput.row_count.toLocaleString()} rows (${validatorOutput.new_products_count} new products detected).`
            : 'Validation completed. Validated working file ready.',
        };
      }
      return {
        botState: 'excited',
        eyeColor: '#34d399',
        badgeBg: 'bg-emerald-950/45 border-emerald-400/30 text-emerald-100 hover:bg-emerald-950/60',
        pillBg: 'bg-emerald-500/25 text-emerald-200 border-emerald-400/30 backdrop-blur-md',
        title: 'Pipeline Completed!',
        desc: progressMessage || 'Processed dataset ready for export and download',
      };
    }
    if (status === 'failed') {
      return {
        botState: 'worried',
        eyeColor: '#f87171',
        badgeBg: 'bg-rose-950/45 border-rose-400/30 text-rose-100 hover:bg-rose-950/60',
        pillBg: 'bg-rose-500/25 text-rose-200 border-rose-400/30 backdrop-blur-md',
        title: 'Run Attention Needed',
        desc: progressMessage || 'Anomalies or run errors detected',
      };
    }
    return {
      botState: step1Done ? 'happy' : 'idle',
      eyeColor: '#38bdf8',
      badgeBg: 'bg-slate-900/45 border-white/20 text-slate-100 hover:bg-slate-900/55',
      pillBg: 'bg-white/10 text-white border-white/20 backdrop-blur-md',
      title: step1Done ? 'Feeds Configured' : 'Playwright Engine Ready',
      desc: step1Done ? 'Ready to execute. Click "Run Pipeline"' : 'Standing by for source feeds',
    };
  };

  const pilot = getPilotStatus();
  const activeBotState = botClickReaction || botState || pilot.botState;

  const getStatusBadge = () => {
    return (
      <div
        onClick={() => {
          setBotClickReaction((prev) => (prev === 'excited' ? 'happy' : 'excited'));
          setTimeout(() => setBotClickReaction(null), 2500);
        }}
        className={`pointer-events-auto relative overflow-hidden flex items-center gap-3.5 px-4 py-2.5 rounded-2xl border shadow-[0_12px_36px_rgba(0,0,0,0.22)] backdrop-blur-xl transition-all duration-300 cursor-pointer group hover:border-indigo-400/50 hover:shadow-[0_16px_44px_rgba(99,102,241,0.25)] hover:-translate-y-0.5 ${pilot.badgeBg}`}
        title={`Pilot is ${activeBotState}. Click to interact!`}
      >
        {/* Subtle glass reflection sheen */}
        <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent pointer-events-none rounded-t-2xl" />

        <div className="relative z-10 shrink-0">
          <GrokBot
            state={activeBotState}
            size={40}
            followCursor={true}
            className="group-hover:scale-110 transition-transform"
            label="Pilot Pipeline Sentinel"
          />
        </div>
        <div className="flex flex-col text-left relative z-10">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white tracking-tight drop-shadow-xs">Pilot</span>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase tracking-wider font-semibold ${pilot.pillBg}`}>
              {activeBotState}
            </span>
          </div>
          <span className="text-[11px] font-semibold text-slate-100 max-w-[220px] truncate leading-tight mt-0.5 drop-shadow-2xs">
            {pilot.title}
          </span>
          <span className="text-[10px] text-slate-300 max-w-[220px] truncate mt-0.5">
            {pilot.desc}
          </span>
        </div>
      </div>
    );
  };

  return (
    <main className="flex-1 flex flex-col relative overflow-hidden bg-slate-100 canvas-grid select-none">
      {/* Canvas Toolbar Overlay (Top Floating Bar) */}
      <div className="absolute top-4 left-6 right-6 z-10 flex items-start justify-between pointer-events-none">
        {/* Breadcrumbs & Step Indicator Overlay */}
        <div className="pointer-events-auto bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-200/80 shadow-sm flex items-center space-x-3 mt-1">
          <div className="flex items-center space-x-2 text-xs font-medium text-slate-600">
            <span className="flex items-center gap-1 font-semibold text-slate-900">
              <i className="ph-bold ph-git-fork text-indigo-600"></i> Pipeline Architecture
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-500">
              Execution Mode: <span className="text-slate-800 font-semibold">Strict QC + Crawler</span>
            </span>
          </div>
        </div>

        {/* Right Corner: Canvas Zoom Controls */}
        <div className="pointer-events-auto flex items-center space-x-1 bg-white/95 backdrop-blur-md px-2 py-1.5 rounded-xl border border-slate-200/80 shadow-sm text-slate-600 mt-1">
          <button
            onClick={handleZoomIn}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 transition-colors"
            title="Zoom In"
          >
            <i className="ph-bold ph-plus text-xs"></i>
          </button>
          <span className="text-[11px] font-mono px-1 font-medium">{zoom}%</span>
          <button
            onClick={handleZoomOut}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 transition-colors"
            title="Zoom Out"
          >
            <i className="ph-bold ph-minus text-xs"></i>
          </button>
          <div className="h-3.5 w-px bg-slate-200 mx-1"></div>
          <button
            onClick={handleZoomReset}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 transition-colors"
            title="Recenter Graph"
          >
            <i className="ph-bold ph-arrows-out text-xs"></i>
          </button>
        </div>
      </div>

      {/* Graph Container (Center Interactive Area) */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar py-20 px-4 md:px-12 flex flex-col items-center">
        <div
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
          className="transition-transform duration-200 w-full flex flex-col items-center"
        >
          {/* ================= PIPELINE NODES WITH CONNECTORS ================= */}

          {/* NODE 1: TRIGGER / INGESTION */}
          <div className="w-full max-w-xl relative group">
            {/* Step Pill Badge */}
            <div className="flex justify-center -mb-3.5 relative z-10">
              <span className="bg-indigo-600 text-white font-mono text-[10px] tracking-wider uppercase font-semibold px-3 py-0.5 rounded-full shadow-sm flex items-center gap-1">
                <i className="ph-bold ph-arrow-fat-lines-down"></i> Trigger
              </span>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 hover:border-indigo-300 shadow-card pt-7 px-6 pb-6 transition-all">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3.5">
                  <div className="w-11 h-11 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs shrink-0">
                    <i className="ph-duotone ph-folder-notch-open text-2xl"></i>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900">1. Ingest Data Sources</h3>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${feedsLoadedCount > 0
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-50 text-slate-500 border-slate-200'
                          }`}
                      >
                        <i className={`ph-bold ${feedsLoadedCount > 0 ? 'ph-check text-emerald-600' : 'ph-clock'} text-[10px] mr-1`}></i>
                        {feedsLoadedCount > 0 ? `${feedsLoadedCount} Feeds Loaded` : 'Awaiting Feeds'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      QC Spreadsheet, Specs Master, ULM Hierarchies &amp; Last Working File
                    </p>
                  </div>
                </div>
                <button className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100 transition-colors">
                  <i className="ph-bold ph-dots-three-vertical text-base"></i>
                </button>
              </div>

              {/* Nested Data Meta Pill list with Direct Upload & Drag-and-Drop */}
              <div className="mt-4 pt-3.5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {uploadSlots.map((slot) => {
                  const currentFile = files?.[slot.key];
                  const isFallbackPastRun = !currentFile && jobId && (
                    slot.key === 'qc' ? 'Master_QC_Dump.xlsx' : slot.key === 'specs' ? 'Specs_Master_Standard.csv' : null
                  );
                  const isDragActive = dragOverKey === slot.key;

                  return (
                    <div key={slot.key} className="relative">
                      <input
                        ref={slot.ref}
                        type="file"
                        accept={slot.accept}
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            onFileChange?.(slot.key, e.target.files[0]);
                          }
                        }}
                      />

                      {currentFile ? (
                        <div
                          onClick={() => slot.ref.current?.click()}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragOverKey(slot.key);
                          }}
                          onDragLeave={() => setDragOverKey(null)}
                          onDrop={(e) => handleDrop(e, slot.key)}
                          className={`flex items-center justify-between space-x-2 px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer group shadow-2xs ${isDragActive
                            ? 'border-indigo-500 bg-indigo-50/70 ring-2 ring-indigo-200'
                            : 'bg-emerald-50/60 border-emerald-300/80 hover:bg-emerald-50 hover:border-emerald-400'
                            }`}
                          title={`Uploaded: ${currentFile.name} (${formatFileSize(currentFile.size)}). Click to replace.`}
                        >
                          <div className="flex items-center space-x-2 truncate min-w-0 pr-1">
                            <i className={`ph-bold ${slot.icon} shrink-0 text-sm`}></i>
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="truncate text-emerald-950 font-mono text-[11px] font-semibold">
                                {currentFile.name}
                              </span>
                              <span className="text-[10px] text-emerald-700/80 font-mono shrink-0 hidden sm:inline">
                                ({formatFileSize(currentFile.size)})
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <i className="ph-bold ph-check text-emerald-600 text-xs"></i>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onFileRemove?.(slot.key);
                                if (slot.ref.current) slot.ref.current.value = '';
                              }}
                              className="text-slate-400 hover:text-red-500 p-0.5 rounded hover:bg-white/80 transition-colors"
                              title="Remove file"
                            >
                              <i className="ph-bold ph-x text-xs"></i>
                            </button>
                          </div>
                        </div>
                      ) : isFallbackPastRun ? (
                        <div
                          onClick={() => slot.ref.current?.click()}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragOverKey(slot.key);
                          }}
                          onDragLeave={() => setDragOverKey(null)}
                          onDrop={(e) => handleDrop(e, slot.key)}
                          className="flex items-center justify-between space-x-2 bg-slate-50 hover:bg-slate-100/90 hover:border-indigo-300 px-2.5 py-1.5 rounded-lg border border-slate-200/80 transition-all cursor-pointer group"
                          title="From active run. Click to upload replacement file."
                        >
                          <div className="flex items-center space-x-2 truncate min-w-0 pr-1">
                            <i className={`ph-bold ${slot.icon} shrink-0 text-sm`}></i>
                            <span className="truncate text-slate-800 font-mono text-[11px]">
                              {isFallbackPastRun}
                            </span>
                          </div>
                          <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded border border-indigo-100 font-mono shrink-0">
                            Job
                          </span>
                        </div>
                      ) : (
                        <div
                          onClick={() => slot.ref.current?.click()}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragOverKey(slot.key);
                          }}
                          onDragLeave={() => setDragOverKey(null)}
                          onDrop={(e) => handleDrop(e, slot.key)}
                          className={`flex items-center justify-between space-x-2 px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer group ${isDragActive
                            ? 'border-indigo-500 bg-indigo-50/70 ring-2 ring-indigo-200'
                            : 'bg-slate-50 hover:bg-slate-100/90 hover:border-indigo-300 border-slate-200/80'
                            }`}
                          title={`Click or drag & drop to upload ${slot.title}`}
                        >
                          <div className="flex items-center space-x-2 truncate min-w-0 pr-1">
                            <i className={`ph-bold ${slot.icon} shrink-0 text-sm`}></i>
                            <span className="truncate text-slate-600 font-mono text-[11px] group-hover:text-slate-900 transition-colors">
                              {slot.emptyLabel}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 group-hover:text-indigo-600 font-medium shrink-0 flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-all">
                            <i className="ph-bold ph-upload-simple"></i>
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* CONNECTOR 1 */}
          <div className="h-14 flex flex-col items-center justify-center relative">
            <div className={`w-0.5 h-full ${step1Done ? 'bg-indigo-400' : 'bg-slate-300'}`}></div>
            <div className={`w-2.5 h-2.5 rounded-full border-2 border-slate-400 ${step1Done ? 'bg-indigo-600' : 'bg-white'} absolute top-1/2 -translate-y-1/2`}></div>
          </div>

          {/* NODE 2: CLEANING & NORMALIZATION */}
          <div className="w-full max-w-xl relative group">
            <div className="flex justify-center -mb-3.5 relative z-10">
              <span
                className={`text-white font-mono text-[10px] tracking-wider uppercase font-semibold px-3 py-0.5 rounded-full shadow-sm flex items-center gap-1 ${step2Done
                  ? 'bg-emerald-600'
                  : step2Active
                    ? 'bg-indigo-600 animate-pulse'
                    : 'bg-slate-500'
                  }`}
              >
                <i className={`ph-bold ${step2Done ? 'ph-check' : step2Active ? 'ph-arrows-clockwise animate-spin' : 'ph-clock'}`}></i>
                Step 2 • {step2Done ? 'Completed' : step2Active ? 'In Progress' : 'Pending'}
              </span>
            </div>
            <div
              className={`bg-white rounded-lg border shadow-card pt-7 px-6 pb-6 transition-all ${step2Active
                ? 'border-2 border-indigo-500 ring-2 ring-indigo-100'
                : 'border-slate-200 hover:border-slate-300'
                }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3.5">
                  <div
                    className={`w-11 h-11 rounded-lg flex items-center justify-center shadow-xs shrink-0 ${step2Done
                      ? 'bg-emerald-50 border border-emerald-100 text-emerald-600'
                      : step2Active
                        ? 'bg-indigo-50 border border-indigo-100 text-indigo-600'
                        : 'bg-slate-100 border border-slate-200 text-slate-500'
                      }`}
                  >
                    <i className="ph-duotone ph-broom text-2xl"></i>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900">2. Clean &amp; Normalize Attributes</h3>
                      {step2Done && (
                        <span className="text-emerald-700 bg-emerald-50 text-[10px] font-mono px-2 py-0.5 rounded border border-emerald-200">
                          1.2s
                        </span>
                      )}
                      {step2Active && (
                        <span className="text-indigo-700 bg-indigo-50 text-[10px] font-mono px-2 py-0.5 rounded border border-indigo-200 animate-pulse">
                          Running
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Strip trailing whitespaces, regex unicode correction, casing alignment</p>
                  </div>
                </div>
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${step2Done
                    ? 'bg-emerald-100 text-emerald-700'
                    : step2Active
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-slate-100 text-slate-400'
                    }`}
                >
                  <i className={`ph-bold ${step2Done ? 'ph-check' : step2Active ? 'ph-spinner animate-spin' : 'ph-clock'}`}></i>
                </div>
              </div>
              {/* Stats Bar */}
              <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                <span className="flex items-center gap-1.5">
                  <i className={`ph-fill ${step2Done ? 'ph-check-circle text-emerald-500' : 'ph-circle text-slate-300'}`}></i>
                  {cleanerOutput
                    ? `${cleanerOutput.row_count.toLocaleString()} rows mapped to standard schema`
                    : step2Done
                      ? 'Data cleaned & normalized'
                      : step2Active
                        ? 'Cleaning rows...'
                        : 'Awaiting previous step'}
                </span>
                <span className="text-slate-400">
                  {cleanerOutput ? `${cleanerOutput.col_count} columns` : 'Standard Schema'}
                </span>
              </div>

              {/* Working File Action Card */}
              {(cleanerOutput || (step2Done && jobId && effectiveTargetStage === 'cleaner')) && (
                <div className="mt-4 p-3 bg-emerald-50/70 border border-emerald-200/90 rounded-lg space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 truncate min-w-0 pr-2">
                      <i className="ph-bold ph-file-xls text-emerald-600 text-base shrink-0"></i>
                      <span className="font-mono font-semibold text-slate-800 truncate" title={cleanerOutput?.file_name}>
                        {cleanerOutput?.file_name || (jobId ? `${jobId.substring(0, 8)}_working_cleaned.xlsx` : 'working_cleaned.xlsx')}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 shrink-0 font-medium">
                      {cleanerOutput?.row_count ? `${cleanerOutput.row_count.toLocaleString()} rows` : 'Ready'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => openPreview('cleaner', cleanerOutput)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white hover:bg-indigo-50/70 active:bg-indigo-100 text-indigo-700 border border-indigo-200/90 rounded-lg text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                    >
                      <i className="ph-bold ph-eye text-sm"></i>
                      <span>View Full</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadStageOutput(jobId, 'cleaner', 'xlsx')}
                      className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                      title="Download Cleaned Excel"
                    >
                      <i className="ph-bold ph-file-xls text-sm"></i>
                      <span>.XLSX</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadStageOutput(jobId, 'cleaner', 'csv')}
                      className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                      title="Download Cleaned CSV"
                    >
                      <i className="ph-bold ph-file-csv text-sm"></i>
                      <span>.CSV</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* CONNECTOR 2 */}
          <div className="h-14 flex flex-col items-center justify-center relative">
            <div className={`w-0.5 h-full ${step2Done ? 'bg-emerald-400' : step2Active ? 'bg-indigo-400' : 'bg-slate-300'}`}></div>
            <div className={`w-2.5 h-2.5 rounded-full border-2 border-slate-400 ${step2Done ? 'bg-emerald-500' : 'bg-white'} absolute top-1/2 -translate-y-1/2`}></div>
          </div>

          {/* NODE 3: SCHEMA & SPECS VALIDATION */}
          <div className="w-full max-w-xl relative group">
            <div className="flex justify-center -mb-3.5 relative z-10">
              <span
                className={`text-white font-mono text-[10px] tracking-wider uppercase font-semibold px-3 py-0.5 rounded-full shadow-sm flex items-center gap-1 ${step3Done
                  ? 'bg-emerald-600'
                  : step3Active
                    ? 'bg-indigo-600 animate-pulse'
                    : 'bg-slate-500'
                  }`}
              >
                <i className={`ph-bold ${step3Done ? 'ph-check' : step3Active ? 'ph-arrows-clockwise animate-spin' : 'ph-clock'}`}></i>
                Step 3 • {step3Done ? 'Completed' : step3Active ? 'In Progress' : 'Standby'}
              </span>
            </div>
            <div
              className={`bg-white rounded-lg border shadow-card pt-7 px-6 pb-6 transition-all ${step3Active
                ? 'border-2 border-indigo-500 ring-2 ring-indigo-100'
                : 'border-slate-200 hover:border-slate-300'
                }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3.5">
                  <div
                    className={`w-11 h-11 rounded-lg flex items-center justify-center shadow-xs shrink-0 ${step3Done
                      ? 'bg-emerald-50 border border-emerald-100 text-emerald-600'
                      : step3Active
                        ? 'bg-indigo-50 border border-indigo-100 text-indigo-600'
                        : 'bg-slate-100 border border-slate-200 text-slate-500'
                      }`}
                  >
                    <i className="ph-duotone ph-shield-check text-2xl"></i>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900">3. Specs &amp; Schema Validation</h3>
                      {step3Done && (
                        <span className="text-emerald-700 bg-emerald-50 text-[10px] font-mono px-2 py-0.5 rounded border border-emerald-200">
                          0.8s
                        </span>
                      )}
                      {step3Active && (
                        <span className="text-indigo-700 bg-indigo-50 text-[10px] font-mono px-2 py-0.5 rounded border border-indigo-200 animate-pulse">
                          Verifying
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Evaluated required mandatory keys against master dictionary</p>
                  </div>
                </div>
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${step3Done
                    ? 'bg-emerald-100 text-emerald-700'
                    : step3Active
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-slate-100 text-slate-400'
                    }`}
                >
                  <i className={`ph-bold ${step3Done ? 'ph-check' : step3Active ? 'ph-spinner animate-spin' : 'ph-clock'}`}></i>
                </div>
              </div>
              {/* Stats Bar */}
              <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                <span className="flex items-center gap-1.5">
                  <i className={`ph-fill ${step3Done ? 'ph-check-circle text-emerald-500' : 'ph-circle text-slate-300'}`}></i>
                  {validatorOutput
                    ? `${validatorOutput.new_products_count ?? 0} new products, ${validatorOutput.existing_products_count ?? 0} existing`
                    : step3Done
                      ? 'Schema conformity & validation complete'
                      : step3Active
                        ? 'Comparing headers & types...'
                        : 'Awaiting validation run'}
                </span>
                <span className="text-slate-400">
                  {validatorOutput?.new_products_count !== undefined ? `${validatorOutput.new_products_count} to scrape` : 'Standby'}
                </span>
              </div>

              {/* Working File Action Card */}
              {validatorOutput && (
                <div className="mt-4 p-3 bg-indigo-50/70 border border-indigo-200/90 rounded-lg space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 truncate min-w-0 pr-2">
                      <i className="ph-bold ph-file-xls text-indigo-600 text-base shrink-0"></i>
                      <span className="font-mono font-semibold text-slate-800 truncate" title={validatorOutput?.file_name}>
                        {validatorOutput?.file_name || (jobId ? `${jobId.substring(0, 8)}_working_validated.xlsx` : 'working_validated.xlsx')}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-indigo-800 bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200 shrink-0 font-medium">
                      {validatorOutput?.row_count ? `${validatorOutput.row_count.toLocaleString()} rows` : 'Validated'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => openPreview('validator', validatorOutput)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white hover:bg-indigo-50/70 active:bg-indigo-100 text-indigo-700 border border-indigo-200/90 rounded-lg text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                    >
                      <i className="ph-bold ph-eye text-sm"></i>
                      <span>View Full</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadStageOutput(jobId, 'validator', 'xlsx')}
                      className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                      title="Download Validated Excel"
                    >
                      <i className="ph-bold ph-file-xls text-sm"></i>
                      <span>.XLSX</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadStageOutput(jobId, 'validator', 'csv')}
                      className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                      title="Download Validated CSV"
                    >
                      <i className="ph-bold ph-file-csv text-sm"></i>
                      <span>.CSV</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* CONNECTOR 3 (Active Pulsing Line when Step 4 active) */}
          <div className="h-16 flex flex-col items-center justify-center relative">
            <div
              className={`w-1 h-full rounded-full transition-all ${step3Done ? 'bg-emerald-400' : step4Active ? 'bg-indigo-500 shadow-sm' : 'bg-slate-300'
                }`}
            ></div>
            <div
              className={`w-3.5 h-3.5 rounded-full absolute top-1/2 -translate-y-1/2 ${step4Active
                ? 'bg-indigo-600 ring-4 ring-indigo-100 animate-bounce'
                : step3Done
                  ? 'bg-emerald-500'
                  : 'bg-white border-2 border-slate-300'
                }`}
            ></div>
          </div>

          {/* NODE 4: PLAYWRIGHT SCRAPER */}
          <div className={`w-full max-w-xl relative group ${step4Active ? 'active-node-glow' : ''}`}>
            {/* Step Pill Badge */}
            <div className="flex justify-center -mb-3.5 relative z-10">
              <span
                className={`text-white font-mono text-[10px] tracking-wider uppercase font-semibold px-3 py-0.5 rounded-full shadow-md flex items-center gap-1.5 ${step4Done
                  ? 'bg-emerald-600 shadow-emerald-500/20'
                  : step4Active
                    ? 'bg-indigo-600 shadow-indigo-500/30'
                    : 'bg-slate-700'
                  }`}
              >
                {step4Active && <span className="w-2 h-2 rounded-full bg-indigo-200 animate-ping"></span>}
                Step 4 • {step4Done ? 'Completed' : step4Active ? 'In Progress' : 'Standby'}
              </span>
            </div>
            <div
              className={`bg-white rounded-lg pt-7 px-6 pb-6 relative transition-all ${step4Active
                ? 'border-2 border-indigo-500 shadow-node-active'
                : 'border border-slate-200 hover:border-slate-300 shadow-card'
                }`}
            >
              {/* Active Node Top Content */}
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3.5">
                  <div
                    className={`w-12 h-12 rounded-lg flex items-center justify-center shadow-md shrink-0 ${step4Done
                      ? 'bg-emerald-600 text-white shadow-emerald-500/20'
                      : step4Active
                        ? 'bg-indigo-600 text-white shadow-indigo-500/30'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}
                  >
                    <i className="ph-duotone ph-spider text-2xl"></i>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900">4. Playwright Headless Web Scraper</h3>
                      {step4Active && (
                        <span className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-indigo-200">
                          Scraping Active
                        </span>
                      )}
                      {step4Done && (
                        <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-emerald-200">
                          Scrape Completed
                        </span>
                      )}
                      {!step4Active && !step4Done && (
                        <span className="bg-slate-100 text-slate-500 text-[10px] font-medium px-2 py-0.5 rounded-md border border-slate-200">
                          Standby
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-1 font-normal">
                      Scraping new product pages with Playwright headless clusters...
                    </p>
                  </div>
                </div>
                {/* Worker Pill */}
                <span className="text-[11px] font-mono text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100 flex items-center gap-1 shrink-0">
                  <i className="ph-bold ph-cpu"></i> {step4Active ? '4 Workers Active' : step4Done ? '4 Workers Complete' : '4 Workers Standby'}
                </span>
              </div>

              {/* Progress Indicator Bar */}
              <div className="mt-5 bg-slate-50 p-4 rounded-lg border border-slate-100 space-y-2.5">
                <div className="flex justify-between items-center text-xs font-medium">
                  <span className="text-slate-700 flex items-center gap-1.5 font-mono">
                    {step4Active ? (
                      <>
                        <i className="ph-bold ph-arrows-clockwise text-indigo-600 animate-spin"></i>
                        Processing URL batch 68 of 100
                      </>
                    ) : step4Done ? (
                      <>
                        <i className="ph-bold ph-check text-emerald-600"></i>
                        {scraperOutput?.row_count ? `All ${scraperOutput.row_count} URLs scraped & verified` : 'All URL batches scraped & verified'}
                      </>
                    ) : (
                      'Waiting for scraper trigger...'
                    )}
                  </span>
                  <span className="font-mono text-indigo-600 font-bold">
                    {step4Done ? '100%' : step4Active ? '68%' : '0%'}
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${step4Done ? 'bg-emerald-500' : 'bg-indigo-600'
                      }`}
                    style={{ width: step4Done ? '100%' : step4Active ? '68%' : '0%' }}
                  ></div>
                </div>
                <div className="flex justify-between items-center text-[11px] text-slate-400 font-mono">
                  <span>Speed: {step4Done ? 'Finished' : step4Active ? '~42 pages/min' : '—'}</span>
                  <span>ETA: {step4Done ? '0s' : step4Active ? '48 seconds remaining' : '—'}</span>
                </div>
              </div>

              {/* Dedicated Dropdown Button to Toggle Playwright Worker Console */}
              <button
                type="button"
                onClick={() => setShowWorkerConsole((prev) => !prev)}
                className="mt-4 w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 active:bg-slate-200/80 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 transition-all cursor-pointer shadow-2xs"
              >
                <span className="flex items-center gap-2">
                  <i className="ph-bold ph-terminal text-indigo-600 text-sm"></i>
                  <span className="font-semibold text-slate-800">Playwright Worker Console</span>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${step4Active
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200 font-bold'
                      : step4Done
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                  >
                    {step4Active ? 'Thread #2 Active' : step4Done ? 'Complete' : 'Standby'}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                  <span>{showWorkerConsole ? 'Hide Console' : 'Show Console'}</span>
                  <i className={`ph-bold ${showWorkerConsole ? 'ph-caret-up' : 'ph-caret-down'} text-xs text-slate-600`}></i>
                </span>
              </button>

              {/* Collapsible live micro-terminal inside node */}
              {showWorkerConsole && (
                <div className="mt-3 bg-slate-900 rounded-xl p-3 font-mono text-[11px] text-slate-300 space-y-1.5 shadow-inner border border-slate-800 transition-all">
                  <div className="text-slate-400 flex items-center justify-between text-[10px] pb-1.5 border-b border-slate-800">
                    <span className="flex items-center gap-1.5">
                      <i className="ph-bold ph-terminal-window text-indigo-400"></i>
                      PLAYWRIGHT WORKER CONSOLE
                    </span>
                    <span className={step4Active ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                      {step4Active ? 'THREAD #2 ACTIVE' : step4Done ? 'ALL THREADS COMPLETED' : 'IDLE'}
                    </span>
                  </div>
                  <p className="truncate text-indigo-300">
                    {step4Active || step4Done
                      ? '> [200 OK] GET https://supplier.internal/item/SKU-GH-09283'
                      : '> Worker engine standing by.'}
                  </p>
                  <p className="truncate text-emerald-400">
                    {step4Active || step4Done
                      ? '> Extracted: { burst_pressure: "500 PSI", material: "Hybrid Polymer" }'
                      : '> Awaiting active job trigger.'}
                  </p>
                </div>
              )}

              {/* Working File Action Card */}
              {scraperOutput && (
                <div className="mt-4 p-3 bg-indigo-50/70 border border-indigo-200/90 rounded-lg space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 truncate min-w-0 pr-2">
                      <i className="ph-bold ph-file-xls text-indigo-600 text-base shrink-0"></i>
                      <span className="font-mono font-semibold text-slate-800 truncate" title={scraperOutput?.file_name}>
                        {scraperOutput?.file_name || (jobId ? `${jobId.substring(0, 8)}_working_scraped.xlsx` : 'working_scraped.xlsx')}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-indigo-800 bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200 shrink-0 font-medium">
                      {scraperOutput?.row_count ? `${scraperOutput.row_count.toLocaleString()} rows` : 'Scraped'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => openPreview('scraper', scraperOutput)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white hover:bg-indigo-50/70 active:bg-indigo-100 text-indigo-700 border border-indigo-200/90 rounded-lg text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                    >
                      <i className="ph-bold ph-eye text-sm"></i>
                      <span>View Full</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadStageOutput(jobId, 'scraper', 'xlsx')}
                      className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                      title="Download Scraped Excel"
                    >
                      <i className="ph-bold ph-file-xls text-sm"></i>
                      <span>.XLSX</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadStageOutput(jobId, 'scraper', 'csv')}
                      className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                      title="Download Scraped CSV"
                    >
                      <i className="ph-bold ph-file-csv text-sm"></i>
                      <span>.CSV</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* CONNECTOR 4 */}
          <div className="h-14 flex flex-col items-center justify-center relative">
            <div className={`w-0.5 h-full ${step4Done ? 'bg-emerald-400' : 'bg-slate-300'}`}></div>
            <div className={`w-2.5 h-2.5 rounded-full border-2 border-slate-400 ${step4Done ? 'bg-emerald-500' : 'bg-white'} absolute top-1/2 -translate-y-1/2`}></div>
          </div>

          {/* NODE 5: QC OUTPUT & EXPORT */}
          <div className="w-full max-w-xl relative group mb-16">
            {/* Step Pill Badge */}
            <div className="flex justify-center -mb-3.5 relative z-10">
              <span
                className={`font-mono text-[10px] tracking-wider uppercase font-semibold px-3 py-0.5 rounded-full shadow-sm flex items-center gap-1 ${step5Ready ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-white'
                  }`}
              >
                <i className="ph-bold ph-download-simple"></i> Step 5 • {step5Ready ? 'Ready for Download' : 'Standby'}
              </span>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 hover:border-slate-300 shadow-card pt-7 px-6 pb-6 transition-all">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3.5">
                  <div
                    className={`w-11 h-11 rounded-lg flex items-center justify-center shadow-xs shrink-0 ${step5Ready
                      ? 'bg-emerald-50 border border-emerald-100 text-emerald-600'
                      : 'bg-slate-100 border border-slate-200 text-slate-700'
                      }`}
                  >
                    <i className="ph-duotone ph-file-arrow-down text-2xl"></i>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900">5. Final QC Master Dataset</h3>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded ${step5Ready ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                          }`}
                      >
                        {step5Ready ? 'Ready for Download' : 'Available on full run'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Automated merged output enriched with newly scraped technical parameters
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons: View Full & Download */}
              <div className="mt-5 pt-5 border-t border-slate-100 space-y-3">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => openPreview('exporter', exporterOutput)}
                    disabled={!step5Ready || !exporterOutput}
                    className={`flex-1 flex items-center justify-center space-x-1.5 py-3 px-4 rounded-xl text-xs font-semibold transition-all ${step5Ready && exporterOutput
                      ? 'bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-200 shadow-sm cursor-pointer'
                      : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                      }`}
                  >
                    <i className="ph-bold ph-eye text-base"></i>
                    <span>View Full Data</span>
                  </button>

                  <div className="flex-1 flex items-center gap-1.5">
                    <button
                      onClick={() => onDownload?.('xlsx')}
                      disabled={!step5Ready || !exporterOutput}
                      className={`flex-1 flex items-center justify-center space-x-1.5 py-3 px-3 rounded-xl text-xs font-semibold transition-all ${step5Ready && exporterOutput
                        ? 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white shadow-md shadow-emerald-700/20 cursor-pointer'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        }`}
                      title="Download Final Master Excel"
                    >
                      <i className="ph-bold ph-download-simple text-base"></i>
                      <span>.XLSX</span>
                    </button>
                    <button
                      onClick={() => onDownload?.('csv')}
                      disabled={!step5Ready || !exporterOutput}
                      className={`flex-1 flex items-center justify-center space-x-1.5 py-3 px-3 rounded-xl text-xs font-semibold transition-all ${step5Ready && exporterOutput
                        ? 'bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white shadow-md cursor-pointer'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        }`}
                      title="Download Final Master CSV"
                    >
                      <i className="ph-bold ph-file-csv text-base"></i>
                      <span>.CSV</span>
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
                  <span>Format: Microsoft Excel (.xlsx) &amp; CSV (.csv)</span>
                  <span className="text-slate-400 font-mono text-[10px]">
                    {exporterOutput?.file_name || (step5Ready ? 'Ready for export' : 'Generated on full run')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Bottom Sentinel Card (Glassmorphic Pilot Companion) */}
      <div className="absolute bottom-5 right-6 z-20 pointer-events-none">
        {getStatusBadge()}
      </div>

      {/* Stage Working File Preview Modal */}
      <WorkingFileModal
        isOpen={previewModal.isOpen}
        onClose={closePreview}
        jobId={jobId}
        stageName={previewModal.stageName}
        initialFileName={previewModal.fileName}
        initialRowCount={previewModal.rowCount}
        initialColCount={previewModal.colCount}
      />
    </main>
  );
};

export default WorkflowCanvas;
