import React, { useState } from 'react';
import './App.css';

function App() {
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pdfUploaded, setPdfUploaded] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file');
      return;
    }

    setLoading(true);
    setError(null);
    setUploadStatus('Uploading PDF...');

    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const res = await fetch('http://localhost:5000/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to upload PDF');
      }

      setPdfUploaded(true);
      setUploadStatus(`PDF processed successfully (${data.pageCount} pages)`);
      setError(null);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message || 'Failed to upload PDF');
      setUploadStatus('Upload failed');
      setPdfUploaded(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!question.trim() || !pdfUploaded) return;

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
    <div className="app-container">
      <header className="app-header">
        <h1>Doc Helper</h1>
        <p>Upload a PDF and ask questions about it</p>
      </header>

      <main className="main-content">
        <div className="upload-section">
          <label htmlFor="pdf-upload" className="upload-label">
            {pdfUploaded ? '📄 Change PDF Document' : '📄 Upload PDF Document'}
          </label>
          <input
            type="file"
            id="pdf-upload"
            accept=".pdf,application/pdf"
            onChange={handleFileUpload}
            className="file-input"
            disabled={loading}
          />
          {uploadStatus && (
            <div className={`upload-status ${pdfUploaded ? 'success' : ''}`}>
              {uploadStatus}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="question-form">
          <div className="input-group">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={pdfUploaded ? "Ask a question about the document..." : "Upload a PDF first"}
              className="question-input"
              disabled={loading || !pdfUploaded}
            />
            <button 
              type="submit" 
              className="submit-button"
              disabled={loading || !pdfUploaded || !question.trim()}
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