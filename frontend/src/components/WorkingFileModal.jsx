import React, { useState, useEffect, useMemo } from 'react';
import { getStagePreview, downloadStageOutput } from '../services/api';

const STAGE_TITLES = {
  cleaner: 'Data Cleaning & Schema Normalization',
  validator: 'Master Validation & Matching',
  scraper: 'Playwright Scraped Enriched Feeds',
  exporter: 'Final Master QC Dataset',
};

const STAGE_STEP_NUMBERS = {
  cleaner: 'Step 2',
  validator: 'Step 3',
  scraper: 'Step 4',
  exporter: 'Step 5',
};

export default function WorkingFileModal({
  isOpen,
  onClose,
  jobId,
  stageName = 'cleaner',
  initialFileName,
  initialRowCount,
  initialColCount,
  onTriggerDownload,
}) {

  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [fileName, setFileName] = useState(initialFileName || '');
  const [totalRows, setTotalRows] = useState(initialRowCount || 0);
  const [filteredRows, setFilteredRows] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Sync initial metadata
  useEffect(() => {
    if (initialFileName) setFileName(initialFileName);
    if (initialRowCount) setTotalRows(initialRowCount);
  }, [initialFileName, initialRowCount]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Fetch preview data
  const fetchData = async (targetPage = page, targetPageSize = pageSize, search = activeSearch) => {
    if (!jobId || !stageName || !isOpen) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await getStagePreview(jobId, stageName, targetPage, targetPageSize, search);
      setData(res.data || []);
      setColumns(res.columns || []);
      setFileName(res.file_name || fileName);
      setTotalRows(res.total_rows || 0);
      setFilteredRows(res.filtered_rows || res.total_rows || 0);
      setPage(res.page || 1);
      setTotalPages(res.total_pages || 1);
    } catch (err) {
      console.error('Error fetching stage preview:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to load working file preview');
    } finally {
      setIsLoading(false);
    }
  };

  // Re-fetch when modal opens, or stage/job/page/pageSize changes
  useEffect(() => {
    if (isOpen) {
      setPage(1);
      setActiveSearch('');
      setSearchTerm('');
      fetchData(1, pageSize, '');
    }
  }, [isOpen, jobId, stageName]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setActiveSearch(searchTerm);
    setPage(1);
    fetchData(1, pageSize, searchTerm);
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setActiveSearch('');
    setPage(1);
    fetchData(1, pageSize, '');
  };

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    setPage(newPage);
    fetchData(newPage, pageSize, activeSearch);
  };

  const handlePageSizeChange = (e) => {
    const newSize = Number(e.target.value);
    setPageSize(newSize);
    setPage(1);
    fetchData(1, newSize, activeSearch);
  };

  const handleDownload = (format = 'xlsx') => {
    if (jobId && stageName) {
      if (onTriggerDownload) {
        onTriggerDownload(stageName, format, fileName);
      } else {
        downloadStageOutput(jobId, stageName, format);
      }
    }
  };


  if (!isOpen) return null;

  const stageLabel = STAGE_TITLES[stageName] || 'Working File Dataset';
  const stepLabel = STAGE_STEP_NUMBERS[stageName] || 'Pipeline Stage';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="bg-white w-full h-[94vh] max-w-7xl rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200/90 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center space-x-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-500/40 text-indigo-400 flex items-center justify-center shrink-0">
              <i className="ph-duotone ph-table text-xl"></i>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                  {stepLabel} Output
                </span>
                <h2 className="text-base font-bold text-white truncate">
                  {stageLabel}
                </h2>
                {fileName && (
                  <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700 truncate max-w-xs">
                    {fileName}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                <span>
                  Total Rows: <strong className="text-slate-200 font-mono">{totalRows.toLocaleString()}</strong>
                </span>
                <span>•</span>
                <span>
                  Schema Columns: <strong className="text-slate-200 font-mono">{columns.length || initialColCount || 23}</strong>
                </span>
                {activeSearch && (
                  <>
                    <span>•</span>
                    <span className="text-amber-400 font-mono">
                      Matched: <strong>{filteredRows.toLocaleString()}</strong>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {/* Download Excel Button */}
            <button
              type="button"
              onClick={() => handleDownload('xlsx')}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all"
              title="Download Excel (.xlsx) file for this pipeline stage"
            >
              <i className="ph-bold ph-download-simple text-sm"></i>
              <span>Excel (.XLSX)</span>
            </button>

            {/* Download CSV Button */}
            <button
              type="button"
              onClick={() => handleDownload('csv')}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all"
              title="Download CSV (.csv) file for this pipeline stage"
            >
              <i className="ph-bold ph-file-csv text-sm"></i>
              <span>CSV (.CSV)</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Close modal (Esc)"
            >
              <i className="ph-bold ph-x text-lg"></i>
            </button>
          </div>
        </div>

        {/* Toolbar & Filter Bar */}
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Search box */}
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 max-w-md w-full sm:w-auto">
            <div className="relative flex-1">
              <i className="ph-bold ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search across all columns (e.g. SKU, URL, Brand)..."
                className="w-full bg-white pl-9 pr-8 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-2xs font-mono"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <i className="ph-bold ph-x-circle text-xs"></i>
                </button>
              )}
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors shadow-2xs"
            >
              Filter
            </button>
            {activeSearch && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-medium rounded-lg transition-colors"
              >
                Reset
              </button>
            )}
          </form>

          {/* Page size & Refresh info */}
          <div className="flex items-center space-x-3 text-xs text-slate-600">
            <div className="flex items-center space-x-1.5">
              <span>Show</span>
              <select
                value={pageSize}
                onChange={handlePageSizeChange}
                className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
              >
                <option value={25}>25 rows</option>
                <option value={50}>50 rows</option>
                <option value={100}>100 rows</option>
                <option value={200}>200 rows</option>
              </select>
            </div>
            <button
              onClick={() => fetchData(page, pageSize, activeSearch)}
              className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors"
              title="Refresh data"
            >
              <i className={`ph-bold ph-arrows-clockwise text-sm ${isLoading ? 'animate-spin text-indigo-600' : ''}`}></i>
            </button>
          </div>
        </div>

        {/* Column pills tag bar */}
        {columns.length > 0 && (
          <div className="bg-white px-6 py-2 border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto text-[11px] text-slate-600 shrink-0 select-none">
            <span className="font-semibold text-slate-400 uppercase tracking-wider text-[10px] shrink-0 mr-1">
              Columns ({columns.length}):
            </span>
            {columns.map((col, idx) => (
              <span
                key={idx}
                className="font-mono px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 shrink-0 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors cursor-default"
                title={`Column #${idx + 1}: ${col}`}
              >
                {col}
              </span>
            ))}
          </div>
        )}

        {/* Main Table Content Viewport */}
        <div className="flex-1 overflow-auto relative bg-slate-50/50">
          {isLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70 backdrop-blur-2xs z-20">
              <i className="ph-bold ph-spinner animate-spin text-indigo-600 text-3xl"></i>
              <p className="text-xs font-medium text-slate-600 mt-2 font-mono">
                Loading working dataset...
              </p>
            </div>
          ) : null}

          {error ? (
            <div className="p-10 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-3">
                <i className="ph-bold ph-warning-circle text-2xl"></i>
              </div>
              <h3 className="text-sm font-bold text-slate-900">Failed to Load Dataset</h3>
              <p className="text-xs text-red-600 mt-1 max-w-md font-mono bg-red-50 p-3 rounded-lg border border-red-200">
                {error}
              </p>
              <button
                onClick={() => fetchData(page, pageSize, activeSearch)}
                className="mt-4 px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-xl hover:bg-indigo-500 transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : data.length === 0 && !isLoading ? (
            <div className="p-12 flex flex-col items-center justify-center text-center text-slate-500">
              <i className="ph-duotone ph-magnifying-glass text-4xl text-slate-400 mb-2"></i>
              <h3 className="text-sm font-semibold text-slate-700">No records found</h3>
              <p className="text-xs text-slate-400 mt-1">
                {activeSearch
                  ? `No rows matched your search term "${activeSearch}".`
                  : 'The generated working file contains 0 rows.'}
              </p>
              {activeSearch && (
                <button
                  onClick={handleClearSearch}
                  className="mt-3 px-3 py-1.5 bg-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-300 transition-colors"
                >
                  Clear Filter
                </button>
              )}
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-xs font-sans">
              <thead className="sticky top-0 bg-slate-100/95 backdrop-blur-md z-10 border-b border-slate-200 shadow-2xs">
                <tr>
                  <th className="py-2.5 px-3 text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider border-r border-slate-200 w-12 text-center bg-slate-100">
                    #
                  </th>
                  {columns.map((col, idx) => (
                    <th
                      key={idx}
                      className="py-2.5 px-3 text-[11px] font-mono font-bold text-slate-700 uppercase tracking-wider border-r border-slate-200 whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {data.map((row, rowIdx) => {
                  const absoluteIndex = (page - 1) * pageSize + rowIdx + 1;
                  return (
                    <tr
                      key={rowIdx}
                      className="hover:bg-indigo-50/40 transition-colors group"
                    >
                      <td className="py-2 px-3 text-[11px] font-mono text-slate-400 border-r border-slate-200 text-center bg-slate-50/50 group-hover:text-slate-700 select-none">
                        {absoluteIndex}
                      </td>
                      {columns.map((col, colIdx) => {
                        const val = row[col];
                        const isNull = val === null || val === undefined || val === '';
                        const isUrl =
                          !isNull &&
                          typeof val === 'string' &&
                          (val.startsWith('http://') || val.startsWith('https://'));

                        return (
                          <td
                            key={colIdx}
                            className="py-2 px-3 text-xs text-slate-800 border-r border-slate-200 whitespace-nowrap max-w-xs truncate font-normal"
                          >
                            {isNull ? (
                              <span className="text-slate-300 font-mono select-none">—</span>
                            ) : isUrl ? (
                              <a
                                href={val}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 font-mono text-[11px] truncate"
                                title={val}
                              >
                                <span className="truncate">{val}</span>
                                <i className="ph-bold ph-arrow-square-out text-[10px] shrink-0"></i>
                              </a>
                            ) : (
                              <span
                                className={
                                  col.toLowerCase().includes('sku') ||
                                  col.toLowerCase().includes('number') ||
                                  col.toLowerCase().includes('date') ||
                                  col.toLowerCase().includes('price')
                                    ? 'font-mono text-[11px]'
                                    : ''
                                }
                                title={String(val)}
                              >
                                {String(val)}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Bottom Pagination Bar */}
        <div className="bg-white px-6 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-600 font-mono">
            Showing{' '}
            <strong className="text-slate-900">
              {filteredRows === 0 ? 0 : (page - 1) * pageSize + 1}
            </strong>{' '}
            to{' '}
            <strong className="text-slate-900">
              {Math.min(page * pageSize, filteredRows)}
            </strong>{' '}
            of <strong className="text-slate-900">{filteredRows.toLocaleString()}</strong> rows
            {activeSearch && ` (filtered from ${totalRows.toLocaleString()} total)`}
          </div>

          <div className="flex items-center space-x-1.5">
            {/* First Page */}
            <button
              onClick={() => handlePageChange(1)}
              disabled={page <= 1 || isLoading}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 transition-colors"
              title="First Page"
            >
              <i className="ph-bold ph-caret-double-left text-xs"></i>
            </button>

            {/* Prev Page */}
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1 || isLoading}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium text-slate-700 flex items-center gap-1 transition-colors"
            >
              <i className="ph-bold ph-caret-left text-xs"></i>
              <span>Prev</span>
            </button>

            {/* Current Page Pill */}
            <div className="px-3 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold rounded-lg font-mono">
              Page {page} of {totalPages}
            </div>

            {/* Next Page */}
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages || isLoading}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium text-slate-700 flex items-center gap-1 transition-colors"
            >
              <span>Next</span>
              <i className="ph-bold ph-caret-right text-xs"></i>
            </button>

            {/* Last Page */}
            <button
              onClick={() => handlePageChange(totalPages)}
              disabled={page >= totalPages || isLoading}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 transition-colors"
              title="Last Page"
            >
              <i className="ph-bold ph-caret-double-right text-xs"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
