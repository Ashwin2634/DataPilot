import React, { useState, useEffect, useRef } from 'react';
import TopNavigation from './components/TopNavigation';
import LeftSidebar from './components/LeftSidebar';
import WorkflowCanvas from './components/WorkflowCanvas';
import ExecutionConsole from './components/ExecutionConsole';
import { uploadFiles, getJobStatus, listJobs, downloadOutput } from './services/api';

const DEFAULT_READY_LOGS = [
  { time: '12:00:00', level: 'INIT', message: 'QC Product Processor v2.4 core runtime initialized.' },
  { time: '12:00:01', level: 'PLAYWRIGHT', message: 'Playwright headless browser cluster ready (Chromium 122.0).' },
  { time: '12:00:02', level: 'INIT', message: 'Engine standing by. Upload feeds in the sidebar and click "Run Pipeline".' },
];

function App() {
  const [files, setFiles] = useState({
    qc: null,
    specs: null,
    ulm: null,
    lastWorking: null,
  });

  const [jobId, setJobId] = useState(null);
  const [jobData, setJobData] = useState(null);
  const [targetStage, setTargetStage] = useState('cleaner');
  const [status, setStatus] = useState(null);
  const [progressMessage, setProgressMessage] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [pastRuns, setPastRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [logs, setLogs] = useState(DEFAULT_READY_LOGS);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [botState, setBotState] = useState('idle');

  const pollingRef = useRef(null);

  const configuredCount = [files.qc, files.specs, files.ulm, files.lastWorking].filter(Boolean).length;

  // Manage Pilot emotional & loading animation state based on pipeline lifecycle
  useEffect(() => {
    if (isRunning) {
      if (status === 'cleaning' || status === 'scraping') {
        setBotState('loading');
      } else if (status === 'validating' || status === 'pending') {
        setBotState('thinking');
      } else {
        setBotState('loading');
      }
    } else {
      if (status === 'completed') {
        setBotState('excited');
      } else if (status === 'failed') {
        setBotState('worried');
      } else if (configuredCount > 0) {
        setBotState('happy');
      } else {
        setBotState('idle');
      }
    }
  }, [isRunning, status, configuredCount]);

  // Fetch past runs on mount
  const fetchPastRuns = async () => {
    try {
      const runs = await listJobs();
      if (Array.isArray(runs)) {
        setPastRuns(runs);
      }
    } catch (err) {
      console.warn('Could not fetch past runs from backend:', err.message);
    }
  };

  useEffect(() => {
    fetchPastRuns();
  }, []);

  // Handle file uploads & changes
  const handleFileChange = (key, file) => {
    setFiles((prev) => ({ ...prev, [key]: file }));
  };

  const handleFileRemove = (key) => {
    setFiles((prev) => ({ ...prev, [key]: null }));
  };

  // Run Pipeline trigger
  const handleRunPipeline = async () => {
    const configuredFiles = [files.qc, files.specs, files.ulm, files.lastWorking].filter(Boolean);
    if (configuredFiles.length === 0) {
      alert('Please select at least one data file to start the pipeline.');
      return;
    }

    setJobData(null);
    setIsRunning(true);
    setStatus('pending');
    setProgressMessage('Deploying pipeline...');
    try {
      const data = await uploadFiles(files, targetStage);
      const newJobId = data.job_id;
      setJobId(newJobId);
      setSelectedRunId(newJobId);
      setStatus(data.status || 'pending');
      setProgressMessage(data.message || 'Processing started...');

      const initialLog = {
        time: new Date().toLocaleTimeString(),
        level: 'INIT',
        message: `Pipeline deployed for job #${newJobId.substring(0, 8)} in [${targetStage.toUpperCase()}] mode with ${configuredFiles.length} uploaded feed(s).`,
      };
      setLogs([initialLog]);

      // Refresh past runs list
      fetchPastRuns();
    } catch (err) {
      console.error('Pipeline deployment error:', err);
      alert('Deployment failed: ' + (err.response?.data?.detail || err.message));
      setIsRunning(false);
    }
  };

  // Poll active job status
  useEffect(() => {
    if (!jobId || !isRunning) return;

    const poll = async () => {
      try {
        const data = await getJobStatus(jobId);
        setJobData(data);
        setStatus(data.status);
        setProgressMessage(data.progress_message || '');

        if (Array.isArray(data.logs) && data.logs.length > 0) {
          setLogs(data.logs);
        }

        if (data.status === 'completed' || data.status === 'failed') {
          setIsRunning(false);
          clearInterval(pollingRef.current);
          fetchPastRuns();
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    };

    poll();
    pollingRef.current = setInterval(poll, 1500);

    return () => clearInterval(pollingRef.current);
  }, [jobId, isRunning]);

  // Inspect past run
  const handleSelectRun = async (id) => {
    setSelectedRunId(id);
    setJobId(id);
    try {
      const data = await getJobStatus(id);
      setJobData(data);
      setStatus(data.status);
      setProgressMessage(data.progress_message || '');
      if (Array.isArray(data.logs) && data.logs.length > 0) {
        setLogs(data.logs);
      }
      if (data.status === 'cleaning' || data.status === 'validating' || data.status === 'scraping' || data.status === 'pending') {
        setIsRunning(true);
      } else {
        setIsRunning(false);
      }
    } catch (err) {
      console.error('Error inspecting run:', err);
    }
  };

  // Trigger download of final dataset
  const handleDownload = (format = 'xlsx') => {
    if (jobId) {
      downloadOutput(jobId, format);
    } else {
      alert('No completed job output available for download.');
    }
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="h-screen w-screen flex flex-col font-sans text-slate-800 antialiased overflow-hidden bg-slate-50">
      {/* 1. Top Navigation Bar */}
      <TopNavigation
        jobId={jobId}
        status={status}
        onRunPipeline={handleRunPipeline}
        isRunning={isRunning}
        configuredCount={configuredCount}
        targetStage={targetStage}
        onTargetStageChange={setTargetStage}
        botState={botState}
      />

      {/* 2. Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar Drawer */}
        <LeftSidebar
          files={files}
          onFileChange={handleFileChange}
          onFileRemove={handleFileRemove}
          pastRuns={pastRuns}
          selectedRunId={selectedRunId}
          onSelectRun={handleSelectRun}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        />

        {/* Workflow Graph Canvas */}
        <div className="flex-1 flex flex-col relative overflow-hidden">
          <WorkflowCanvas
            jobId={jobId}
            status={status}
            progressMessage={progressMessage}
            files={files}
            onFileChange={handleFileChange}
            onFileRemove={handleFileRemove}
            onDownload={handleDownload}
            activeLogs={logs}
            jobData={jobData}
            botState={botState}
            targetStage={targetStage}
          />

          {/* 3. Bottom Live Console Drawer */}
          <ExecutionConsole
            jobId={jobId}
            status={status}
            logs={logs}
            onClearLogs={handleClearLogs}
          />
        </div>
      </div>
    </div>
  );
}

export default App;