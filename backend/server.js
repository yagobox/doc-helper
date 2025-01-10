require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdf = require('pdf-parse');
const OpenAI = require('openai');
const NodeCache = require('node-cache');
const { v4: uuidv4 } = require('uuid');
const { PDFDocument: PDFLib } = require('pdf-lib');
const mammoth = require('mammoth');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun } = require('docx');

const app = express();
const PORT = process.env.PORT || 5000;

// Cache configuration (30 minuti di TTL)
const queryCache = new NodeCache({ stdTTL: 1800 });

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for PDF upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const fileId = uuidv4();
    cb(null, `${fileId}.${file.originalname.split('.').pop()}`);
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, TXT, and DOC files are allowed.'));
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 2 // massimo 2 file
  }
});

// OpenAI Configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Store PDF content, files, and history
let pdfContents = [];
let embeddings = [];
let pdfFiles = new Map(); // Store PDF files for preview
let documentHistory = []; // Store upload history
let searchHistory = [];

// Function to add document to history
const addToHistory = (doc) => {
  const historyEntry = {
    id: uuidv4(),
    filename: doc.name,
    uploadDate: new Date().toISOString(),
    pages: doc.pages,
    size: doc.size
  };
  documentHistory.unshift(historyEntry); // Add to beginning of array
  // Keep only last 50 entries
  if (documentHistory.length > 50) {
    documentHistory = documentHistory.slice(0, 50);
  }
  return historyEntry;
};

// Function to add search to history
const addSearchToHistory = (question, answer, timestamp = new Date()) => {
  const searchEntry = {
    id: uuidv4(),
    question,
    answer,
    timestamp
  };
  searchHistory.unshift(searchEntry);
  // Keep only last 100 searches
  if (searchHistory.length > 100) {
    searchHistory = searchHistory.slice(0, 100);
  }
  return searchEntry;
};

// Cleanup function for PDF files
function cleanupPdfFile(fileId) {
  setTimeout(() => {
    const filePath = pdfFiles.get(fileId);
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      pdfFiles.delete(fileId);
    }
  }, 1800000); // 30 minutes
}

// Utility function to split text into chunks
function splitIntoChunks(text, maxChunkSize = 2000) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  const chunks = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= maxChunkSize) {
      currentChunk += sentence;
    } else {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = sentence;
    }
  }
  if (currentChunk) chunks.push(currentChunk.trim());
  
  return chunks;
}

// Function to get embeddings for text
async function getEmbedding(text) {
  const response = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: text,
  });
  return response.data[0].embedding;
}

// Function to calculate cosine similarity
function cosineSimilarity(vecA, vecB) {
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const normA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const normB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  return dotProduct / (normA * normB);
}

// Function to find most relevant chunks
async function findRelevantChunks(question, numChunks = 3) {
  const questionEmbedding = await getEmbedding(question);
  
  const allChunks = embeddings.flatMap((docEmbeddings, docIndex) => 
    docEmbeddings.map((emb, chunkIndex) => ({
      docIndex,
      chunkIndex,
      similarity: cosineSimilarity(questionEmbedding, emb)
    }))
  );

  return allChunks
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, numChunks);
}

// Function to process document based on its type
const processDocument = async (file) => {
  const fileId = uuidv4();
  let text = '';
  let pages = 1;

  try {
    const dataBuffer = fs.readFileSync(file.path);

    switch (file.mimetype) {
      case 'application/pdf':
        const pdfDoc = await PDFLib.load(dataBuffer);
        pages = pdfDoc.getPageCount();
        const pdfData = await pdf(dataBuffer);
        text = pdfData.text;
        break;

      case 'text/plain':
        text = dataBuffer.toString('utf-8');
        // Count pages for txt (approximate by newlines)
        pages = Math.ceil(text.split('\n').length / 45); // ~45 lines per page
        break;

      case 'application/msword':
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        // For DOC files, we'll need to extract text using mammoth
        const result = await mammoth.extractRawText({ buffer: dataBuffer });
        text = result.value;
        // Approximate pages for doc (by characters)
        pages = Math.ceil(text.length / 3000); // ~3000 chars per page
        break;
    }

    const docInfo = {
      id: fileId,
      name: file.originalname,
      pages: pages,
      size: file.size,
      text: text,
      type: file.mimetype,
      chunks: splitIntoChunks(text)
    };

    return docInfo;
  } catch (error) {
    console.error(`Error processing ${file.originalname}:`, error);
    throw error;
  }
};

// Function to generate PDF report
const generatePDFReport = async (data, type = 'query') => {
  const doc = new PDFDocument();
  const filename = `${type}-report-${Date.now()}.pdf`;
  const filePath = path.join(__dirname, 'temp', filename);

  // Ensure temp directory exists
  if (!fs.existsSync(path.join(__dirname, 'temp'))) {
    fs.mkdirSync(path.join(__dirname, 'temp'));
  }

  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  // Add header
  doc.fontSize(20).text(`${type === 'query' ? 'Query Result' : 'Search History'} Report`, {
    align: 'center'
  });
  doc.moveDown();

  if (type === 'query') {
    // Single query result
    doc.fontSize(14).text('Question:', { underline: true });
    doc.fontSize(12).text(data.question);
    doc.moveDown();
    doc.fontSize(14).text('Answer:', { underline: true });
    doc.fontSize(12).text(data.answer);
  } else {
    // Search history
    data.forEach((item, index) => {
      doc.fontSize(14).text(`Search ${index + 1}:`, { underline: true });
      doc.fontSize(12).text(`Time: ${new Date(item.timestamp).toLocaleString()}`);
      doc.fontSize(12).text(`Question: ${item.question}`);
      doc.fontSize(12).text(`Answer: ${item.answer}`);
      doc.moveDown();
    });
  }

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
};

// Function to generate DOC report
const generateDOCReport = async (data, type = 'query') => {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          text: `${type === 'query' ? 'Query Result' : 'Search History'} Report`,
          heading: 'Heading1',
          spacing: { after: 200 }
        })
      ]
    }]
  });

  if (type === 'query') {
    // Single query result
    doc.addSection({
      children: [
        new Paragraph({
          children: [new TextRun({ text: 'Question:', bold: true })],
          spacing: { after: 100 }
        }),
        new Paragraph({
          text: data.question,
          spacing: { after: 200 }
        }),
        new Paragraph({
          children: [new TextRun({ text: 'Answer:', bold: true })],
          spacing: { after: 100 }
        }),
        new Paragraph({
          text: data.answer
        })
      ]
    });
  } else {
    // Search history
    data.forEach((item, index) => {
      doc.addSection({
        children: [
          new Paragraph({
            children: [new TextRun({ text: `Search ${index + 1}:`, bold: true })],
            spacing: { after: 100 }
          }),
          new Paragraph({
            text: `Time: ${new Date(item.timestamp).toLocaleString()}`
          }),
          new Paragraph({
            text: `Question: ${item.question}`
          }),
          new Paragraph({
            text: `Answer: ${item.answer}`
          }),
          new Paragraph({
            text: '',
            spacing: { after: 200 }
          })
        ]
      });
    });
  }

  const filename = `${type}-report-${Date.now()}.docx`;
  const filePath = path.join(__dirname, 'temp', filename);

  // Ensure temp directory exists
  if (!fs.existsSync(path.join(__dirname, 'temp'))) {
    fs.mkdirSync(path.join(__dirname, 'temp'));
  }

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buffer);
  return filePath;
};

// Upload PDF endpoint
app.post('/upload', (req, res) => {
  upload.array('documents', 2)(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        error: err.message
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded'
      });
    }

    try {
      const processedFiles = [];
      
      for (const file of req.files) {
        try {
          const docInfo = await processDocument(file);
          pdfContents.push(docInfo);
          pdfFiles.set(docInfo.id, file);
          
          // Add to history
          const historyEntry = addToHistory(docInfo);
          
          processedFiles.push({
            id: docInfo.id,
            name: docInfo.name,
            pages: docInfo.pages,
            size: docInfo.size,
            type: docInfo.type,
            historyId: historyEntry.id
          });
        } catch (err) {
          console.error(`Error processing file ${file.originalname}:`, err);
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        }
      }

      if (processedFiles.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid files were processed'
        });
      }

      res.json({
        success: true,
        files: processedFiles
      });
    } catch (error) {
      console.error('Upload error:', error);
      if (req.files) {
        req.files.forEach(file => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }
      res.status(500).json({
        success: false,
        error: 'Internal server error during file upload'
      });
    }
  });
});

// Serve PDF files for preview
app.get('/pdf/:fileId', (req, res) => {
  const filePath = pdfFiles.get(req.params.fileId);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'PDF not found' });
  }
  res.sendFile(filePath);
});

// Get document history endpoint
app.get('/history', (req, res) => {
  res.json({
    success: true,
    history: documentHistory
  });
});

// Get specific document history entry
app.get('/history/:id', (req, res) => {
  const historyEntry = documentHistory.find(entry => entry.id === req.params.id);
  if (!historyEntry) {
    return res.status(404).json({
      success: false,
      error: 'History entry not found'
    });
  }
  res.json({
    success: true,
    entry: historyEntry
  });
});

// Get search history endpoint
app.get('/search-history', (req, res) => {
  res.json({
    success: true,
    history: searchHistory
  });
});

// Export query result endpoint
app.post('/export-query', async (req, res) => {
  try {
    const { format, question, answer } = req.body;
    
    if (!question || !answer) {
      return res.status(400).json({
        success: false,
        error: 'Question and answer are required'
      });
    }

    let filePath;
    if (format === 'pdf') {
      filePath = await generatePDFReport({ question, answer }, 'query');
    } else if (format === 'doc') {
      filePath = await generateDOCReport({ question, answer }, 'query');
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid format. Use pdf or doc'
      });
    }

    res.download(filePath, path.basename(filePath), (err) => {
      if (err) {
        console.error('Download error:', err);
      }
      // Clean up file after sending
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) console.error('Error deleting temp file:', unlinkErr);
      });
    });
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate export file'
    });
  }
});

// Export search history endpoint
app.post('/export-history', async (req, res) => {
  try {
    const { format } = req.body;
    
    if (searchHistory.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No search history available'
      });
    }

    let filePath;
    if (format === 'pdf') {
      filePath = await generatePDFReport(searchHistory, 'history');
    } else if (format === 'doc') {
      filePath = await generateDOCReport(searchHistory, 'history');
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid format. Use pdf or doc'
      });
    }

    res.download(filePath, path.basename(filePath), (err) => {
      if (err) {
        console.error('Download error:', err);
      }
      // Clean up file after sending
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) console.error('Error deleting temp file:', unlinkErr);
      });
    });
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate export file'
    });
  }
});

// Query endpoint
app.post('/query', express.json(), async (req, res) => {
  console.log('Received query:', req.body);
  const { question } = req.body;
  
  try {
    // Check cache first
    const cacheKey = question.toLowerCase().trim();
    const cachedResponse = queryCache.get(cacheKey);
    if (cachedResponse) {
      console.log('Returning cached response');
      addSearchToHistory(question, cachedResponse);
      return res.json({
        answer: cachedResponse,
        success: true,
        cached: true
      });
    }

    // Existing query logic...
    const relevantChunks = await findRelevantChunks(question);
    
    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that answers questions about PDF documents. When referring to content from specific documents, mention the document name in your answer. Be concise but thorough."
        },
        {
          role: "user",
          content: `Context from documents:\n${relevantChunks.map(({ docIndex, chunkIndex }) => {
            const doc = pdfContents[docIndex];
            return `[Document: ${doc.name}]\n${doc.chunks[chunkIndex]}`;
          }).join('\n\n')}\n\nQuestion: ${question}\n\nProvide a clear answer based on the context above. If the information isn't available in the provided context, please indicate that.`
        }
      ],
      model: "gpt-3.5-turbo",
      temperature: 0.7,
    });

    const answer = completion.choices[0].message.content;
    
    // Add to search history
    addSearchToHistory(question, answer);

    // Cache the response
    queryCache.set(cacheKey, answer);

    res.json({
      answer,
      success: true,
      cached: false
    });
  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process query'
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    pdfLoaded: pdfContents.length > 0,
    documentsInfo: pdfContents.map(doc => ({
      name: doc.name,
      pages: doc.pages,
      chunks: doc.chunks.length
    }))
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});