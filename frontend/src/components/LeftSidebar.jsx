import React, { useState, useRef } from 'react';

const formatFileSize = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const formatDate = (isoString) => {
  if (!isoString) return 'Just now';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
      d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return isoString;
  }
};

const LeftSidebar = ({
  files,
  onFileChange,
  onFileRemove,
  pastRuns,
  selectedRunId,
  onSelectRun,
  isSidebarOpen,
  onToggleSidebar,
}) => {
  const [activeTab, setActiveTab] = useState('ingest'); // 'ingest' | 'runs'

  const qcInputRef = useRef(null);
  const specsInputRef = useRef(null);
  const ulmInputRef = useRef(null);
  const lastWorkingInputRef = useRef(null);

  const configuredCount = [files.qc, files.specs, files.ulm, files.lastWorking].filter(Boolean).length;

  const handleDrop = (e, key) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileChange(key, e.dataTransfer.files[0]);
    }
  };

  return (
    <aside
      className={`bg-white border-r border-slate-200 flex flex-col z-20 shadow-sm shrink-0 transition-all duration-300 ease-in-out ${
        isSidebarOpen ? 'w-80 md:w-96' : 'w-14'
      }`}
      id="leftSidebar"
    >
      {/* Sidebar Header / Tab Navigation */}
      <div className="p-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
        {isSidebarOpen ? (
          <>
            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => setActiveTab('ingest')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  activeTab === 'ingest'
                    ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                Data Ingestion
              </button>
              <button
                onClick={() => setActiveTab('runs')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeTab === 'runs'
                    ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                Past Runs ({pastRuns.length})
              </button>
            </div>
            <button
              onClick={onToggleSidebar}
              className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-200/50 transition-colors"
              title="Collapse Panel"
            >
              <i className="ph-bold ph-caret-left text-sm"></i>
            </button>
          </>
        ) : (
          <button
            onClick={onToggleSidebar}
            className="w-full text-slate-400 hover:text-slate-700 p-1 flex justify-center hover:bg-slate-200/50 rounded transition-colors"
            title="Expand Panel"
          >
            <i className="ph-bold ph-caret-right text-base"></i>
          </button>
        )}
      </div>

      {/* When collapsed, show small vertical icons bar */}
      {!isSidebarOpen && (
        <div className="flex-1 flex flex-col items-center py-4 space-y-4 text-slate-400">
          <button
            onClick={() => {
              setActiveTab('ingest');
              onToggleSidebar();
            }}
            className="p-2 rounded-lg hover:bg-slate-100 hover:text-indigo-600 transition-colors"
            title="Data Ingestion"
          >
            <i className="ph-duotone ph-folder-open text-xl"></i>
          </button>
          <button
            onClick={() => {
              setActiveTab('runs');
              onToggleSidebar();
            }}
            className="p-2 rounded-lg hover:bg-slate-100 hover:text-indigo-600 transition-colors"
            title={`Past Runs (${pastRuns.length})`}
          >
            <i className="ph-duotone ph-clock-counter-clockwise text-xl"></i>
          </button>
        </div>
      )}

      {/* Main Expanded Panel Body */}
      {isSidebarOpen && (
        <>
          {activeTab === 'ingest' ? (
            /* Panel 1: File Ingestion Station */
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">File Ingestion Hub</h2>
                  <span
                    className={`text-[11px] font-medium px-1.5 py-0.5 rounded border transition-colors ${
                      configuredCount === 4
                        ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                        : configuredCount > 0
                        ? 'text-indigo-700 bg-indigo-50 border-indigo-200'
                        : 'text-slate-500 bg-slate-100 border-slate-200'
                    }`}
                  >
                    {configuredCount}/4 Configured
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Provide required feeds for cross-table matching and automated Playwright crawler jobs.
                </p>
              </div>

              {/* Hidden file inputs */}
              <input
                type="file"
                ref={qcInputRef}
                className="hidden"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => e.target.files?.[0] && onFileChange('qc', e.target.files[0])}
              />
              <input
                type="file"
                ref={specsInputRef}
                className="hidden"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => e.target.files?.[0] && onFileChange('specs', e.target.files[0])}
              />
              <input
                type="file"
                ref={ulmInputRef}
                className="hidden"
                accept=".tsv,.csv,.xlsx,.xls"
                onChange={(e) => e.target.files?.[0] && onFileChange('ulm', e.target.files[0])}
              />
              <input
                type="file"
                ref={lastWorkingInputRef}
                className="hidden"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => e.target.files?.[0] && onFileChange('lastWorking', e.target.files[0])}
              />

              {/* Field 1: QC / Crawler File */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, 'qc')}
                className={`rounded-xl border transition-all ${
                  files.qc
                    ? 'border-2 border-indigo-200 bg-indigo-50/30 p-3'
                    : 'border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50/50 p-3'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                      1
                    </span>
                    <div>
                      <label className="text-xs font-bold text-slate-800 block cursor-pointer" onClick={() => qcInputRef.current?.click()}>
                        QC / Crawler File
                      </label>
                      <span className="text-[11px] text-slate-500">Master product sheet or raw crawler dumps</span>
                    </div>
                  </div>
                  <span className="bg-indigo-100 text-indigo-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                    Primary
                  </span>
                </div>

                {files.qc ? (
                  <div className="mt-2.5 flex items-center justify-between bg-white border border-indigo-200 rounded-lg p-2 shadow-xs">
                    <div className="flex items-center space-x-2 truncate">
                      <i className="ph-fill ph-file-xls text-emerald-600 text-xl"></i>
                      <div className="truncate">
                        <p className="text-xs font-medium text-slate-800 truncate">{files.qc.name}</p>
                        <p className="text-[10px] text-slate-400">{formatFileSize(files.qc.size)} • Feed Ready</p>
                      </div>
                    </div>
                    <button
                      onClick={() => onFileRemove('qc')}
                      className="text-slate-400 hover:text-red-500 p-1 transition-colors"
                      title="Remove file"
                    >
                      <i className="ph-bold ph-x text-xs"></i>
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => qcInputRef.current?.click()}
                    className="mt-2.5 border border-dashed border-slate-300 hover:border-indigo-400 bg-white/70 hover:bg-indigo-50/20 rounded-lg p-2.5 text-center cursor-pointer transition-colors flex items-center justify-center gap-2"
                  >
                    <i className="ph-bold ph-cloud-arrow-up text-indigo-500 text-base"></i>
                    <span className="text-xs font-medium text-slate-600">Select or drop master QC spreadsheet</span>
                  </div>
                )}
              </div>

              {/* Field 2: Specs Master File */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, 'specs')}
                className={`rounded-xl border transition-all ${
                  files.specs
                    ? 'border-indigo-200 bg-indigo-50/20 p-3'
                    : 'border-slate-200 bg-white p-3 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold">
                      2
                    </span>
                    <div>
                      <label className="text-xs font-semibold text-slate-800 block cursor-pointer" onClick={() => specsInputRef.current?.click()}>
                        Specs Master File
                      </label>
                      <span className="text-[11px] text-slate-400">Attribute dictionary &amp; limits definition</span>
                    </div>
                  </div>
                </div>

                <div className="mt-2.5">
                  {files.specs ? (
                    <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-2 shadow-xs">
                      <div className="flex items-center space-x-2 truncate">
                        <i className="ph-bold ph-file-csv text-indigo-500 text-lg"></i>
                        <span className="text-xs font-medium text-slate-700 truncate">{files.specs.name}</span>
                        <span className="text-[10px] text-emerald-600 font-bold bg-emerald-100 px-1.5 py-0.2 rounded shrink-0">
                          Linked
                        </span>
                      </div>
                      <button onClick={() => onFileRemove('specs')} className="text-slate-400 hover:text-red-500 p-1 transition-colors">
                        <i className="ph-bold ph-x text-xs"></i>
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => specsInputRef.current?.click()}
                      className="border border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/20 rounded-lg p-2.5 text-center cursor-pointer transition-colors flex items-center justify-center gap-2"
                    >
                      <i className="ph-bold ph-cloud-arrow-up text-indigo-500 text-base"></i>
                      <span className="text-xs font-medium text-slate-600">Choose Specs Master (.xlsx, .csv)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Field 3: ULM File */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, 'ulm')}
                className={`rounded-xl border transition-all ${
                  files.ulm
                    ? 'border-indigo-200 bg-indigo-50/20 p-3'
                    : 'border-slate-200 bg-white p-3 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold">
                      3
                    </span>
                    <div>
                      <label className="text-xs font-semibold text-slate-800 block cursor-pointer" onClick={() => ulmInputRef.current?.click()}>
                        ULM File (Universal Listing Model)
                      </label>
                      <span className="text-[11px] text-slate-400">Cross-channel SKU hierarchy feed</span>
                    </div>
                  </div>
                </div>

                <div className="mt-2.5">
                  {files.ulm ? (
                    <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-2 shadow-xs">
                      <div className="flex items-center space-x-2 truncate">
                        <i className="ph-bold ph-file-text text-sky-500 text-lg"></i>
                        <span className="text-xs font-medium text-slate-700 truncate">{files.ulm.name}</span>
                        <span className="text-[10px] text-emerald-600 font-bold bg-emerald-100 px-1.5 py-0.2 rounded shrink-0">
                          Linked
                        </span>
                      </div>
                      <button onClick={() => onFileRemove('ulm')} className="text-slate-400 hover:text-red-500 p-1 transition-colors">
                        <i className="ph-bold ph-x text-xs"></i>
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => ulmInputRef.current?.click()}
                      className="border border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/20 rounded-lg p-2 text-center cursor-pointer transition-colors flex items-center justify-center gap-2"
                    >
                      <i className="ph-bold ph-file-arrow-up text-slate-400 text-base"></i>
                      <span className="text-xs text-slate-500">Choose ULM Feed (.tsv, .csv)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Field 4: Last Working File */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, 'lastWorking')}
                className={`rounded-xl border transition-all ${
                  files.lastWorking
                    ? 'border-indigo-200 bg-indigo-50/20 p-3'
                    : 'border-slate-200 bg-white p-3 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold">
                      4
                    </span>
                    <div>
                      <label className="text-xs font-semibold text-slate-800 block cursor-pointer" onClick={() => lastWorkingInputRef.current?.click()}>
                        Last Working File
                      </label>
                      <span className="text-[11px] text-slate-400">Previous snapshot for diff &amp; delta comparison</span>
                    </div>
                  </div>
                </div>

                <div className="mt-2.5">
                  {files.lastWorking ? (
                    <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-2 shadow-xs">
                      <div className="flex items-center space-x-2 truncate">
                        <i className="ph-bold ph-file-arrow-up text-amber-500 text-lg"></i>
                        <span className="text-xs font-medium text-slate-700 truncate">{files.lastWorking.name}</span>
                        <span className="text-[10px] text-emerald-600 font-bold bg-emerald-100 px-1.5 py-0.2 rounded shrink-0">
                          Linked
                        </span>
                      </div>
                      <button onClick={() => onFileRemove('lastWorking')} className="text-slate-400 hover:text-red-500 p-1 transition-colors">
                        <i className="ph-bold ph-x text-xs"></i>
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => lastWorkingInputRef.current?.click()}
                      className="border border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/20 rounded-lg p-2 text-center cursor-pointer transition-colors flex items-center justify-center gap-2"
                    >
                      <i className="ph-bold ph-file-arrow-up text-slate-400 text-base"></i>
                      <span className="text-xs text-slate-500">Choose Delta Snapshot (.xlsx, .csv)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Ingest Config Card */}
              <div className="p-3 bg-slate-100 rounded-lg text-xs space-y-1.5 text-slate-600 border border-slate-200">
                <div className="flex justify-between items-center text-slate-700 font-semibold">
                  <span>Runtime Settings</span>
                  <span className="text-indigo-600 cursor-pointer text-[11px] hover:underline">Edit</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span>Playwright Workers:</span>
                  <span className="font-mono text-slate-800">4 Concurrent</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span>Headless Browser:</span>
                  <span className="font-mono text-slate-800">Chromium 122.0</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span>Auto Export Format:</span>
                  <span className="font-mono text-slate-800">XLSX + CSV</span>
                </div>
              </div>
            </div>
          ) : (
            /* Panel 2: Past Runs View */
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs font-semibold text-slate-700">Runs (Recent)</span>
                <span className="text-xs text-slate-400">{pastRuns.length} total</span>
              </div>

              {pastRuns.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs">
                  <i className="ph-duotone ph-clock-counter-clockwise text-2xl mb-1 text-slate-300 block"></i>
                  No prior pipeline runs found. Upload files and click "Run Pipeline" to start.
                </div>
              ) : (
                pastRuns.map((run) => {
                  const isSelected = selectedRunId === run.id;
                  const isCompleted = run.status === 'completed';
                  const isFailed = run.status === 'failed';
                  const isRunning = !isCompleted && !isFailed;

                  return (
                    <div
                      key={run.id}
                      onClick={() => onSelectRun(run.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50/40 shadow-xs'
                          : 'border-slate-200 hover:border-indigo-300 bg-white hover:shadow-xs'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        {isCompleted && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <i className="ph-bold ph-check text-xs"></i> Successful
                          </span>
                        )}
                        {isFailed && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                            <i className="ph-bold ph-x text-xs"></i> Failed
                          </span>
                        )}
                        {isRunning && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                            <i className="ph-bold ph-spinner animate-spin text-xs"></i> {run.status || 'Active'}
                          </span>
                        )}
                        <span className="text-[11px] font-mono text-slate-400">{formatDate(run.created_at)}</span>
                      </div>
                      <div className="text-xs text-slate-700 font-medium font-mono">Job #{run.id?.substring(0, 8)}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {run.progress_message || (isCompleted ? 'Dataset generated successfully' : 'Processing...')}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Bottom Status Pill in Sidebar */}
          <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
            <span className="text-slate-500 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Engine Online
            </span>
            <button className="text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 transition-colors">
              <i className="ph-bold ph-sliders"></i> Config
            </button>
          </div>
        </>
      )}
    </aside>
  );
};

export default LeftSidebar;
