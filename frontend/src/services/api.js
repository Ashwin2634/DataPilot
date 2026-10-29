import axios from 'axios';

// Use environment variable in production, fallback to localhost in development
const RAW_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_URL = RAW_API_URL.replace(/\/+$/, '');

const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  timeout: 30000,
});

export const uploadFiles = async (files, targetStage = 'all') => {
  const formData = new FormData();

  if (files.qc) formData.append('qc_file', files.qc);
  if (files.specs) formData.append('specs_file', files.specs);
  if (files.ulm) formData.append('ulm_file', files.ulm);
  if (files.lastWorking) formData.append('last_working_file', files.lastWorking);
  formData.append('target_stage', targetStage);

  const response = await api.post('/jobs/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
};

export const getJobStatus = async (jobId) => {
  const response = await api.get(`/jobs/${jobId}`);
  return response.data;
};

export const listJobs = async () => {
  const response = await api.get('/jobs');
  return response.data;
};

export const getDownloadUrl = (jobId, stageName = null, format = 'xlsx') => {
  const cleanFormat = (format || 'xlsx').toLowerCase().replace('.', '');
  if (stageName && stageName !== 'exporter' && stageName !== 'final') {
    return `${API_URL}/api/v1/jobs/${jobId}/stages/${stageName}/download?format=${cleanFormat}`;
  }
  return `${API_URL}/api/v1/jobs/${jobId}/download?format=${cleanFormat}`;
};

export const downloadFileBlob = async (downloadUrl, finalFileName) => {
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    let errorDetail = `HTTP ${response.status} ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson?.detail) errorDetail = errJson.detail;
    } catch (_) {}
    throw new Error(errorDetail);
  }
  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = objectUrl;
  a.download = finalFileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (a.parentNode) {
      document.body.removeChild(a);
    }
    window.URL.revokeObjectURL(objectUrl);
  }, 250);
};

export const downloadOutput = (jobId, format = 'xlsx') => {
  window.open(`${API_URL}/api/v1/jobs/${jobId}/download?format=${format}`, '_blank');
};

export const downloadStageOutput = (jobId, stageName, format = 'xlsx') => {
  window.open(`${API_URL}/api/v1/jobs/${jobId}/stages/${stageName}/download?format=${format}`, '_blank');
};


export const getStagePreview = async (jobId, stageName, page = 1, pageSize = 50, search = '') => {
  const params = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString(),
  });
  if (search && search.trim()) {
    params.append('search', search.trim());
  }
  const response = await api.get(`/jobs/${jobId}/stages/${stageName}/preview?${params.toString()}`);
  return response.data;
};

export default api;