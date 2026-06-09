import * as State from './state.js';
import { log } from './logger.js';
import { stripMarkdownForSpeech } from './validator.js';

let typingElement = null;

export function truncateName(fullName) {
    if (fullName.length <= 35) return fullName;
    return fullName.substring(0, 32) + '...';
}

export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function renderModelList() {
    const container = document.getElementById('model-list');
    const countSpan = document.getElementById('pool-count');
    if (!container || !countSpan) return;
    
    container.innerHTML = '';
    const activeCount = State.models.filter(m => m.status === 'green' && !m.excluded).length;
    countSpan.innerText = `${activeCount}/${State.models.length}`;
    
    const sortedModels = [...State.models].sort((a, b) => {
        if (a.status !== b.status) {
            const order = { green: 0, yellow: 1, red: 2 };
            return (order[a.status] || 1) - (order[b.status] || 1);
        }
        const latA = State.modelLatency.get(a.id) ?? Infinity;
        const latB = State.modelLatency.get(b.id) ?? Infinity;
        return latA - latB;
    });
    
    sortedModels.forEach(model => {
        const div = document.createElement('div');
        div.className = 'model-item';
        div.id = `item-${CSS.escape(model.id)}`;
        
        const latency = State.modelLatency.get(model.id);
        const latencyText = latency ? `${Math.round(latency)}ms` : 'untested';
        
        let cooldownText = '';
        if (model.cooldownUntil && model.cooldownUntil > Date.now()) {
            const remaining = Math.round((model.cooldownUntil - Date.now()) / 1000);
            cooldownText = `<span class="cooldown-timer"><i class="fa-solid fa-hourglass-half"></i> ${remaining}s</span>`;
        }
        
        let tokenWarning = '';
        if (model.tokenLimitHits > 0) {
            tokenWarning = `<span class="token-warning" title="Hit token limit ${model.tokenLimitHits} times" style="color: var(--warning); margin-right: 4px;"><i class="fa-solid fa-triangle-exclamation"></i><i class="fa-solid fa-file-lines"></i></span>`;
        }
        
        div.innerHTML = `
            <div class="model-info">
                <input type="checkbox" class="model-checkbox" ${!model.excluded ? 'checked' : ''} 
                       onchange="window.toggleModelInclusion('${escapeHtml(model.id)}', this.checked)">
                <span class="model-name" title="${model.id}">${truncateName(model.id)}</span>
                <span class="model-latency">${latencyText}</span>
                ${tokenWarning}
                ${cooldownText}
            </div>
            <div class="status-dot status-${model.status}"></div>
        `;
        container.appendChild(div);
    });
}

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

export function highlightModelInUI(modelId) {
    document.querySelectorAll('.model-item').forEach(el => el.classList.remove('active-llm'));
    const activeRow = document.getElementById(`item-${CSS.escape(modelId)}`);
    if (activeRow) activeRow.classList.add('active-llm');
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

export async function forwardToTTS(textResponse) {
    const ttsEndpoint = "http://127.0.0.1:8000/generate-speech";
    const cleanSpeechText = stripMarkdownForSpeech(textResponse);
    
    if (!cleanSpeechText) {
        log(`TTS skipped: Response text contains no speakable prose.`, 'warning');
        return;
    }

    log(`<i class="fa-solid fa-volume-high"></i> Forwarding cleaned prose to Kokoro-TTS pipeline...`, 'info');
    console.log(`[TTS Plaintext Target]: "${cleanSpeechText}"`);

    try {
        const response = await fetch(ttsEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: cleanSpeechText })
        });

        if (!response.ok) throw new Error(`TTS server responded with status: ${response.status}`);
        const data = await response.json();
        log(`TTS Audio Compiled: ${data.message || "Success"}`, 'success');

    } catch (error) {
        log(`TTS pipeline error: ${error.message}`, 'error');
        console.error("TTS Forwarding Failed:", error);
    }
}