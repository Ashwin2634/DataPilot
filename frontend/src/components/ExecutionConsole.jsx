import React, { useState, useEffect, useRef } from 'react';

const ExecutionConsole = ({ jobId, status, logs = [], onClearLogs }) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const logContainerRef = useRef(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const getTagColor = (level) => {
    switch (level?.toUpperCase()) {
      case 'INIT':
        return 'text-indigo-400';
      case 'CLEAN':
      case 'VALIDATE':
        return 'text-emerald-400';
      case 'PLAYWRIGHT':
        return 'text-sky-400';
      case 'COMPLETE':
        return 'text-emerald-400 font-semibold';
      case 'ERROR':
        return 'text-rose-400 font-semibold';
      default:
        return 'text-indigo-300';
    }
  };

  const isStreaming = status === 'cleaning' || status === 'validating' || status === 'scraping' || status === 'pending';

  return (
    <footer
      className="bg-slate-950 border-t border-slate-800 text-slate-300 flex flex-col shrink-0 z-20 transition-all duration-300 select-none"
      data-purpose="execution-console"
      id="consoleDrawer"
      style={{ height: isCollapsed ? '36px' : '190px' }}
    >
      {/* Drawer Header */}
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="h-9 px-4 bg-slate-900 border-b border-slate-800/80 flex items-center justify-between cursor-pointer hover:bg-slate-850 transition-colors"
        id="toggleConsole"
      >
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-200">
            <i className="ph-bold ph-terminal text-indigo-400"></i>
            <span>Execution Logs • Job {jobId ? jobId : 'Standby'}</span>
          </div>

          {isStreaming ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></span> Streaming
            </span>
          ) : status === 'completed' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-emerald-900/60 text-emerald-300 border border-emerald-700/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Finished
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-400 border border-slate-700/50">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span> Idle
            </span>
          )}
        </div>

        <div className="flex items-center space-x-3 text-xs" onClick={(e) => e.stopPropagation()}>
          <span className="text-slate-400 font-mono text-[11px] hidden sm:inline">
            Worker Memory: 312MB / 1024MB
          </span>
          <div className="h-3 w-px bg-slate-700 hidden sm:block"></div>
          <button
            onClick={onClearLogs}
            className="text-slate-400 hover:text-white flex items-center gap-1 text-[11px] p-1 rounded hover:bg-slate-800 transition-colors"
            title="Clear Console"
          >
            <i className="ph-bold ph-trash"></i>
          </button>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
            title={isCollapsed ? 'Expand Drawer' : 'Minimize Drawer'}
          >
            <i className={`ph-bold ${isCollapsed ? 'ph-caret-up' : 'ph-caret-down'}`}></i>
          </button>
        </div>
      </div>

      {/* Terminal Body Stream */}
      {!isCollapsed && (
        <div
          ref={logContainerRef}
          className="flex-1 p-3 overflow-y-auto font-mono text-[11px] leading-relaxed text-slate-300 bg-slate-950 space-y-1 custom-scrollbar"
        >
          {logs && logs.length > 0 ? (
            logs.map((log, index) => (
              <div key={index} className="flex items-start space-x-2 text-slate-500">
                <span className="select-none text-slate-600">[{log.time || '00:00:00'}]</span>
                <span className={getTagColor(log.level)}>[{log.level || 'INFO'}]</span>
                <span className="text-slate-300 break-all">{log.message}</span>
              </div>
            ))
          ) : (
            <div className="text-slate-500 py-2">
              <p>[Ready] Worker process initialized. Waiting for pipeline execution trigger.</p>
              <p className="text-slate-600">&gt; Upload data files in the left sidebar and click "Run Pipeline".</p>
            </div>
          )}
        </div>
      )}
    </footer>
  );
};

export default ExecutionConsole;
