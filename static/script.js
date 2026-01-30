// DOM Elements
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const uploadArea = document.getElementById('uploadArea');
const pdfInput = document.getElementById('pdfInput');
const uploadedFile = document.getElementById('uploadedFile');
const fileName = document.getElementById('fileName');
const removeFile = document.getElementById('removeFile');
const contextInput = document.getElementById('contextInput');
const loadSampleBtn = document.getElementById('loadSampleBtn');
const contextStatus = document.getElementById('contextStatus');
const chatMessages = document.getElementById('chatMessages');
const welcomeMessage = document.getElementById('welcomeMessage');
const chatForm = document.getElementById('chatForm');
const questionInput = document.getElementById('questionInput');
const sendBtn = document.getElementById('sendBtn');
const clearChat = document.getElementById('clearChat');

// State
let currentContext = '';
let isProcessing = false;

// Sample data
const sampleData = `Sorting algorithms are used to arrange data in a particular order.
Quick Sort is a divide-and-conquer algorithm.
It selects a pivot element and partitions the array into two sub-arrays.
The average time complexity of Quick Sort is O(n log n).
The worst-case time complexity is O(n²) when the pivot is always the smallest or largest element.

Merge Sort is another divide-and-conquer algorithm.
It divides the array into two halves, sorts them recursively, and then merges them.
The time complexity of Merge Sort is O(n log n) in all cases.
Merge Sort is a stable sorting algorithm.

Binary Search is used to find an element in a sorted array.
It works by repeatedly dividing the search interval in half.
The time complexity of Binary Search is O(log n).
Binary Search requires the array to be sorted beforehand.

Hash Tables provide constant time average case for search, insertion, and deletion operations.
A hash function maps keys to array indices.
Collision handling can be done using chaining or open addressing.
The load factor affects the performance of hash tables.

Dynamic Programming is an algorithmic technique for solving optimization problems.
It breaks down problems into smaller subproblems and stores their solutions.
Examples include the Fibonacci sequence, knapsack problem, and longest common subsequence.
Memoization and tabulation are two approaches to implement dynamic programming.

Graph algorithms include Breadth-First Search (BFS) and Depth-First Search (DFS).
BFS explores nodes level by level and uses a queue data structure.
DFS explores as far as possible along each branch and uses a stack data structure.
Dijkstra's algorithm finds the shortest path in weighted graphs.

Time complexity analysis helps evaluate algorithm efficiency.
Space complexity measures the memory usage of an algorithm.
Big O notation describes the upper bound of algorithm performance.
Common complexities include O(1), O(log n), O(n), O(n log n), and O(n²).`;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    autoResizeTextarea(questionInput);
});

function setupEventListeners() {
    // Sidebar toggle
    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });

    // Upload area click
    uploadArea.addEventListener('click', () => pdfInput.click());

    // File input change
    pdfInput.addEventListener('change', handleFileSelect);

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    });

    // Remove file
    removeFile.addEventListener('click', () => {
        pdfInput.value = '';
        uploadedFile.style.display = 'none';
        uploadArea.style.display = 'block';
        updateContext('');
    });

    // Context textarea
    contextInput.addEventListener('input', () => {
        updateContext(contextInput.value);
    });

    // Load sample data
    loadSampleBtn.addEventListener('click', () => {
        contextInput.value = sampleData;
        updateContext(sampleData);
    });

    // Chat form submit
    chatForm.addEventListener('submit', handleSubmit);

    // Question input - auto resize and enter to send
    questionInput.addEventListener('input', () => {
        autoResizeTextarea(questionInput);
    });

    questionInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    });

    // Clear chat
    clearChat.addEventListener('click', () => {
        chatMessages.innerHTML = '';
        chatMessages.appendChild(welcomeMessage);
        welcomeMessage.style.display = 'block';
    });

    // Suggestion chips
    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            questionInput.value = chip.dataset.question;
            questionInput.focus();
            autoResizeTextarea(questionInput);
        });
    });
}

function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) handleFile(file);
}

async function handleFile(file) {
    const validTypes = ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const validExtensions = ['.pdf', '.txt', '.docx'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
        showErrorMessage('Please upload a PDF, Word (.docx), or TXT file.');
        return;
    }

    // Show uploading state
    uploadArea.classList.add('uploading');
    
    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.error) {
            showErrorMessage(data.error);
            uploadArea.classList.remove('uploading');
            return;
        }

        // Update UI
        fileName.textContent = file.name;
        uploadArea.style.display = 'none';
        uploadedFile.style.display = 'flex';
        uploadArea.classList.remove('uploading');

        // Clear text input and set context
        contextInput.value = '';
        updateContext(data.text);
        
        // Show training success message in chat
        if (data.message) {
            welcomeMessage.style.display = 'none';
            addMessage(`✅ ${data.message}\n\nYou can now ask questions about the document!`, 'bot', null, false);
        }

    } catch (error) {
        console.error('Upload error:', error);
        showErrorMessage('Failed to upload file. Please try again.');
        uploadArea.classList.remove('uploading');
    }
}

function updateContext(text) {
    currentContext = text.trim();
    const statusText = contextStatus.querySelector('.status-text');
    
    if (currentContext) {
        contextStatus.classList.add('active');
        const wordCount = currentContext.split(/\s+/).length;
        statusText.textContent = `${wordCount} words loaded`;
    } else {
        contextStatus.classList.remove('active');
        statusText.textContent = 'No context loaded';
    }
}

async function handleSubmit(e) {
    e.preventDefault();
    
    const question = questionInput.value.trim();
    
    if (!question) return;
    
    if (!currentContext) {
        showErrorMessage('Please upload a document or paste text in the sidebar first.');
        return;
    }
    
    if (isProcessing) return;
    
    // Hide welcome message
    welcomeMessage.style.display = 'none';
    
    // Add user message
    addMessage(question, 'user');
    
    // Clear input
    questionInput.value = '';
    autoResizeTextarea(questionInput);
    
    // Show typing indicator
    const typingId = showTypingIndicator();
    
    isProcessing = true;
    sendBtn.disabled = true;
    
    try {
        const response = await fetch('/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                context: currentContext,
                question: question
            })
        });
        
        const data = await response.json();
        
        // Remove typing indicator
        removeTypingIndicator(typingId);
        
        if (data.error) {
            addMessage(data.error, 'bot', null, true);
        } else {
            addMessage(data.answer, 'bot', data.score);
        }
        
    } catch (error) {
        removeTypingIndicator(typingId);
        addMessage('Failed to connect to the server. Please try again.', 'bot', null, true);
        console.error('Error:', error);
    } finally {
        isProcessing = false;
        sendBtn.disabled = false;
        questionInput.focus();
    }
}

function addMessage(text, type, confidence = null, isError = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    const avatar = type === 'user' ? '👤' : '🤖';
    
    let confidenceHtml = '';
    if (confidence !== null && type === 'bot') {
        const percentage = Math.round(confidence * 100);
        let level = 'low';
        if (confidence > 0.7) level = 'high';
        else if (confidence > 0.4) level = 'medium';
        
        confidenceHtml = `
            <div class="confidence-display">
                <div class="confidence-header">
                    <span class="confidence-label">Confidence</span>
                    <span class="confidence-value ${level}">${percentage}%</span>
                </div>
                <div class="confidence-bar">
                    <div class="confidence-fill ${level}" style="width: ${percentage}%"></div>
                </div>
            </div>
        `;
    }
    
    const bubbleClass = isError ? 'message-bubble error-bubble' : 'message-bubble';
    
    messageDiv.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">
            <div class="${bubbleClass}">
                <p class="message-text">${escapeHtml(text)}</p>
            </div>
            ${confidenceHtml}
        </div>
    `;
    
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

function showTypingIndicator() {
    const id = 'typing-' + Date.now();
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message bot';
    typingDiv.id = id;
    typingDiv.innerHTML = `
        <div class="message-avatar">🤖</div>
        <div class="message-content">
            <div class="message-bubble">
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        </div>
    `;
    chatMessages.appendChild(typingDiv);
    scrollToBottom();
    return id;
}

function removeTypingIndicator(id) {
    const typingDiv = document.getElementById(id);
    if (typingDiv) typingDiv.remove();
}

function showErrorMessage(message) {
    // Add as a chat message if chat is active
    if (welcomeMessage.style.display === 'none') {
        addMessage(message, 'bot', null, true);
    } else {
        alert(message);
    }
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
