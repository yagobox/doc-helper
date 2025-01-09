import React, { useState } from 'react';

function App() {
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState('');

  const handleSubmit = async () => {
    const res = await fetch('http://localhost:5000/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();
    setResponse(data.answer);
  };

  return (
    <div className="App">
      <h1>Documentazione Q&A h1749</h1>
      <div className="prompt-box">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Inserisci la tua domanda"
          className="prompt-input"
        />
        <button onClick={handleSubmit} className="prompt-button">Invia</button>
      </div>
      <div className="response">
        <pre>{response}</pre>
      </div>
    </div>
  );
}

export default App; 