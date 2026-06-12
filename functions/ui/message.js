import * as State from '../state.js';
import { log } from '../logger.js';

let typingElement = null;

export function showTypingIndicator() {
    hideTypingIndicator();
    const container = document.getElementById('chat-container');
    if (!container) return;
    
    typingElement = document.createElement('div');
    typingElement.className = 'typing-indicator';
    typingElement.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
    container.appendChild(typingElement);
    container.scrollTop = container.scrollHeight;
}

export function hideTypingIndicator() {
    if (typingElement?.remove) {
        typingElement.remove();
        typingElement = null;
    }
}

export function appendMessage(text, sender, modelLabel = null) {
    const container = document.getElementById('chat-container');
    if (!container) return;
    
    const welcome = container.querySelector('.welcome-message');
    if (welcome) welcome.remove();
    
    const bubble = document.createElement('div');
    bubble.className = `message ${sender}`;
    
    if (sender === "assistant") {
        if (typeof marked !== "undefined" && typeof DOMPurify !== "undefined") {
            const rawHtml = marked.parse(text, { breaks: true, gfm: true });
            bubble.innerHTML = DOMPurify.sanitize(rawHtml);
        } else if (typeof marked !== "undefined" && typeof DOMPurify === "undefined") {
            log(`DOMPurify not loaded - rendering markdown as plain text for security`, 'warning');
            bubble.innerText = text;
        } else {
            bubble.innerText = text;
        }
    } else {
        bubble.innerText = text;
    }
    
    if (modelLabel && sender === 'assistant') {
        const meta = document.createElement('span');
        meta.className = 'message-meta';
        meta.innerHTML = `<i class="fa-solid fa-bolt"></i> via ${modelLabel}`;
        bubble.appendChild(meta);
    }
    
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
}

export function renderSavedChat() {
    const container = document.getElementById('chat-container');
    if (!container) return;
    
    if (State.conversationHistory.length > 0) {
        const welcome = container.querySelector('.welcome-message');
        if (welcome) welcome.remove();
    }
    
    const displayMessages = State.conversationHistory.filter(msg => msg.role !== 'system');
    
    displayMessages.forEach(msg => {
        const bubble = document.createElement('div');
        bubble.className = `message ${msg.role === 'user' ? 'user' : 'assistant'}`;
        
        if (msg.role === 'assistant' && typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
            const rawHtml = marked.parse(msg.content, { breaks: true, gfm: true });
            bubble.innerHTML = DOMPurify.sanitize(rawHtml);
        } else {
            bubble.innerText = msg.content;
        }
        
        container.appendChild(bubble);
    });
    container.scrollTop = container.scrollHeight;
}
