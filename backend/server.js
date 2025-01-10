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
const { PDFDocument } = require('pdf-lib');

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
    cb(null, `${fileId}.pdf`);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'), false);
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

// Store PDF content and files in memory
let pdfContents = [];
let embeddings = [];
let pdfFiles = new Map(); // Store PDF files for preview

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

// Upload PDF endpoint
app.post('/upload', (req, res) => {
  upload.array('pdf', 2)(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: 'File size too large. Maximum size is 50MB'
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          success: false,
          error: 'Too many files. Maximum is 2 files'
        });
      }
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
          const pdfBytes = fs.readFileSync(file.path);
          const pdfDoc = await PDFDocument.load(pdfBytes);
          const data = await pdf(pdfBytes);
          const chunks = splitIntoChunks(data.text);
          
          // Get embeddings for each chunk
          const chunkEmbeddings = await Promise.all(
            chunks.map(chunk => getEmbedding(chunk))
          );

          const fileId = path.parse(file.filename).name;
          pdfFiles.set(fileId, file.path);
          
          // Schedule cleanup
          cleanupPdfFile(fileId);

          pdfContents.push({
            text: data.text,
            name: file.originalname,
            pages: data.numpages,
            chunks,
            fileId
          });
          
          embeddings.push(chunkEmbeddings);

          processedFiles.push({
            fileId: fileId,
            name: file.originalname,
            path: file.path,
            pages: pdfDoc.getPageCount()
          });
        } catch (err) {
          console.error(`Error processing PDF ${file.originalname}:`, err);
          // Elimina il file se c'è un errore nel processarlo
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        }
      }

      if (processedFiles.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid PDF files were processed'
        });
      }

      // Imposta il timer per la pulizia dei file
      processedFiles.forEach(file => {
        setTimeout(() => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
            console.log(`Cleaned up file: ${file.path}`);
          }
        }, 30 * 60 * 1000); // 30 minuti
      });

      res.json({
        success: true,
        files: processedFiles
      });

    } catch (error) {
      console.error('Upload error:', error);
      // Pulisci i file in caso di errore
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

// Query endpoint
app.post('/query', express.json(), async (req, res) => {
  console.log('Received query:', req.body);

  const { question } = req.body;

  if (pdfContents.length === 0) {
    console.log('No PDF content available');
    return res.status(400).json({
      error: 'No PDF documents have been uploaded yet',
      success: false
    });
  }

  try {
    // Check cache first
    const cacheKey = question.toLowerCase().trim();
    const cachedResponse = queryCache.get(cacheKey);
    if (cachedResponse) {
      console.log('Returning cached response');
      return res.json({
        answer: cachedResponse,
        success: true,
        cached: true
      });
    }

    // Find most relevant chunks
    const relevantChunks = await findRelevantChunks(question);
    
    // Build context from relevant chunks
    const context = relevantChunks.map(({ docIndex, chunkIndex }) => {
      const doc = pdfContents[docIndex];
      return `[Document: ${doc.name}]\n${doc.chunks[chunkIndex]}`;
    }).join('\n\n');

    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that answers questions about PDF documents. When referring to content from specific documents, mention the document name in your answer. Be concise but thorough."
        },
        {
          role: "user",
          content: `Context from documents:\n${context}\n\nQuestion: ${question}\n\nProvide a clear answer based on the context above. If the information isn't available in the provided context, please indicate that.`
        }
      ],
      model: "gpt-3.5-turbo",
      temperature: 0.7,
    });

    console.log('OpenAI API response received');
    
    const answer = completion.choices[0].message.content;
    
    // Cache the response
    queryCache.set(cacheKey, answer);

    res.json({
      answer,
      success: true,
      cached: false
    });

  } catch (error) {
    console.error('Error processing query:', error);
    res.status(500).json({
      error: 'Failed to process query',
      details: error.message,
      success: false
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