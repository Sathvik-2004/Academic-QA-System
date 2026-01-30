from flask import Flask, render_template, request, jsonify
from transformers import AutoTokenizer, AutoModel
from PyPDF2 import PdfReader
from docx import Document
import torch
import torch.nn.functional as F
import os
import re

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Initialize the model for semantic embeddings
print("Loading embedding model... This may take a moment.")
model_name = 'sentence-transformers/all-MiniLM-L6-v2'
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModel.from_pretrained(model_name)
model.eval()
print("Model loaded successfully!")

# Global storage for document embeddings (trained on user's document)
document_store = {
    'chunks': [],           # Original text chunks
    'embeddings': None,     # Embeddings of chunks (the "trained" knowledge)
    'filename': None        # Current document name
}

def mean_pooling(model_output, attention_mask):
    """Mean pooling to get sentence embeddings."""
    token_embeddings = model_output[0]
    input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
    return torch.sum(token_embeddings * input_mask_expanded, 1) / torch.clamp(input_mask_expanded.sum(1), min=1e-9)

def get_embeddings(texts):
    """Get embeddings for a list of texts."""
    encoded_input = tokenizer(texts, padding=True, truncation=True, max_length=512, return_tensors='pt')
    
    with torch.no_grad():
        model_output = model(**encoded_input)
    
    embeddings = mean_pooling(model_output, encoded_input['attention_mask'])
    embeddings = F.normalize(embeddings, p=2, dim=1)
    return embeddings

def extract_text_from_pdf(file):
    """Extract text from a PDF file with better formatting preservation."""
    try:
        pdf_reader = PdfReader(file)
        text = ""
        for page in pdf_reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n\n"
        return text.strip()
    except Exception as e:
        raise Exception(f"Failed to extract text from PDF: {str(e)}")

def extract_text_from_docx(file):
    """Extract text from a Word document."""
    try:
        doc = Document(file)
        text = ""
        for paragraph in doc.paragraphs:
            if paragraph.text.strip():
                text += paragraph.text + "\n\n"
        # Also extract text from tables
        for table in doc.tables:
            for row in table.rows:
                row_text = []
                for cell in row.cells:
                    if cell.text.strip():
                        row_text.append(cell.text.strip())
                if row_text:
                    text += " | ".join(row_text) + "\n"
        return text.strip()
    except Exception as e:
        raise Exception(f"Failed to extract text from Word document: {str(e)}")

def chunk_text(text, chunk_size=300, overlap=50):
    """
    Split text into overlapping chunks for better semantic search.
    Tries to split on sentence boundaries when possible.
    """
    chunks = []
    
    # First, split into paragraphs
    paragraphs = re.split(r'\n\s*\n', text)
    
    current_chunk = ""
    
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
            
        # If paragraph itself is small enough, add it as is
        if len(para) <= chunk_size:
            if len(current_chunk) + len(para) <= chunk_size:
                current_chunk += " " + para if current_chunk else para
            else:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = para
        else:
            # Save current chunk first
            if current_chunk:
                chunks.append(current_chunk.strip())
                current_chunk = ""
            
            # Split large paragraph into sentences
            sentences = re.split(r'(?<=[.!?])\s+', para)
            
            temp_chunk = ""
            for sent in sentences:
                if len(temp_chunk) + len(sent) <= chunk_size:
                    temp_chunk += " " + sent if temp_chunk else sent
                else:
                    if temp_chunk:
                        chunks.append(temp_chunk.strip())
                    temp_chunk = sent
            
            if temp_chunk:
                current_chunk = temp_chunk
    
    # Don't forget the last chunk
    if current_chunk:
        chunks.append(current_chunk.strip())
    
    # Filter out very small chunks
    chunks = [c for c in chunks if len(c) > 30]
    
    return chunks

def train_on_document(text, filename):
    """
    'Train' the model on the document by creating embeddings.
    This is the core of semantic search - we encode all chunks once.
    """
    global document_store
    
    # Split text into meaningful chunks
    chunks = chunk_text(text)
    
    if not chunks:
        raise Exception("Could not extract meaningful content from the document.")
    
    # Create embeddings for all chunks (this is the "training" step)
    print(f"Training on document: {filename}")
    print(f"Creating embeddings for {len(chunks)} text chunks...")
    
    # Process in batches to avoid memory issues
    batch_size = 32
    all_embeddings = []
    
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]
        batch_embeddings = get_embeddings(batch)
        all_embeddings.append(batch_embeddings)
        print(f"  Processed {min(i + batch_size, len(chunks))}/{len(chunks)} chunks...")
    
    embeddings = torch.cat(all_embeddings, dim=0)
    
    # Store the trained knowledge
    document_store['chunks'] = chunks
    document_store['embeddings'] = embeddings
    document_store['filename'] = filename
    
    print(f"Training complete! Model is now trained on '{filename}'")
    
    return len(chunks)

def find_relevant_chunks(question, top_k=3):
    """
    Find the most relevant chunks from the trained document.
    Uses cosine similarity between question and chunk embeddings.
    """
    global document_store
    
    if document_store['embeddings'] is None:
        return []
    
    # Encode the question
    question_embedding = get_embeddings([question])
    
    # Calculate cosine similarity with all chunks using PyTorch
    similarities = F.cosine_similarity(question_embedding, document_store['embeddings'])
    
    # Get top-k most similar chunks
    top_k = min(top_k, len(document_store['chunks']))
    top_scores, top_indices = torch.topk(similarities, top_k)
    
    results = []
    for score, idx in zip(top_scores, top_indices):
        results.append({
            'chunk': document_store['chunks'][idx.item()],
            'score': float(score.item()),
            'index': int(idx.item())
        })
    
    return results

def convert_to_question_format(query):
    """
    FIX 3: Convert keyword-style queries to proper question format.
    This significantly improves extractive QA performance.
    
    Bad (generative style):
        - "common software testing methodologies"
        - "explain agile testing"
        - "list types of testing"
    
    Good (extractive style):
        - "What are the common software testing methodologies?"
        - "What is agile testing?"
        - "What are the types of testing?"
    """
    query = query.strip()
    
    # If already ends with question mark, likely already a question
    if query.endswith('?'):
        return query
    
    # Check if already starts with a question word
    question_starters = ['what', 'who', 'where', 'when', 'why', 'how', 'which', 'is', 'are', 'do', 'does', 'can', 'could', 'would', 'should', 'will', 'did', 'has', 'have', 'was', 'were']
    query_lower = query.lower()
    
    if any(query_lower.startswith(starter + ' ') for starter in question_starters):
        return query + '?'
    
    # Convert imperative/keyword style to question style
    imperative_mappings = {
        'explain': 'What is',
        'describe': 'What is',
        'define': 'What is',
        'list': 'What are the',
        'give': 'What are',
        'tell': 'What is',
        'show': 'What is',
        'find': 'What is',
        'get': 'What is',
    }
    
    for imperative, question_form in imperative_mappings.items():
        if query_lower.startswith(imperative + ' '):
            remaining = query[len(imperative):].strip()
            return f"{question_form} {remaining}?"
    
    # For simple keyword queries, convert to "What is/are X?"
    # Check if query seems plural
    words = query.split()
    if len(words) > 0:
        # Simple heuristic: if ends with 's' or contains 'types', 'methods', etc.
        plural_indicators = ['types', 'methods', 'methodologies', 'techniques', 'steps', 'phases', 'stages', 'kinds', 'forms', 'categories', 'levels', 'principles', 'advantages', 'disadvantages', 'features', 'characteristics', 'examples']
        
        if any(indicator in query_lower for indicator in plural_indicators):
            return f"What are the {query}?"
        else:
            return f"What is {query}?"
    
    return query + '?'

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    """Handle file upload and train the model on the document."""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        filename = file.filename.lower()
        original_filename = file.filename
        
        if filename.endswith('.pdf'):
            text = extract_text_from_pdf(file)
        elif filename.endswith('.docx'):
            text = extract_text_from_docx(file)
        elif filename.endswith('.doc'):
            return jsonify({'error': 'Old .doc format is not supported. Please convert to .docx format.'}), 400
        elif filename.endswith('.txt'):
            text = file.read().decode('utf-8')
        else:
            return jsonify({'error': 'Unsupported file type. Please upload PDF, DOCX, or TXT file.'}), 400
        
        if not text.strip():
            return jsonify({'error': 'Could not extract any text from the file.'}), 400
        
        # TRAIN the model on this document
        num_chunks = train_on_document(text, original_filename)
        
        return jsonify({
            'success': True,
            'text': text,
            'filename': original_filename,
            'message': f'Successfully trained on "{original_filename}" ({num_chunks} knowledge chunks created)'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/ask', methods=['POST'])
def ask():
    """Answer questions using semantic search on the trained document."""
    try:
        data = request.get_json()
        question = data.get('question', '').strip()
        context = data.get('context', '').strip()
        
        if not question:
            return jsonify({'error': 'Please provide a question.'}), 400
        
        # FIX 3: Auto-convert keyword-style queries to proper questions
        # This helps RoBERTa/extractive QA models perform better
        question = convert_to_question_format(question)
        
        # Check if we have a trained document
        if document_store['embeddings'] is None:
            # If no document is trained but context is provided, train on it
            if context:
                train_on_document(context, "pasted_text")
            else:
                return jsonify({'error': 'Please upload a document first to train the model.'}), 400
        
        # Find the most relevant chunks from the trained document
        relevant_chunks = find_relevant_chunks(question, top_k=3)
        
        if not relevant_chunks:
            return jsonify({
                'answer': 'Could not find relevant information in the document.',
                'score': 0
            })
        
        # Get the best matching chunk(s)
        best_chunk = relevant_chunks[0]
        
        # FIX 2: Force "no answer" instead of junk answers
        # If score is below 0.2, the answer is not reliable
        threshold = 0.2  # Minimum similarity threshold
        
        if best_chunk['score'] < threshold:
            return jsonify({
                'answer': 'Answer not explicitly available in the document. Please try rephrasing your question in a more specific way (e.g., "What is X?" or "How does Y work?").',
                'score': best_chunk['score']
            })
        
        # Combine highly relevant chunks for a complete answer
        relevant_texts = []
        for chunk in relevant_chunks:
            if chunk['score'] >= threshold:
                relevant_texts.append(chunk['chunk'])
        
        # Join the relevant chunks
        answer = "\n\n".join(relevant_texts)
        
        # Calculate average confidence
        avg_score = sum(c['score'] for c in relevant_chunks if c['score'] >= threshold) / len(relevant_texts)
        
        return jsonify({
            'answer': answer,
            'score': avg_score,
            'source': document_store['filename'],
            'chunks_found': len(relevant_texts)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/status', methods=['GET'])
def status():
    """Get the current training status."""
    return jsonify({
        'trained': document_store['embeddings'] is not None,
        'filename': document_store['filename'],
        'num_chunks': len(document_store['chunks']) if document_store['chunks'] else 0
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)
