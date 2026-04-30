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
        // Robust mapping for demo data
        res.data.comments = (commentsRes.data || []).map(c => {
          let tokens = [];
          try {
            const parsed = typeof c.tokens_json === 'string' ? JSON.parse(c.tokens_json) : c.tokens_json;
            tokens = parsed?.tokens || [];
            
            // Aggressive fallback for nested tokens
            if (!tokens || tokens.length === 0) {
              if (parsed?.raw_response) {
                const raw = typeof parsed.raw_response === 'string' ? JSON.parse(parsed.raw_response) : parsed.raw_response;
                tokens = raw?.tokens || [];
              }
            }
            if (!tokens || tokens.length === 0) {
              if (c.identity_response) {
                const id_resp = typeof c.identity_response === 'string' ? JSON.parse(c.identity_response) : c.identity_response;
                tokens = id_resp?.tokens || [];
              }
            }
          } catch (e) { tokens = []; }
          
          return {
            ...c,
            classification: c.predicted_classification || c.classification,
            tokens: tokens
          };
        });
      } catch (e) {
        res.data.comments = [];
      }
    }
    return res.data;
  },
  
  getMetrics: async (id) => {
    const url = IS_DEMO ? `${PUBLIC_BASE}demo_data/metrics_${id}.json` : `${BASE_URL}/metrics?file_id=${id}`;
    const res = await axios.get(url);
    const data = res.data;
    // Ensure data has the expected structure
    if (IS_DEMO && !data.subgroups) {
      return { subgroups: [], worst_case: null };
    }
    return data;
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
