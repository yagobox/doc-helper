import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import './App.css';
import DocumentHistory from './components/DocumentHistory';
import SearchHistory from './components/SearchHistory';
import ProgressBar from './components/ProgressBar';

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
  const [uploadProgress, setUploadProgress] = useState({});
  const [currentUploads, setCurrentUploads] = useState([]);
  const [error, setError] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadError, setUploadError] = useState(null);
  const [theme, setTheme] = useState('light');
  const [isDragging, setIsDragging] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const fileInputRef = useRef(null);
  const [exporting, setExporting] = useState(false);

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

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files);
    await handleFiles(files);
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    setIsDragging(false);
    const files = Array.from(event.dataTransfer.files);
    await handleFiles(files);
  };

  const handleFiles = async (files) => {
    if (files.length > 2) {
      setUploadError('You can only upload up to 2 files at once');
      return;
    }

    const validTypes = [
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    const invalidFiles = files.filter(file => !validTypes.includes(file.type));
    if (invalidFiles.length > 0) {
      setUploadError('Only PDF, TXT, and DOC files are allowed');
      return;
    }

    try {
      setUploadError(null);
      setLoading(true);
      
      // Initialize progress for each file
      const newUploads = Array.from(files).map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        progress: 0
      }));
      
      setCurrentUploads(newUploads);
      
      const formData = new FormData();
      files.forEach(file => {
        formData.append('documents', file);
      });

      const xhr = new XMLHttpRequest();
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const totalProgress = (event.loaded / event.total) * 100;
          // Update progress for all files
          setCurrentUploads(prevUploads =>
            prevUploads.map(upload => ({
              ...upload,
              progress: totalProgress
            }))
          );
        }
      };

      const response = await new Promise((resolve, reject) => {
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response);
            } catch (error) {
              reject(new Error('Invalid response format'));
            }
          } else {
            reject(new Error(xhr.statusText));
          }
        };
        
        xhr.onerror = () => reject(new Error('Network error'));
        
        xhr.open('POST', 'http://localhost:5000/upload');
        xhr.send(formData);
      });

      if (!response.success) {
        throw new Error(response.error || 'Upload failed');
      }

      setUploadedFiles(response.files);
      setUploadStatus(`Successfully uploaded ${response.files.length} file(s)`);
      
      // Clear progress bars after a short delay
      setTimeout(() => {
        setCurrentUploads([]);
      }, 1000);
      
    } catch (error) {
      console.error('Upload error:', error);
      setUploadError(error.message || 'Failed to upload files');
      setCurrentUploads([]);
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

  const exportQuery = async (format) => {
    if (!response || !question) return;

    try {
      setExporting(true);
      const exportResponse = await fetch('http://localhost:5000/export-query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          format,
          question,
          answer: response.answer
        })
      });

      if (!exportResponse.ok) {
        throw new Error('Export failed');
      }

      // Create a blob from the response
      const blob = await exportResponse.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `query-result-${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Export error:', err);
      setError('Failed to export query result');
    } finally {
      setExporting(false);
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
        <div className="left-panel">
          <div className="upload-section">
            <h2>Upload Documents</h2>
            <div 
              className={`drop-zone ${isDragging ? 'dragging' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                type="file"
                onChange={handleFileChange}
                accept=".pdf,.txt,.doc,.docx"
                multiple
                ref={fileInputRef}
                style={{ display: 'none' }}
              />
              <div className="upload-content">
                <p>Drag & Drop files here or</p>
                <button onClick={() => fileInputRef.current.click()}>
                  Choose Files
                </button>
                <p className="file-types">Supported formats: PDF, TXT, DOC</p>
              </div>
            </div>
            
            {currentUploads.length > 0 && (
              <div className="upload-progress">
                {currentUploads.map(upload => (
                  <ProgressBar
                    key={upload.id}
                    fileName={upload.name}
                    progress={upload.progress}
                  />
                ))}
              </div>
            )}
            
            {uploadError && (
              <div className="error-message">{uploadError}</div>
            )}
            {uploadStatus && (
              <div className={`upload-status ${uploadedFiles.length > 0 ? 'success' : ''}`}>
                {uploadStatus}
              </div>
            )}
          </div>
          
          <DocumentHistory />
          
          {recentSearches.length > 0 && (
            <RecentSearches 
              searches={recentSearches}
              onSearchClick={handleSearchClick}
              onClear={clearRecentSearches}
            />
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

          {error && (
            <div className="error-message">
              <p>{error}</p>
            </div>
          )}

          {response && (
            <div className="response-container">
              <div className="answer-section">
                <div className="answer-header">
                  <h3>Answer:</h3>
                  <div className="export-buttons">
                    <button 
                      onClick={() => exportQuery('pdf')}
                      disabled={exporting}
                    >
                      Export as PDF
                    </button>
                    <button 
                      onClick={() => exportQuery('doc')}
                      disabled={exporting}
                    >
                      Export as DOC
                    </button>
                  </div>
                </div>
                <div className="answer-content">
                  {response.answer}
                </div>
              </div>
            </div>
          )}
        </div>
        <SearchHistory />
      </main>
    </div>
  );
}

export default App;