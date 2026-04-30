import axios from 'axios';

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';
const BASE_URL = 'http://127.0.0.1:8004';
const PUBLIC_BASE = import.meta.env.BASE_URL;

const api = {
  getFiles: async () => {
    const url = IS_DEMO ? `${PUBLIC_BASE}demo_data/files.json` : `${BASE_URL}/files`;
    const res = await axios.get(url);
    return res.data;
  },
  
  getFileState: async (id) => {
    const url = IS_DEMO ? `${PUBLIC_BASE}demo_data/file_state_${id}.json` : `${BASE_URL}/file-state/${id}`;
    const res = await axios.get(url);
    
    if (IS_DEMO) {
      try {
        const commentsRes = await axios.get(`${PUBLIC_BASE}demo_data/evaluated_comments_${id}.json`);
        // Map DB keys to Frontend keys
        res.data.comments = (commentsRes.data || []).map(c => ({
          ...c,
          classification: c.predicted_classification,
          tokens: c.tokens_json ? JSON.parse(c.tokens_json).tokens : []
        }));
      } catch (e) {
        res.data.comments = [];
      }
    }
    return res.data;
  },
  
  getMetrics: async (id) => {
    const url = IS_DEMO ? `${PUBLIC_BASE}demo_data/metrics_${id}.json` : `${BASE_URL}/metrics?file_id=${id}`;
    const res = await axios.get(url);
    return res.data;
  },
  
  // Actions that should be disabled in demo
  uploadFile: async (formData) => {
    if (IS_DEMO) throw new Error("Actions are disabled in Demo Mode");
    const res = await axios.post(`${BASE_URL}/upload`, formData);
    return res.data;
  },
  
  deleteFile: async (id) => {
    if (IS_DEMO) throw new Error("Actions are disabled in Demo Mode");
    await axios.delete(`${BASE_URL}/files/${id}`);
  }
};

export default api;
export { IS_DEMO };
