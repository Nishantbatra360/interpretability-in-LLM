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
    // Deprecated: We won't map comments here anymore, use getEvaluatedComments
    return res.data;
  },

  getEvaluatedComments: async (id, skip = 0, limit = 100, search = '', classification = '', sortBy = '') => {
    if (IS_DEMO) {
      try {
        const res = await axios.get(`${PUBLIC_BASE}demo_data/evaluated_${id}.json`);
        let allComments = res.data;
        
        if (classification) {
          allComments = allComments.filter(c => c.predicted_classification === classification || c.classification === classification);
        }
        if (search) {
          const lowerSearch = search.toLowerCase();
          allComments = allComments.filter(c => c.text.toLowerCase().includes(lowerSearch));
        }
        
        if (sortBy === 'confidence_asc') {
          allComments.sort((a, b) => (a.confidence || 0) - (b.confidence || 0));
        } else if (sortBy === 'confidence_desc') {
          allComments.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
        } else if (sortBy === 'prediction') {
          allComments.sort((a, b) => (a.predicted_classification || '').localeCompare(b.predicted_classification || ''));
        } else if (sortBy === 'ground_truth') {
          allComments.sort((a, b) => (a.ground_truth_label || '').localeCompare(b.ground_truth_label || ''));
        }

        allComments = allComments.map(c => {
          let tokens = [];
          try {
            const parsed = typeof c.tokens_json === 'string' ? JSON.parse(c.tokens_json) : c.tokens_json;
            tokens = parsed?.tokens || [];
            
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
        return { total: allComments.length, items: allComments.slice(skip, skip + limit) };
      } catch (e) {
        return { total: 0, items: [] };
      }
    }
    
    let url = `${BASE_URL}/evaluated-comments/${id}?skip=${skip}&limit=${limit}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (classification) url += `&classification=${encodeURIComponent(classification)}`;
    if (sortBy) url += `&sort_by=${encodeURIComponent(sortBy)}`;
    
    const res = await axios.get(url);
    return res.data;
  },
  
  getMetrics: async (id, force = false) => {
    const url = IS_DEMO ? `${PUBLIC_BASE}demo_data/metrics_${id}.json` : `${BASE_URL}/metrics?file_id=${id}${force ? '&force=true' : ''}`;
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
    const res = await axios.post(`${BASE_URL}/upload-csv`, formData);
    return res.data;
  },
  
  deleteFile: async (id) => {
    if (IS_DEMO) throw new Error("Actions are disabled in Demo Mode");
    await axios.delete(`${BASE_URL}/files/${id}`);
  }
};

export default api;
export { IS_DEMO };
