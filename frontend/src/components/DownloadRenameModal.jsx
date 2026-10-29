import React, { useState, useEffect, useRef } from 'react';
import { getDownloadUrl, downloadFileBlob } from '../services/api';

const STAGE_TITLES = {
  cleaner: 'Data Cleaning Stage',
  validator: 'Data Validation Stage',
  scraper: 'Playwright Scraper Stage',
  exporter: 'Final Master Output',
};

const DEFAULT_BASENAMES = {
  cleaner: 'QC_Cleaned_Working_File',
  validator: 'QC_Validated_Working_File',
  scraper: 'QC_Scraped_Working_File',
  exporter: 'QC_Master_Product_Output',
};

const DownloadRenameModal = ({
  isOpen,
  onClose,
  jobId,
  stageName = null,
  format = 'xlsx',
  originalFileName = '',
}) => {
  const [customName, setCustomName] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const inputRef = useRef(null);

  // Compute a smart, clean default basename
  const getDefaultBaseName = () => {
    if (originalFileName) {
      // Remove extension and remove leading UUID prefixes like "f69c23b7-c636-4d82-8bf7-f3bd8c4dd581_"
      let clean = originalFileName.replace(/\.(xlsx|csv|xls)$/i, '');
      clean = clean.replace(/^[0-9a-fA-F-]{32,36}_?/, '');
      if (clean.trim()) {
        return clean.trim();
      }
    }
    return DEFAULT_BASENAMES[stageName] || 'QC_Processor_Output';
  };

  const defaultBaseName = getDefaultBaseName();
  const cleanExt = (format || 'xlsx').toLowerCase().replace('.', '');

  useEffect(() => {
    if (isOpen) {
      setCustomName(defaultBaseName);
      setErrorMessage('');
      setIsDownloading(false);
      // Auto-focus and highlight the input so user can instantly type
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen, originalFileName, stageName, format]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape' && !isDownloading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDownloading, onClose]);

  if (!isOpen) return null;

  const handleDownload = async (e) => {
    if (e) e.preventDefault();
    if (!jobId) {
      setErrorMessage('No active job ID found.');
      return;
    }

    let finalBase = customName.trim();
    if (!finalBase) {
      finalBase = defaultBaseName;
    }
    // Remove extension if user accidentally typed it in the input
    finalBase = finalBase.replace(new RegExp(`\\.${cleanExt}$`, 'i'), '');
    const finalFileName = `${finalBase}.${cleanExt}`;

    try {
      setIsDownloading(true);
      setErrorMessage('');
      const url = getDownloadUrl(jobId, stageName, cleanExt);
      await downloadFileBlob(url, finalFileName);
      setIsDownloading(false);
      onClose();
    } catch (err) {
      setIsDownloading(false);
      setErrorMessage(err?.message || 'Failed to download file. Please try again.');
    }
  };

  const stageLabel = STAGE_TITLES[stageName] || 'Pipeline Dataset';
  const displayFinalName = `${(customName.trim() || defaultBaseName).replace(new RegExp(`\\.${cleanExt}$`, 'i'), '')}.${cleanExt}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDownloading) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden transform transition-all animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-slate-100 flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 shadow-2xs">
              <i className="ph-bold ph-download-simple text-xl"></i>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Save File to Your PC</h3>
              <p className="text-xs text-slate-500 mt-0.5">Customize your local filename before downloading</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDownloading}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
            title="Close"
          >
            <i className="ph-bold ph-x text-sm"></i>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleDownload} className="p-5 space-y-4">
          {/* Metadata badges */}
          <div className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2">
            <div className="flex items-center gap-1.5 truncate pr-2">
              <span className="font-semibold text-slate-700 truncate">{stageLabel}</span>
            </div>
            <span className="text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded-md bg-indigo-100/80 text-indigo-700 border border-indigo-200 shrink-0">
              .{cleanExt} Format
            </span>
          </div>

          {/* Filename Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="customFileNameInput" className="text-xs font-semibold text-slate-700">
                Local PC Filename
              </label>
              {customName !== defaultBaseName && (
                <button
                  type="button"
                  onClick={() => setCustomName(defaultBaseName)}
                  className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium hover:underline cursor-pointer"
                >
                  Reset default
                </button>
              )}
            </div>
            <div className="relative flex rounded-xl border border-slate-300 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 bg-white transition-all overflow-hidden shadow-2xs">
              <div className="pl-3 flex items-center pointer-events-none text-slate-400">
                <i className="ph-bold ph-file-text text-base"></i>
              </div>
              <input
                id="customFileNameInput"
                ref={inputRef}
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={defaultBaseName}
                disabled={isDownloading}
                className="w-full px-2.5 py-2 text-xs font-mono text-slate-800 focus:outline-hidden placeholder-slate-400"
              />
              <span className="px-3 flex items-center bg-slate-100 text-slate-600 font-mono text-xs font-bold border-l border-slate-200 select-none">
                .{cleanExt}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1 truncate pt-0.5">
              <span>Will be saved as:</span>
              <span className="font-mono text-slate-600 font-semibold truncate" title={displayFinalName}>
                {displayFinalName}
              </span>
            </p>
          </div>

          {/* Safe Note Pill */}
          <div className="flex items-start gap-2 p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-[11px] text-emerald-800">
            <i className="ph-bold ph-shield-check text-emerald-600 text-sm mt-0.5 shrink-0"></i>
            <span>
              This only renames the downloaded copy on your PC. The file on the server remains untouched.
            </span>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <i className="ph-bold ph-warning-circle text-rose-500 text-base shrink-0"></i>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isDownloading}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isDownloading}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              {isDownloading ? (
                <>
                  <i className="ph-bold ph-arrows-clockwise text-sm animate-spin"></i>
                  <span>Downloading...</span>
                </>
              ) : (
                <>
                  <i className="ph-bold ph-download-simple text-sm"></i>
                  <span>Download to PC</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DownloadRenameModal;
