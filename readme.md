# Doc-Helper

An AI-powered documentation assistant that leverages advanced language models to analyze and respond to queries about PDF documents.

## Project Overview

Doc-Helper is a modern web application that enables users to interact with PDF documents through natural language processing. Key features include:
- Natural language query processing
- Real-time PDF document analysis
- Context-aware response generation
- Multi-document support (up to 2 PDFs simultaneously)
- Dark/Light theme support
- Drag-and-drop file upload
- Recent searches history

## Technical Architecture

### Frontend (React.js)

The frontend is built with modern React.js (v18+) and implements:
- **State Management**: React Hooks for local state management
- **File Handling**: 
  - Custom drag-and-drop implementation
  - PDF preview using `react-pdf`
  - File size validation (max 50MB)
  - MIME type verification
- **UI Components**:
  - Responsive layout with CSS Grid/Flexbox
  - Theme switching with CSS variables
  - Error boundary implementation
  - Loading states and progress indicators
- **Local Storage**: 
  - Theme preference persistence
  - Recent searches caching

### Backend (Node.js/Express)

The server implements a robust architecture for handling document processing:

1. **File Processing Pipeline**:
   ```javascript
   Upload → Validation → PDF Parsing → Text Extraction → Chunk Generation → Embedding Creation
   ```

2. **Core Components**:
   - Express.js server with CORS support
   - Multer for file upload handling
   - PDF parsing using pdf-lib and pdf-parse
   - OpenAI API integration for embeddings and query processing
   - Node-cache for response caching (30-minute TTL)

3. **Security Features**:
   - File type validation
   - Size limitations
   - Automatic file cleanup
   - Error handling and sanitization

## Technical Stack

### Frontend Dependencies
- React 18+
- react-pdf: PDF rendering
- CSS Modules: Styling
- Web APIs: File handling, LocalStorage

### Backend Dependencies
- Node.js 16+
- Express: Web framework
- multer: File upload handling
- pdf-lib: PDF processing
- pdf-parse: Text extraction
- node-cache: Response caching
- uuid: Unique file identification
- OpenAI API: Text embeddings and processing

### Development Tools
- ESLint: Code linting
- Prettier: Code formatting
- nodemon: Development server
- Create React App: Frontend tooling

## Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/doc-helper.git
   cd doc-helper
   ```

2. Install dependencies:
   ```bash
   # Backend
   cd backend
   npm install

   # Frontend
   cd ../frontend
   npm install
   ```

3. Configure environment variables:
   ```bash
   # Backend
   cp .env.example .env
   ```
   Required variables:
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `PORT`: Backend server port (default: 5000)
   - `MAX_FILE_SIZE`: Maximum file size in bytes (default: 50MB)

4. Start the development servers:
   ```bash
   # Backend
   cd backend
   npm run dev

   # Frontend
   cd frontend
   npm start
   ```

The application will be available at `http://localhost:3000`

## API Endpoints

### POST /upload
- Handles PDF file uploads
- Accepts multipart/form-data
- Returns file metadata and processing status

### POST /query
- Processes natural language queries
- Accepts JSON payload with question
- Returns AI-generated response based on document context

## Implementation Details

### PDF Processing
1. Files are uploaded and temporarily stored
2. Text is extracted and split into chunks
3. Embeddings are generated for each chunk
4. Chunks are cached for 30 minutes
5. Files are automatically cleaned up

### Query Processing
1. User query is received
2. Relevant chunks are identified using cosine similarity
3. Context is constructed from matching chunks
4. OpenAI API generates response
5. Response is cached for future similar queries

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

Please ensure your code:
- Passes ESLint checks
- Includes appropriate tests
- Follows the existing code style
- Is well documented

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Technical Requirements

- Node.js 16+
- npm 7+
- Modern web browser with ES6+ support
- OpenAI API key
- Minimum 1GB RAM
- 100MB free disk space