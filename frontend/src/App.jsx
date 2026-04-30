import { useState, useEffect } from 'react';
import axios from 'axios';
import DashboardLayout from './components/DashboardLayout';
import ClassificationPanel from './components/ClassificationPanel';
import FairnessMetrics from './components/FairnessMetrics';
import BulkUploadPanel from './components/BulkUploadPanel';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState('bulk');

  return (
    <DashboardLayout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'bulk' && <BulkUploadPanel />}
      {activeTab === 'classify' && <ClassificationPanel />}
      {activeTab === 'metrics' && <FairnessMetrics />}
    </DashboardLayout>
  );
}

export default App;
