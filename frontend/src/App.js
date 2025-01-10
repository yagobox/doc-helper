import React, { useState, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import './App.css';

// Workaround for react-pdf
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

function PdfPreview({ fileId, fileName }) {
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages);
  }

  return (
    <div className="pdf-preview">
      <div className="pdf-header">
        <h3>{fileName}</h3>
        <div className="pdf-controls">
          <button 
            onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
            disabled={currentPage <= 1}
          >
            ←
          </button>
          <span>Page {currentPage} of {numPages}</span>
          <button 
            onClick={() => setCurrentPage(page => Math.min(numPages, page + 1))}
            disabled={currentPage >= numPages}
          >
            →
          </button>
        </div>
      </div>
      <div className="pdf-container">
        <Document
          file={`http://localhost:5000/pdf/${fileId}`}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<div>Loading PDF...</div>}
          error={<div>Error loading PDF!</div>}
        >
          <Page 
            pageNumber={currentPage} 
            scale={1.2}
            loading={<div>Loading page...</div>}
          />
        </Document>
      </div>
    </div>
  );
}

function RecentSearches({ searches, onSearchClick, onClear }) {
  if (searches.length === 0) return null;

  return (
    <div className="recent-searches">
      <div className="recent-searches-header">
        <h3>Recent Searches</h3>
        <button onClick={onClear} className="clear-button">
          Clear History
        </button>
      </div>
      <div className="searches-list">
        {searches.map((search, index) => (
          <div key={index} className="search-item" onClick={() => onSearchClick(search)}>
            <span className="search-text">{search.question}</span>
            <span className="search-time">
              {new Date(search.timestamp).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploadStatus, setUploadStatus] = useState('');
  const [theme, setTheme] = useState('light');
  const [isDragging, setIsDragging] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);

  useEffect(() => {
    // Recupera il tema salvato dal localStorage o usa il tema chiaro come default
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
    document.body.className = `${savedTheme}-theme`;

    // Carica le ricerche recenti dal localStorage
    const savedSearches = localStorage.getItem('recentSearches');
    if (savedSearches) {
      setRecentSearches(JSON.parse(savedSearches));
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.body.className = `${newTheme}-theme`;
  };

  const addToRecentSearches = (question, answer) => {
    const newSearch = {
      question,
      answer,
      timestamp: new Date().toISOString()
    };

    const updatedSearches = [newSearch, ...recentSearches.slice(0, 9)]; // Mantieni solo le ultime 10 ricerche
    setRecentSearches(updatedSearches);
    localStorage.setItem('recentSearches', JSON.stringify(updatedSearches));
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem('recentSearches');
  };

  const handleSearchClick = (search) => {
    setQuestion(search.question);
    setResponse({ answer: search.answer, success: true, cached: true });
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      handleFileUpload(Array.from(droppedFiles));
    }
  };

  const handleManualUpload = (e) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      handleFileUpload(Array.from(selectedFiles));
    }
  };

  const handleFileUpload = async (files) => {
    if (!Array.isArray(files) || files.length === 0) {
      setUploadStatus('No files selected');
      return;
    }
    
    if (files.length > 2) {
      setUploadStatus('Maximum 2 PDF files allowed');
      return;
    }

    // Verifica che tutti i file siano PDF
    for (let file of files) {
      if (!file.type || file.type !== 'application/pdf') {
        setUploadStatus('Only PDF files are allowed');
        return;
      }
    }

    setLoading(true);
    setError(null);
    setUploadStatus('Uploading PDFs...');

    try {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('pdf', file);
      });

      const res = await fetch('http://localhost:5000/upload', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to upload PDFs');
      }

      if (!data.files || !Array.isArray(data.files)) {
        throw new Error('Invalid response from server');
      }

      setUploadedFiles(data.files);
      setUploadStatus(
        `Successfully uploaded ${data.files.length} PDF${data.files.length > 1 ? 's' : ''}`
      );
    } catch (err) {
      console.error('Upload error:', err);
      setUploadStatus('Upload failed: ' + (err.message || 'Unknown error'));
      setUploadedFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!question.trim() || uploadedFiles.length === 0) return;

    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch('http://localhost:5000/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to get response');
      }

      setResponse(data);
      addToRecentSearches(question, data.answer);
      setError(null);
    } catch (err) {
      console.error('Query error:', err);
      setError(err.message || 'Failed to get response');
      setResponse(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`app-container ${theme}-theme`}>
      <button className="theme-toggle" onClick={toggleTheme}>
        {theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode'}
      </button>
      <header className="app-header">
        <h1>Doc Helper</h1>
        <p>Upload PDFs and ask questions about them</p>
      </header>

      <main className="main-content">
        <div 
          className={`upload-section ${isDragging ? 'dragging' : ''}`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <label htmlFor="pdf-upload" className="upload-label">
            {uploadedFiles.length > 0 ? '📄 Change PDF Documents' : '📄 Upload PDF Documents'}
          </label>
          <p className="drag-text">
            Drag and drop up to 2 PDFs here or click to select
          </p>
          <input
            type="file"
            id="pdf-upload"
            accept=".pdf,application/pdf"
            onChange={handleManualUpload}
            className="file-input"
            disabled={loading}
            multiple
          />
          {uploadStatus && (
            <div className={`upload-status ${uploadedFiles.length > 0 ? 'success' : ''}`}>
              {uploadStatus}
            </div>
          )}
        </div>

        {uploadedFiles.length > 0 && (
          <div className="previews-container">
            {uploadedFiles.map((file) => (
              <PdfPreview 
                key={file.fileId}
                fileId={file.fileId}
                fileName={file.name}
              />
            ))}
          </div>
        )}

        <div className="interaction-section">
          <form onSubmit={handleSubmit} className="question-form">
            <div className="input-group">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={uploadedFiles.length > 0 ? "Ask a question about the documents..." : "Upload PDFs first"}
                className="question-input"
                disabled={loading || uploadedFiles.length === 0}
              />
              <button 
                type="submit" 
                className="submit-button"
                disabled={loading || uploadedFiles.length === 0 || !question.trim()}
              >
                {loading ? 'Processing...' : 'Ask'}
              </button>
            </div>
          </form>

          <RecentSearches 
            searches={recentSearches}
            onSearchClick={handleSearchClick}
            onClear={clearRecentSearches}
          />
        </div>

        {error && (
          <div className="error-message">
            <p>{error}</p>
          </div>
        )}

        {response && (
          <div className="response-container">
            <div className="answer-section">
              <h3>Answer:</h3>
              <div className="answer-content">
                {response.answer}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;