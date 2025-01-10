require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdf = require('pdf-parse');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for PDF upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// OpenAI Configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Store PDF content in memory
let pdfContent = null;

// Upload PDF endpoint
app.post('/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded', success: false });
    }

    const dataBuffer = fs.readFileSync(req.file.path);
    const data = await pdf(dataBuffer);
    pdfContent = data.text;

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    console.log('PDF processed successfully:', {
      pages: data.numpages,
      textLength: pdfContent.length
    });

    res.json({
      message: 'PDF successfully processed',
      pageCount: data.numpages,
      success: true
    });
  } catch (error) {
    console.error('Error processing PDF:', error);
    res.status(500).json({
      error: 'Failed to process PDF file',
      details: error.message,
      success: false
    });
  }
});

// Query endpoint
app.post('/query', express.json(), async (req, res) => {
  console.log('Received query:', req.body);

  const { question } = req.body;

  if (!pdfContent) {
    console.log('No PDF content available');
    return res.status(400).json({
      error: 'No PDF document has been uploaded yet',
      success: false
    });
  }

  try {
    console.log('Making OpenAI API call...');
    
    // First, get a summary of the document to reduce context length
    const summaryCompletion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo-16k',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that creates concise summaries of documents, focusing on key information like titles, main topics, and important details.'
        },
        {
          role: 'user',
          content: `Please provide a concise summary of this document, including its title and main topics: ${pdfContent}`
        }
      ],
      max_tokens: 1000,
      temperature: 0.3,
    });

    const documentSummary = summaryCompletion.choices[0].message.content;

    // Then, answer the specific question using the summary
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant that answers questions based on document summaries. 
                   Always base your answers on the provided information only. If the answer cannot be found 
                   in the information provided, say so clearly. Be concise but thorough.`
        },
        {
          role: 'user',
          content: `Document summary: ${documentSummary}\n\nQuestion: ${question}\n\nPlease provide a clear, 
                   concise answer based on the document summary above. If the information isn't available, 
                   please indicate that.`
        }
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    console.log('OpenAI API response received');
    
    const answer = completion.choices[0].message.content.trim();
    console.log('Processed answer:', { length: answer.length });

    res.json({
      answer,
      success: true
    });
  } catch (error) {
    console.error('Error processing query:', error);
    
    // Log more details about the error
    if (error.response) {
      console.error('OpenAI API error response:', {
        status: error.response.status,
        data: error.response.data
      });
    }

    res.status(500).json({
      error: 'Failed to process your question',
      details: error.message,
      success: false
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    pdfLoaded: pdfContent !== null
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    error: err.message || 'Something went wrong!',
    success: false
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log('OpenAI API Key:', process.env.OPENAI_API_KEY ? 'Present' : 'Missing');
});