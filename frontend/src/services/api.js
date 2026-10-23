import axios from 'axios';

const getBaseURL = () => {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `http://${window.location.hostname}:8000/api/v1`;
  }
  return 'http://localhost:8000/api/v1';
};

const api = axios.create({
  baseURL: getBaseURL(),
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

export const downloadOutput = (jobId, format = 'xlsx') => {
  const host = (typeof window !== 'undefined' && window.location?.hostname) || 'localhost';
  window.open(`http://${host}:8000/api/v1/jobs/${jobId}/download?format=${format}`, '_blank');
};

export const downloadStageOutput = (jobId, stageName, format = 'xlsx') => {
  const host = (typeof window !== 'undefined' && window.location?.hostname) || 'localhost';
  window.open(`http://${host}:8000/api/v1/jobs/${jobId}/stages/${stageName}/download?format=${format}`, '_blank');
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