import { useState } from 'react';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import UploadPage from './pages/Upload';
import SalesAnalysis from './pages/SalesAnalysis';

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard />;
      case 'upload': return <UploadPage />;
      case 'analysis': return <SalesAnalysis />;
      default: return <Dashboard />;
    }
  };

  return (
    <Layout onNavigate={setCurrentPage} currentPage={currentPage}>
      {renderPage()}
    </Layout>
  );
}

export default App;
