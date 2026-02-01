// ========================================
// Centralized Authentication State Manager
// ========================================
const AuthManager = {
    // State
    token: null,
    user: null,
    isInitialized: false,
    listeners: [],

    // Initialize from localStorage
    init() {
        this.token = localStorage.getItem('authToken');
        const savedUser = localStorage.getItem('authUser');
        if (savedUser) {
            try {
                this.user = JSON.parse(savedUser);
            } catch (e) {
                this.user = null;
            }
        }
        this.isInitialized = true;
        return this;
    },

    // Check if user is authenticated
    isAuthenticated() {
        return !!(this.token && this.user);
    },

    // Get current token
    getToken() {
        return this.token;
    },

    // Get current user
    getUser() {
        return this.user;
    },

    // Set authentication data (login/register success)
    setAuth(token, user) {
        this.token = token;
        this.user = user;
        localStorage.setItem('authToken', token);
        localStorage.setItem('authUser', JSON.stringify(user));
        this.notifyListeners('login', { token, user });
    },

    // Clear authentication data (logout)
    clearAuth() {
        const hadAuth = this.isAuthenticated();
        this.token = null;
        this.user = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('authUser');
        
        // Clear any session-specific data
        sessionStorage.clear();
        
        if (hadAuth) {
            this.notifyListeners('logout', null);
        }
    },

    // Subscribe to auth state changes
    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(cb => cb !== callback);
        };
    },

    // Notify all listeners
    notifyListeners(event, data) {
        this.listeners.forEach(cb => {
            try {
                cb(event, data);
            } catch (e) {
                console.error('Auth listener error:', e);
            }
        });
    },

    // Get headers for API requests
    getHeaders(includeContentType = true) {
        const headers = {};
        if (includeContentType) {
            headers['Content-Type'] = 'application/json';
        }
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    },

    // Validate token with server
    async validateToken() {
        if (!this.token) {
            return false;
        }

        try {
            const response = await fetch('/api/auth/me', {
                headers: this.getHeaders(false)
            });

            if (response.ok) {
                const data = await response.json();
                this.user = data.user;
                localStorage.setItem('authUser', JSON.stringify(data.user));
                return true;
            } else {
                // Token invalid - clear auth
                this.clearAuth();
                return false;
            }
        } catch (error) {
            console.error('Token validation error:', error);
            return false;
        }
    },

    // Perform logout (includes server notification)
    async logout() {
        try {
            if (this.token) {
                // Notify server to invalidate token
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: this.getHeaders()
                });
            }
        } catch (error) {
            console.error('Logout request failed:', error);
        } finally {
            // Always clear local auth state
            this.clearAuth();
        }
    }
};

// Initialize AuthManager immediately
AuthManager.init();

// ========================================
// Application State Manager
// ========================================
const AppState = {
    currentContext: '',
    isProcessing: false,
    chatSessions: [],
    currentSessionId: null,

    reset() {
        this.currentContext = '';
        this.isProcessing = false;
        this.chatSessions = [];
        this.currentSessionId = null;
    },

    setContext(text) {
        this.currentContext = text ? text.trim() : '';
    },

    getContext() {
        return this.currentContext;
    }
};

// ========================================
// DOM Elements
// ========================================
let historyPanel, uploadPanel, historyList, historyEmpty, clearHistory;
let uploadArea, pdfInput, uploadedFile, fileName, removeFile;
let contextInput, applyTextBtn, contextStatus, contextIndicator, contextText;
let chatMessages, welcomeMessage, chatForm, questionInput, sendBtn, clearChat, newChatBtn;

// Auth DOM Elements
let authModal, closeAuthModalBtn, btnShowLogin;
let loginForm, signupForm, showSignup, showLogin;
let loginFormElement, signupFormElement;
let userMenu, userMenuTrigger, userDropdown;
let userAvatar, userName, dropdownEmail, btnLogout;
let loginError, signupError;

// Initialize DOM element references
function initDOMElements() {
    historyPanel = document.getElementById('historyPanel');
    uploadPanel = document.getElementById('uploadPanel');
    historyList = document.getElementById('historyList');
    historyEmpty = document.getElementById('historyEmpty');
    clearHistory = document.getElementById('clearHistory');
    uploadArea = document.getElementById('uploadArea');
    pdfInput = document.getElementById('pdfInput');
    uploadedFile = document.getElementById('uploadedFile');
    fileName = document.getElementById('fileName');
    removeFile = document.getElementById('removeFile');
    contextInput = document.getElementById('contextInput');
    applyTextBtn = document.getElementById('applyTextBtn');
    contextStatus = document.getElementById('contextStatus');
    contextIndicator = document.getElementById('contextIndicator');
    contextText = document.getElementById('contextText');
    chatMessages = document.getElementById('chatMessages');
    welcomeMessage = document.getElementById('welcomeMessage');
    chatForm = document.getElementById('chatForm');
    questionInput = document.getElementById('questionInput');
    sendBtn = document.getElementById('sendBtn');
    clearChat = document.getElementById('clearChat');
    newChatBtn = document.getElementById('newChatBtn');

    // Auth DOM Elements
    authModal = document.getElementById('authModal');
    closeAuthModalBtn = document.getElementById('closeAuthModal');
    btnShowLogin = document.getElementById('btnShowLogin');
    loginForm = document.getElementById('loginForm');
    signupForm = document.getElementById('signupForm');
    showSignup = document.getElementById('showSignup');
    showLogin = document.getElementById('showLogin');
    loginFormElement = document.getElementById('loginFormElement');
    signupFormElement = document.getElementById('signupFormElement');
    userMenu = document.getElementById('userMenu');
    userMenuTrigger = document.getElementById('userMenuTrigger');
    userDropdown = document.getElementById('userDropdown');
    userAvatar = document.getElementById('userAvatar');
    userName = document.getElementById('userName');
    dropdownEmail = document.getElementById('dropdownEmail');
    btnLogout = document.getElementById('btnLogout');
    loginError = document.getElementById('loginError');
    signupError = document.getElementById('signupError');
}

// ========================================
// Initialization
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize DOM references
    initDOMElements();
    
    // Subscribe to auth state changes
    AuthManager.subscribe(handleAuthStateChange);
    
    // Check authentication status
    await checkAuthStatus();
    
    // Load chat history
    await loadChatHistory();
    
    // Setup event listeners
    setupEventListeners();
    setupAuthEventListeners();
    
    // Auto-resize textarea
    if (questionInput) autoResizeTextarea(questionInput);
    
    // Set tooltips
    document.getElementById('historyIcon')?.setAttribute('data-tooltip', 'Chat History');
    document.getElementById('uploadIcon')?.setAttribute('data-tooltip', 'Add Document');
});

// Handle auth state changes centrally
function handleAuthStateChange(event, data) {
    console.log('Auth state changed:', event);
    
    if (event === 'login') {
        // Refresh UI and data for logged-in user
        updateAuthUI(true);
        loadChatHistory();
    } else if (event === 'logout') {
        // Clean up everything for logged-out user
        performFullCleanup();
        updateAuthUI(false);
        loadChatHistory();
    }
}

// Perform complete cleanup on logout
function performFullCleanup() {
    // Reset application state
    AppState.reset();
    
    // Clear chat UI
    if (chatMessages && welcomeMessage) {
        chatMessages.innerHTML = '';
        chatMessages.appendChild(welcomeMessage);
        welcomeMessage.style.display = 'block';
    }
    
    // Clear form inputs
    clearAllFormInputs();
    
    // Clear context
    updateContext('');
    
    // Reset file upload UI
    if (uploadedFile) uploadedFile.style.display = 'none';
    if (uploadArea) uploadArea.style.display = 'block';
    if (pdfInput) pdfInput.value = '';
    
    // Close any open modals or dropdowns
    closeAuthModalFn();
    closeUserDropdown();
}

// Clear all form inputs
function clearAllFormInputs() {
    // Auth forms
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');
    const signupUsername = document.getElementById('signupUsername');
    const signupEmail = document.getElementById('signupEmail');
    const signupPassword = document.getElementById('signupPassword');
    const signupConfirmPassword = document.getElementById('signupConfirmPassword');
    
    if (loginEmail) loginEmail.value = '';
    if (loginPassword) loginPassword.value = '';
    if (signupUsername) signupUsername.value = '';
    if (signupEmail) signupEmail.value = '';
    if (signupPassword) signupPassword.value = '';
    if (signupConfirmPassword) signupConfirmPassword.value = '';
    
    // Clear context input
    if (contextInput) contextInput.value = '';
    
    // Clear question input
    if (questionInput) questionInput.value = '';
    
    // Clear auth errors
    clearAuthErrors();
}

function setupEventListeners() {
    // Upload area click
    uploadArea?.addEventListener('click', () => pdfInput?.click());

    // File input change
    pdfInput?.addEventListener('change', handleFileSelect);

    // Drag and drop
    uploadArea?.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea?.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea?.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    });

    // Remove file
    removeFile?.addEventListener('click', () => {
        if (pdfInput) pdfInput.value = '';
        if (uploadedFile) uploadedFile.style.display = 'none';
        if (uploadArea) uploadArea.style.display = 'block';
        updateContext('');
    });

    // Apply text button
    applyTextBtn?.addEventListener('click', () => {
        const text = contextInput?.value.trim();
        if (text) {
            trainOnText(text);
        }
    });

    // Chat form submit
    chatForm?.addEventListener('submit', handleSubmit);

    // Question input - auto resize and enter to send
    questionInput?.addEventListener('input', () => {
        autoResizeTextarea(questionInput);
    });

    questionInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    });

    // Clear chat
    clearChat?.addEventListener('click', () => {
        if (chatMessages && welcomeMessage) {
            chatMessages.innerHTML = '';
            chatMessages.appendChild(welcomeMessage);
            welcomeMessage.style.display = 'block';
        }
        startNewSession();
    });

    // New Chat button (ChatGPT-style)
    newChatBtn?.addEventListener('click', () => {
        // Clear chat messages
        if (chatMessages && welcomeMessage) {
            chatMessages.innerHTML = '';
            chatMessages.appendChild(welcomeMessage);
            welcomeMessage.style.display = 'block';
        }
        // Reset context
        updateContext('');
        // Reset file upload UI
        if (uploadedFile) uploadedFile.style.display = 'none';
        if (uploadArea) uploadArea.style.display = 'block';
        if (pdfInput) pdfInput.value = '';
        if (contextInput) contextInput.value = '';
        // Start fresh session
        startNewSession('New Chat');
        // Focus on question input
        questionInput?.focus();
    });

    // Clear all history
    clearHistory?.addEventListener('click', async () => {
        if (confirm('Clear all chat history? This cannot be undone.')) {
            await clearAllHistory();
        }
    });
}

function autoResizeTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
}

// ========================================
// File Upload Functions
// ========================================
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
    uploadArea?.classList.add('uploading');
    
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
            uploadArea?.classList.remove('uploading');
            return;
        }

        // Update UI
        if (fileName) fileName.textContent = file.name;
        if (uploadArea) uploadArea.style.display = 'none';
        if (uploadedFile) uploadedFile.style.display = 'flex';
        uploadArea?.classList.remove('uploading');

        // Clear text input and set context
        if (contextInput) contextInput.value = '';
        updateContext(data.text);
        
        // Show training success message in chat
        if (data.message) {
            if (welcomeMessage) welcomeMessage.style.display = 'none';
            addMessage(`✅ ${data.message}\n\nYou can now ask questions about the document!`, 'bot', null, false);
        }

        // Start new session with document name
        await startNewSession(file.name);

    } catch (error) {
        console.error('Upload error:', error);
        showErrorMessage('Failed to upload file. Please try again.');
        uploadArea?.classList.remove('uploading');
    }
}

async function trainOnText(text) {
    if (!applyTextBtn) return;
    
    applyTextBtn.textContent = 'Processing...';
    applyTextBtn.disabled = true;
    
    try {
        const response = await fetch('/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
        });

        const data = await response.json();

        if (data.error) {
            showErrorMessage(data.error);
        } else {
            updateContext(text);
            if (welcomeMessage) welcomeMessage.style.display = 'none';
            addMessage(`✅ ${data.message}\n\nYou can now ask questions about the content!`, 'bot', null, false);
            await startNewSession('Pasted Text');
        }
    } catch (error) {
        showErrorMessage('Failed to process text. Please try again.');
    } finally {
        applyTextBtn.textContent = 'Apply Text';
        applyTextBtn.disabled = false;
    }
}

function updateContext(text) {
    AppState.setContext(text);
    const currentContext = AppState.getContext();
    const statusText = contextStatus?.querySelector('.status-text');
    
    if (currentContext) {
        contextStatus?.classList.add('active');
        contextIndicator?.classList.add('active');
        const wordCount = currentContext.split(/\s+/).length;
        if (statusText) statusText.textContent = `${wordCount} words loaded`;
        if (contextText) contextText.textContent = `${wordCount} words`;
    } else {
        contextStatus?.classList.remove('active');
        contextIndicator?.classList.remove('active');
        if (statusText) statusText.textContent = 'No content loaded';
        if (contextText) contextText.textContent = 'No document';
    }
}

// ========================================
// Chat Functions
// ========================================
async function handleSubmit(e) {
    e.preventDefault();
    
    const question = questionInput?.value.trim();
    
    if (!question) return;
    
    if (!AppState.getContext()) {
        showErrorMessage('Please upload a document or paste text using the right panel first.');
        return;
    }
    
    if (AppState.isProcessing) return;
    
    // Hide welcome message
    if (welcomeMessage) welcomeMessage.style.display = 'none';
    
    // Add user message
    addMessage(question, 'user');
    
    // Save to database
    await saveMessageToDb('user', question);
    
    // Clear input
    if (questionInput) {
        questionInput.value = '';
        autoResizeTextarea(questionInput);
    }
    
    // Show typing indicator
    const typingId = showTypingIndicator();
    
    AppState.isProcessing = true;
    if (sendBtn) sendBtn.disabled = true;
    
    try {
        const response = await fetch('/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                context: AppState.getContext(),
                question: question
            })
        });
        
        const data = await response.json();
        
        // Remove typing indicator
        removeTypingIndicator(typingId);
        
        if (data.error) {
            addMessage(data.error, 'bot', null, true);
            await saveMessageToDb('bot', data.error);
        } else {
            // Pass full response data for enhanced display
            addMessage(data.answer, 'bot', data.score, false, data.source_chunks, {
                shortAnswer: data.short_answer,
                isExtractive: data.is_extractive,
                confidenceLevel: data.confidence_level,
                showContext: data.show_context,
                isFallback: data.is_fallback,
                qaScore: data.qa_score,
                alternatives: data.alternatives
            });
            await saveMessageToDb('bot', data.answer, data.score);
        }
        
    } catch (error) {
        removeTypingIndicator(typingId);
        addMessage('Failed to connect to the server. Please try again.', 'bot', null, true);
        console.error('Error:', error);
    } finally {
        AppState.isProcessing = false;
        if (sendBtn) sendBtn.disabled = false;
        questionInput?.focus();
    }
}

function addMessage(text, type, confidence = null, isError = false, sourceChunks = null, extraData = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    const avatar = type === 'user' ? '👤' : '🤖';
    
    // Determine what to display based on response type
    let displayText = text;
    let hasExpandableContext = false;
    let contextTextContent = '';
    
    if (extraData && type === 'bot' && !isError) {
        // Use short answer if available and different from full answer
        if (extraData.shortAnswer && extraData.shortAnswer !== text) {
            displayText = extraData.shortAnswer;
            contextTextContent = text;
            hasExpandableContext = true;
        } else if (extraData.isExtractive && text.length > 300) {
            // For long extractive answers, show truncated version
            displayText = text.substring(0, 280) + '...';
            contextTextContent = text;
            hasExpandableContext = true;
        }
    }
    
    let confidenceHtml = '';
    if (confidence !== null && type === 'bot') {
        const percentage = Math.round(confidence * 100);
        let level = 'low';
        if (confidence > 0.7) level = 'high';
        else if (confidence > 0.4) level = 'medium';
        
        // Use confidence level from backend if available
        if (extraData && extraData.confidenceLevel) {
            level = extraData.confidenceLevel;
        }
        
        // Show QA score if available
        let scoreLabel = 'Confidence';
        if (extraData && extraData.isExtractive) {
            scoreLabel = 'Answer Confidence';
        }
        
        confidenceHtml = `
            <div class="confidence-display">
                <div class="confidence-header">
                    <span class="confidence-label">${scoreLabel}</span>
                    <span class="confidence-value ${level}">${percentage}%</span>
                </div>
                <div class="confidence-bar">
                    <div class="confidence-fill ${level}" style="width: ${percentage}%"></div>
                </div>
            </div>
        `;
    }
    
    // Expandable full answer section
    let expandableAnswerHtml = '';
    if (hasExpandableContext && contextTextContent) {
        expandableAnswerHtml = `
            <div class="expandable-answer">
                <button class="expand-toggle" onclick="this.parentElement.classList.toggle('expanded')">
                    <span class="expand-icon">📝</span>
                    <span class="expand-text">Show Full Answer</span>
                    <span class="expand-arrow">▼</span>
                </button>
                <div class="expanded-content">
                    <p class="full-answer-text">${escapeHtml(contextTextContent)}</p>
                </div>
            </div>
        `;
    }
    
    // Source highlighting section
    let sourceHtml = '';
    if (sourceChunks && sourceChunks.length > 0 && type === 'bot') {
        // Determine if context should be auto-expanded
        const autoExpand = extraData && extraData.showContext ? 'expanded' : '';
        
        const sourcesContent = sourceChunks.map((chunk, idx) => `
            <div class="source-chunk">
                <div class="source-chunk-header">
                    <span class="source-chunk-label">📍 Source ${idx + 1}</span>
                    <span class="source-chunk-score">${chunk.score}% match</span>
                </div>
                <div class="source-chunk-text">${escapeHtml(chunk.text)}</div>
            </div>
        `).join('');
        
        sourceHtml = `
            <div class="source-highlight ${autoExpand}">
                <button class="source-toggle" onclick="this.parentElement.classList.toggle('expanded')">
                    <span class="source-toggle-icon">📄</span>
                    <span class="source-toggle-text">View Supporting Context (${sourceChunks.length} chunk${sourceChunks.length > 1 ? 's' : ''})</span>
                    <span class="source-toggle-arrow">▼</span>
                </button>
                <div class="source-content">
                    ${sourcesContent}
                </div>
            </div>
        `;
    }
    
    // Alternatives section (if available)
    let alternativesHtml = '';
    if (extraData && extraData.alternatives && extraData.alternatives.length > 0) {
        const altContent = extraData.alternatives.map((alt, idx) => `
            <div class="alternative-answer">
                <span class="alt-label">Alternative ${idx + 1}:</span>
                <span class="alt-text">${escapeHtml(alt.answer)}</span>
                <span class="alt-score">(${Math.round(alt.score * 100)}%)</span>
            </div>
        `).join('');
        
        alternativesHtml = `
            <div class="alternatives-section">
                <button class="alt-toggle" onclick="this.parentElement.classList.toggle('expanded')">
                    <span class="alt-icon">💡</span>
                    <span class="alt-toggle-text">Other possible answers</span>
                    <span class="alt-arrow">▼</span>
                </button>
                <div class="alt-content">
                    ${altContent}
                </div>
            </div>
        `;
    }
    
    // Answer type indicator
    let answerTypeHtml = '';
    if (extraData && type === 'bot' && !isError) {
        if (extraData.isExtractive) {
            answerTypeHtml = '<span class="answer-type extractive">✓ Extracted Answer</span>';
        } else if (extraData.isFallback) {
            answerTypeHtml = '<span class="answer-type fallback">ℹ️ No exact match found</span>';
        }
    }
    
    const bubbleClass = isError ? 'message-bubble error-bubble' : 'message-bubble';
    
    messageDiv.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">
            <div class="${bubbleClass}">
                ${answerTypeHtml}
                <p class="message-text">${escapeHtml(displayText)}</p>
            </div>
            ${expandableAnswerHtml}
            ${confidenceHtml}
            ${alternativesHtml}
            ${sourceHtml}
        </div>
    `;
    
    chatMessages?.appendChild(messageDiv);
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
    chatMessages?.appendChild(typingDiv);
    scrollToBottom();
    return id;
}

function removeTypingIndicator(id) {
    const typingDiv = document.getElementById(id);
    if (typingDiv) typingDiv.remove();
}

function showErrorMessage(message) {
    if (welcomeMessage && welcomeMessage.style.display === 'none') {
        addMessage(message, 'bot', null, true);
    } else {
        alert(message);
    }
}

function scrollToBottom() {
    if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========================================
// Database Chat History Functions
// ========================================
async function loadChatHistory() {
    try {
        const response = await fetch('/api/sessions', { 
            headers: AuthManager.getHeaders(false) 
        });
        const data = await response.json();
        
        if (data.sessions) {
            AppState.chatSessions = data.sessions;
            renderHistoryList();
        }
    } catch (error) {
        console.error('Failed to load chat history:', error);
        AppState.chatSessions = [];
        renderHistoryList();
    }
}

async function startNewSession(documentName = 'New Chat') {
    AppState.currentSessionId = Date.now().toString();
    
    try {
        const response = await fetch('/api/sessions', {
            method: 'POST',
            headers: AuthManager.getHeaders(),
            body: JSON.stringify({
                session_id: AppState.currentSessionId,
                title: documentName,
                document_name: documentName
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Reload sessions from database
            await loadChatHistory();
        }
    } catch (error) {
        console.error('Failed to create session:', error);
    }
}

async function saveMessageToDb(type, content, confidence = null) {
    if (!AppState.currentSessionId) {
        await startNewSession();
    }
    
    try {
        // Save message
        await fetch(`/api/sessions/${AppState.currentSessionId}/messages`, {
            method: 'POST',
            headers: AuthManager.getHeaders(),
            body: JSON.stringify({
                type: type,
                content: content,
                confidence: confidence
            })
        });
        
        // Update session title if first user message
        if (type === 'user') {
            const session = AppState.chatSessions.find(s => s.session_id === AppState.currentSessionId);
            if (session && session.title === 'New Chat') {
                const newTitle = content.substring(0, 40) + (content.length > 40 ? '...' : '');
                await fetch(`/api/sessions/${AppState.currentSessionId}`, {
                    method: 'PUT',
                    headers: AuthManager.getHeaders(),
                    body: JSON.stringify({ title: newTitle })
                });
            }
        }
        
        // Refresh history list
        await loadChatHistory();
        
    } catch (error) {
        console.error('Failed to save message:', error);
    }
}

async function deleteSession(sessionId, event) {
    if (event) event.stopPropagation();
    
    if (!confirm('Delete this chat session?')) return;
    
    try {
        await fetch(`/api/sessions/${sessionId}`, {
            method: 'DELETE',
            headers: AuthManager.getHeaders(false)
        });
        
        if (AppState.currentSessionId === sessionId) {
            AppState.currentSessionId = null;
            if (chatMessages && welcomeMessage) {
                chatMessages.innerHTML = '';
                chatMessages.appendChild(welcomeMessage);
                welcomeMessage.style.display = 'block';
            }
        }
        
        await loadChatHistory();
    } catch (error) {
        console.error('Failed to delete session:', error);
    }
}

async function clearAllHistory() {
    try {
        await fetch('/api/sessions/clear', {
            method: 'DELETE',
            headers: AuthManager.getHeaders(false)
        });
        
        AppState.currentSessionId = null;
        AppState.chatSessions = [];
        
        if (chatMessages && welcomeMessage) {
            chatMessages.innerHTML = '';
            chatMessages.appendChild(welcomeMessage);
            welcomeMessage.style.display = 'block';
        }
        
        renderHistoryList();
    } catch (error) {
        console.error('Failed to clear history:', error);
    }
}

function renderHistoryList() {
    if (!historyList || !historyEmpty) return;
    
    // Clear existing items (except empty message)
    const items = historyList.querySelectorAll('.history-item');
    items.forEach(item => item.remove());
    
    if (AppState.chatSessions.length === 0) {
        historyEmpty.style.display = 'block';
        return;
    }
    
    historyEmpty.style.display = 'none';
    
    // Render sessions (already sorted by updated_at DESC from server)
    AppState.chatSessions.forEach(session => {
        const item = document.createElement('div');
        item.className = 'history-item' + (session.session_id === AppState.currentSessionId ? ' active' : '');
        item.onclick = () => loadSession(session.session_id);
        
        const time = formatTime(session.updated_at || session.created_at);
        
        item.innerHTML = `
            <div class="history-item-header">
                <div class="history-item-title">${escapeHtml(session.title)}</div>
                <button class="history-item-delete" onclick="deleteSession('${session.session_id}', event)" title="Delete">🗑️</button>
            </div>
            <div class="history-item-meta">
                <span class="history-item-doc">${session.document_name ? '📄 ' + escapeHtml(session.document_name) : ''}</span>
                <span class="history-item-time">${time}</span>
            </div>
        `;
        
        historyList.appendChild(item);
    });
}

async function loadSession(sessionId) {
    try {
        const response = await fetch(`/api/sessions/${sessionId}/messages`, { 
            headers: AuthManager.getHeaders(false) 
        });
        const data = await response.json();
        
        if (data.messages) {
            AppState.currentSessionId = sessionId;
            
            // Clear current chat
            if (chatMessages && welcomeMessage) {
                chatMessages.innerHTML = '';
                welcomeMessage.style.display = 'none';
                chatMessages.appendChild(welcomeMessage);
            }
            
            // Render messages from database
            data.messages.forEach(msg => {
                addMessage(msg.content, msg.type, msg.confidence, false);
            });
            
            renderHistoryList();
        }
    } catch (error) {
        console.error('Failed to load session:', error);
    }
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
    
    return date.toLocaleDateString();
}

// ========================================
// Authentication Functions
// ========================================

function setupAuthEventListeners() {
    // Show login modal
    btnShowLogin?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openAuthModal('login');
    });
    
    // Close modal
    closeAuthModalBtn?.addEventListener('click', closeAuthModalFn);
    authModal?.addEventListener('click', (e) => {
        if (e.target === authModal) closeAuthModalFn();
    });
    
    // Switch between login/signup
    showSignup?.addEventListener('click', (e) => {
        e.preventDefault();
        switchAuthForm('signup');
    });
    showLogin?.addEventListener('click', (e) => {
        e.preventDefault();
        switchAuthForm('login');
    });
    
    // Form submissions
    loginFormElement?.addEventListener('submit', handleLogin);
    signupFormElement?.addEventListener('submit', handleSignup);
    
    // User menu toggle - single handler
    userMenuTrigger?.addEventListener('click', toggleUserMenu);
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (userMenu && !userMenu.contains(e.target)) {
            closeUserDropdown();
        }
    });
    
    // Logout button
    btnLogout?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleLogout();
    });
    
    // ESC key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (authModal?.classList.contains('active')) {
                closeAuthModalFn();
            }
            closeUserDropdown();
        }
    });
}

function openAuthModal(form = 'login') {
    if (!authModal) return;
    
    // Clear any previous form data and errors
    clearAllFormInputs();
    
    authModal.style.display = 'flex';
    // Use requestAnimationFrame for smoother animation
    requestAnimationFrame(() => {
        authModal.classList.add('active');
    });
    switchAuthForm(form);
}

// Make deleteSession globally accessible for inline onclick handlers in dynamic HTML
window.deleteSession = deleteSession;

function closeAuthModalFn() {
    if (!authModal) return;
    
    authModal.classList.remove('active');
    setTimeout(() => {
        authModal.style.display = 'none';
    }, 300);
    clearAuthErrors();
}

function switchAuthForm(form) {
    if (form === 'signup') {
        if (loginForm) loginForm.style.display = 'none';
        if (signupForm) signupForm.style.display = 'block';
    } else {
        if (loginForm) loginForm.style.display = 'block';
        if (signupForm) signupForm.style.display = 'none';
    }
    clearAuthErrors();
}

function clearAuthErrors() {
    if (loginError) loginError.textContent = '';
    if (signupError) signupError.textContent = '';
}

function toggleUserMenu(e) {
    e.stopPropagation();
    e.preventDefault();
    
    if (!userDropdown) return;
    
    const isOpen = userDropdown.classList.contains('show');
    
    if (isOpen) {
        closeUserDropdown();
    } else {
        openUserDropdown();
    }
}

function openUserDropdown() {
    if (!userDropdown) return;
    userDropdown.classList.add('show');
    userMenu?.classList.add('active');
}

function closeUserDropdown() {
    if (!userDropdown) return;
    userDropdown.classList.remove('show');
    userMenu?.classList.remove('active');
}

async function checkAuthStatus() {
    if (!AuthManager.getToken()) {
        updateAuthUI(false);
        return;
    }
    
    const isValid = await AuthManager.validateToken();
    updateAuthUI(isValid);
}

function updateAuthUI(isLoggedIn) {
    const user = AuthManager.getUser();
    
    if (isLoggedIn && user) {
        if (btnShowLogin) btnShowLogin.style.display = 'none';
        if (userMenu) userMenu.style.display = 'flex';
        
        // Update user info
        const initial = user.username ? user.username.charAt(0).toUpperCase() : 'U';
        if (userAvatar) userAvatar.textContent = initial;
        if (userName) userName.textContent = user.username || 'User';
        if (dropdownEmail) dropdownEmail.textContent = user.email || '';
    } else {
        if (btnShowLogin) btnShowLogin.style.display = 'flex';
        if (userMenu) userMenu.style.display = 'none';
        
        // Ensure dropdown is closed
        closeUserDropdown();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail')?.value.trim();
    const password = document.getElementById('loginPassword')?.value;
    const btnLogin = document.getElementById('btnLogin');
    
    if (!email || !password) {
        if (loginError) loginError.textContent = 'Please fill in all fields';
        return;
    }
    
    if (btnLogin) {
        btnLogin.classList.add('loading');
        btnLogin.disabled = true;
    }
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (data.error) {
            if (loginError) loginError.textContent = data.error;
        } else if (data.success && data.token && data.user) {
            // Success - use AuthManager to set state
            AuthManager.setAuth(data.token, data.user);
            
            // Close modal
            closeAuthModalFn();
            
            // Clear form
            clearAllFormInputs();
            
            // Reset chat for clean state
            AppState.currentSessionId = null;
            if (chatMessages && welcomeMessage) {
                chatMessages.innerHTML = '';
                chatMessages.appendChild(welcomeMessage);
                welcomeMessage.style.display = 'block';
            }
        }
    } catch (error) {
        console.error('Login error:', error);
        if (loginError) loginError.textContent = 'Login failed. Please try again.';
    } finally {
        if (btnLogin) {
            btnLogin.classList.remove('loading');
            btnLogin.disabled = false;
        }
    }
}

async function handleSignup(e) {
    e.preventDefault();
    
    const username = document.getElementById('signupUsername')?.value.trim();
    const email = document.getElementById('signupEmail')?.value.trim();
    const password = document.getElementById('signupPassword')?.value;
    const confirmPassword = document.getElementById('signupConfirmPassword')?.value;
    const btnSignup = document.getElementById('btnSignup');
    
    // Validation
    if (!username || !email || !password || !confirmPassword) {
        if (signupError) signupError.textContent = 'Please fill in all fields';
        return;
    }
    
    if (password !== confirmPassword) {
        if (signupError) signupError.textContent = 'Passwords do not match';
        return;
    }
    
    if (password.length < 6) {
        if (signupError) signupError.textContent = 'Password must be at least 6 characters';
        return;
    }
    
    if (btnSignup) {
        btnSignup.classList.add('loading');
        btnSignup.disabled = true;
    }
    
    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
        
        const data = await response.json();
        
        if (data.error) {
            if (signupError) signupError.textContent = data.error;
        } else if (data.success && data.token && data.user) {
            // Success - use AuthManager to set state (auto-login after register)
            AuthManager.setAuth(data.token, data.user);
            
            // Close modal
            closeAuthModalFn();
            
            // Clear form
            clearAllFormInputs();
            
            // Welcome message for new user
            if (welcomeMessage) welcomeMessage.style.display = 'none';
            addMessage(`🎉 Welcome, ${data.user.username}! Your account has been created. You can now upload documents and your chat history will be saved.`, 'bot', null, false);
        }
    } catch (error) {
        console.error('Signup error:', error);
        if (signupError) signupError.textContent = 'Signup failed. Please try again.';
    } finally {
        if (btnSignup) {
            btnSignup.classList.remove('loading');
            btnSignup.disabled = false;
        }
    }
}

async function handleLogout() {
    console.log('Logout initiated');
    
    // Close dropdown immediately
    closeUserDropdown();
    
    // Perform logout through AuthManager (handles server call and cleanup)
    await AuthManager.logout();
    
    // The auth state change listener will handle UI updates
    console.log('Logout completed');
}

