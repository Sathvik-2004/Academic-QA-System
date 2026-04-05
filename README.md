# Academic-QA-System

A Flask-based academic question answering system that combines semantic retrieval and extractive QA to answer questions from uploaded study material.

The app supports PDF, DOCX, and TXT documents, splits content into semantic chunks, retrieves the most relevant chunks, and extracts precise answers using a RoBERTa QA model.

## Features

- Document upload support for PDF, DOCX, and TXT
- Paste text support for quick testing without file upload
- Semantic chunking and embedding-based retrieval
- Two-stage QA pipeline:
  - Stage 1: Retrieve relevant chunks with sentence-transformer embeddings
  - Stage 2: Extract answer spans with RoBERTa (`deepset/roberta-base-squad2`)
- Source chunk transparency with relevance scores
- User authentication with JWT
- Chat session and message history APIs
- MongoDB-backed persistence for auth and chat data
- Chunk-count status display in the UI after training

## Tech Stack

- Backend: Flask
- Frontend: HTML, CSS, JavaScript
- NLP Models: Hugging Face Transformers, PyTorch
- Vector Retrieval: Sentence embeddings (`all-MiniLM-L6-v2`) + cosine similarity
- Database: MongoDB
- Auth: JWT + bcrypt

## Project Structure

```text
Academic-QA-System/
|-- app.py
|-- templates/
|   `-- index.html
|-- static/
|   |-- script.js
|   |-- style.css
|   `-- Logo.png
|-- data/
|-- .gitignore
`-- README.md
```

## Requirements

- Python 3.10+ (3.11 recommended)
- MongoDB running locally at `mongodb://localhost:27017/`
- Internet connection on first run to download model weights

## Installation

1. Clone the repository:

```bash
git clone https://github.com/Sathvik-2004/Academic-QA-System.git
cd Academic-QA-System
```

2. Create and activate a virtual environment:

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

macOS/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

3. Install dependencies:

```bash
pip install flask transformers PyPDF2 python-docx torch pymongo PyJWT bcrypt
```

## Run the Application

```bash
python app.py
```

App URL:

- `http://127.0.0.1:5000`

## How to Use

1. Open the app in your browser.
2. Upload a PDF/DOCX/TXT file or paste text in the right panel.
3. Wait for training to complete.
4. Ask questions in the chat input.
5. Review answer confidence and supporting source chunks.

## API Overview

### Core Endpoints

- `GET /` - Main web interface
- `POST /upload` - Upload document or text and train chunk embeddings
- `POST /ask` - Ask a question against trained document context
- `GET /status` - Current training status (`trained`, `filename`, `num_chunks`)

### Authentication Endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

### Chat Session Endpoints

- `GET /api/sessions`
- `POST /api/sessions`
- `PUT /api/sessions/<session_id>`
- `DELETE /api/sessions/<session_id>`
- `GET /api/sessions/<session_id>/messages`
- `POST /api/sessions/<session_id>/messages`
- `DELETE /api/sessions/clear`

## Configuration Notes

- Default max upload size is 16 MB.
- JWT secret key is read from `SECRET_KEY` environment variable.
- Default MongoDB database name is `academic_qa_db`.

Recommended production configuration:

- Set a strong `SECRET_KEY`
- Use a managed MongoDB instance
- Run Flask behind a production WSGI server

## Known Limitations

- First startup can be slow due to model download/loading.
- Large documents increase embedding and response time.
- If MongoDB is not running, chat history features are unavailable.

## Author

Sathvik-2004

## License

This project currently has no explicit license file.
If you plan to open-source for reuse, add a license such as MIT.
