import { useState, useEffect } from 'react';
import axios from 'axios';
import DashboardLayout from './components/DashboardLayout';
import ClassificationPanel from './components/ClassificationPanel';
import FairnessMetrics from './components/FairnessMetrics';
import BulkUploadPanel from './components/BulkUploadPanel';
import DocumentationHome from './components/DocumentationHome';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [deepDiveText, setDeepDiveText] = useState('');
  
  // Persistent process states
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluatingFileId, setEvaluatingFileId] = useState(null);
  const [evaluationProgress, setEvaluationProgress] = useState({ evaluated: 0, pending: 0, batchSize: 0, startEvaluated: 0 });
  
  const [isScanning, setIsScanning] = useState(false);
  const [scanningFileId, setScanningFileId] = useState(null);

  const handleDeepDive = (text) => {
    setDeepDiveText(text);
    setActiveTab('classify');
  };

  return (
    <DashboardLayout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'home' && <DocumentationHome />}
      {activeTab === 'bulk' && (
        <BulkUploadPanel 
          isEvaluating={isEvaluating} 
          setIsEvaluating={setIsEvaluating} 
          evaluatingFileId={evaluatingFileId}
          setEvaluatingFileId={setEvaluatingFileId}
          progress={evaluationProgress}
          setProgress={setEvaluationProgress}
        />
      )}
      {activeTab === 'classify' && <ClassificationPanel initialText={deepDiveText} />}
      {activeTab === 'metrics' && (
        <FairnessMetrics 
          onDeepDive={handleDeepDive} 
          isScanning={isScanning}
          setIsScanning={setIsScanning}
          scanningFileId={scanningFileId}
          setScanningFileId={setScanningFileId}
        />
      )}
    </DashboardLayout>
  );
}

export default App;
