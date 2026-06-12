import * as State from './functions/state.js';
import { log, clearLogs } from './functions/logger.js';
import * as API from './functions/api.js';
import { validateResponse, redactContent } from './functions/validator.js';
import * as UI from './functions/ui.js';

document.addEventListener('DOMContentLoaded', () => {
    if (!State.securityWarningShown) {
        console.warn('API Key stored in localStorage - This is safe for personal use only. Do not deploy publicly.');
        State.setSecurityWarningShown(true);
    }
    
    const activeSession = State.loadSettings();
    if (activeSession) {
        UI.renderSavedChat();
        if (State.conversationHistory.length > 0) {
            log(`Restored ${State.conversationHistory.filter(m => m.role !== 'system').length / 2} turns.`, 'success');
        }
    }
    
    const fields = {
        'input-url': State.BASE_URL, 
        'input-key': State.API_KEY, 
        'input-cooldown': State.COOLDOWN_TIME,
        'input-guardrails': State.GUARDRAILS, 
        'input-retries': State.MAX_RETRIES, 
        'input-max-tokens': State.MAX_TOKENS_PER_MODEL
    };
    Object.keys(fields).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = fields[id];
    });

    API.fetchModels();
    if (State.ENABLE_HEALTH_CHECKS) API.startHealthChecks();
    
    const inputField = document.getElementById('user-input');
    if (inputField) {
        inputField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
});

async function sendMessage() {
    if (!State.API_KEY || !State.BASE_URL) {
        log("Please configure API credentials first.", "error");
        alert("Please configure API credentials first. Open Gateway Settings in the sidebar.");
        return;
    }
    
    const inputField = document.getElementById('user-input');
    const rawPrompt = inputField?.value.trim();
    if (!rawPrompt) return;

    inputField.value = '';
    UI.appendMessage(rawPrompt, 'user');

    let prompt = redactContent(rawPrompt);
    
    State.setPendingUserMessage(prompt);
    UI.showTypingIndicator();
    
    let assistantBubble = null;
    const onChunk = (accumulatedText) => {
        UI.hideTypingIndicator();
        const chatContainer = document.getElementById('chat-container');
        if (!chatContainer) return;
        
        const safeText = redactContent(accumulatedText);
        
        if (!assistantBubble) {
            const welcome = chatContainer.querySelector('.welcome-message');
            if (welcome) welcome.remove();

            assistantBubble = document.createElement('div');
            assistantBubble.className = 'message assistant';
            chatContainer.appendChild(assistantBubble);
        }
        
        if (typeof marked !== "undefined" && typeof DOMPurify !== "undefined") {
            const rawHtml = marked.parse(safeText, { breaks: true, gfm: true });
            assistantBubble.innerHTML = DOMPurify.sanitize(rawHtml);
        } else {
            assistantBubble.innerText = safeText;
        }
        chatContainer.scrollTop = chatContainer.scrollHeight;
    };
    
    try {
        const result = await sendMessageWithRetry(prompt, null, 0, onChunk);
        UI.hideTypingIndicator();

        const validatedResponse = validateResponse(result.text);
        const safeResponse = redactContent(validatedResponse);
        
        // Add the model metadata label to the completed assistant bubble
        if (assistantBubble && result.modelId) {
            const meta = document.createElement('span');
            meta.className = 'message-meta';
            meta.innerHTML = `<i class="fa-solid fa-bolt"></i> via ${result.modelId}`;
            assistantBubble.appendChild(meta);
        }

        UI.forwardToTTS(safeResponse);
        
        let newHistory = [...State.conversationHistory];
        if (!State.systemMessageAdded && newHistory.length === 0) {
            newHistory.unshift({
                role: "system",
                content: `SYSTEM RULES (PERMANENT):\n${State.GUARDRAILS}\n\nThese rules apply to ALL responses in this conversation. You must follow them strictly.`
            });
            State.setSystemMessageAdded(true);
            log("Permanent system guardrails added to conversation", 'success');
        }
        
        newHistory.push({ role: "user", content: prompt }, { role: "assistant", content: safeResponse });
        State.setConversationHistory(newHistory);
        
        API.trimConversationHistory();
        localStorage.setItem('llmapiui_memory', JSON.stringify(State.conversationHistory));
        State.setPendingUserMessage(null);
        
    } catch (error) {
        UI.hideTypingIndicator();
        
        const chatContainer = document.getElementById('chat-container');
        if (chatContainer?.lastChild?.classList?.contains('user')) {
            chatContainer.lastChild.remove();
        }
        if (assistantBubble) {
            assistantBubble.remove();
        }
        
        log(`All models failed: ${error.message}`, 'error');
        
        const errorMsg = document.createElement('div');
        errorMsg.className = 'message assistant';
        errorMsg.style.cssText = 'opacity: 0.7; font-style: italic;';
        errorMsg.innerText = "All LLM endpoints are currently unavailable. Please check your connection or wait for cooldowns.";
        chatContainer?.appendChild(errorMsg);
        chatContainer?.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
        
        setTimeout(() => errorMsg.remove?.(), 5000);
        State.setPendingUserMessage(null);
    }
}

async function sendMessageWithRetry(prompt, previousPartialResponse = null, retryDepth = 0, onChunk) {
    const MAX_DEPTH = 3;
    if (retryDepth > MAX_DEPTH) {
        log(`Max retry depth reached (${MAX_DEPTH}), giving up`, 'error');
        throw new Error("Max retry depth exceeded");
    }
    
    const failedModels = new Set();
    let lastError = null;
    
    for (let attempt = 0; attempt < State.MAX_RETRIES; attempt++) {
        const availableModels = State.models.filter(m => 
            !m.excluded && m.status !== 'red' && API.isModelAvailable(m) && !failedModels.has(m.id)
        );
        
        if (availableModels.length === 0) {
            log(`No available models found`, 'warning');
            await API.wait(2000);
            continue;
        }
        
        // Anti-hotspotting sort
        availableModels.sort((a, b) => {
            const latA = State.modelLatency.get(a.id) ?? Infinity;
            const latB = State.modelLatency.get(b.id) ?? Infinity;
            
            const virtualPenaltyA = (a.usageCount || 0) * 150;
            const virtualPenaltyB = (b.usageCount || 0) * 150;
            
            return (latA + virtualPenaltyA) - (latB + virtualPenaltyB);
        });
        
        const model = availableModels[0];
        const isContinuation = previousPartialResponse !== null;
        let finalPrompt = prompt;
        let maxTokensValue = State.MAX_TOKENS_PER_MODEL;
        
        if (isContinuation) {
            finalPrompt = `[CONTINUE DIRECTLY from where you stopped. Do not repeat. Start from the last word:]\n${previousPartialResponse}`;
            maxTokensValue = Math.min(State.MAX_TOKENS_PER_MODEL * 2, 8000);
            log(`Continuation request (depth ${retryDepth + 1})`, 'info');
        }
        
        log(`Attempt ${attempt + 1}/${State.MAX_RETRIES} on ${model.id}${isContinuation ? ' (continuation)' : ''}`, 'info');
        UI.highlightModelInUI(model.id);
        
        const startTime = performance.now();
        let accumulatedResponse = "";
        
        try {
            const stream = API.callModelStream(model, finalPrompt, maxTokensValue);
            for await (const chunk of stream) {
                accumulatedResponse += chunk;
                if (onChunk) {
                    const currentTotal = isContinuation && previousPartialResponse
                        ? previousPartialResponse + ' ' + accumulatedResponse
                        : accumulatedResponse;
                    onChunk(currentTotal);
                }
            }
            
            const latency = performance.now() - startTime;
            API.recordLatency(model.id, latency);
            
            let finalResponse = accumulatedResponse;
            if (isContinuation && previousPartialResponse) {
                finalResponse = previousPartialResponse + ' ' + accumulatedResponse;
                log(`🔗 Combined response (${previousPartialResponse.length} + ${accumulatedResponse.length} chars)`, 'success');
            }
            
            const validated = validateResponse(finalResponse);
            if (validated) {
                log(`Success on ${model.id} (${Math.round(latency)}ms)`, 'success');
                API.triggerCooldown(model);
                return { text: validated, modelId: model.id };
            } else {
                log(`${model.id} returned invalid response, marking failed`, 'warning');
                failedModels.add(model.id);
                model.failureCount = (model.failureCount || 0) + 1;
                if (model.failureCount >= 2) {
                    API.autoExcludeModel(model.id, `${model.failureCount} invalid responses`);
                }
            }
            
        } catch (error) {
            const latency = performance.now() - startTime;
            lastError = error;
            
            const modelObj = State.models.find(m => m.id === model.id);
            if (modelObj) modelObj.failureCount = (modelObj.failureCount || 0) + 1;
            
            // Try to recover from mid-stream network failures
            if (accumulatedResponse.length > 50 && retryDepth < MAX_DEPTH) {
                log(`Stream connection dropped halfway on ${model.id}, attempting continuation...`, 'warning');
                const partialResponse = isContinuation && previousPartialResponse
                    ? previousPartialResponse + ' ' + accumulatedResponse
                    : accumulatedResponse;
                return sendMessageWithRetry(prompt, partialResponse, retryDepth + 1, onChunk);
            }
            
            if (error.message.includes('maximum context length') || 
                error.message.includes('token limit') || 
                error.message.includes('too many tokens') || 
                State.TOKEN_LIMIT_ERROR_CODES.includes(error.status)) {
                API.handleTokenLimitExceeded(model.id, error);
                failedModels.add(model.id);
                continue;
            }
            
            if (error.isCutOff && error.partialResponse && !isContinuation && retryDepth < MAX_DEPTH) {
                log(`Cut-off detected, retrying with continuation (depth ${retryDepth + 1})`, 'warning');
                return sendMessageWithRetry(prompt, error.partialResponse, retryDepth + 1, onChunk);
            }
            
            if (error.message.includes('content-length') || error.message.includes('incomplete')) {
                log(`${model.id} returned incomplete response - auto-excluding`, 'error');
                API.autoExcludeModel(model.id, 'incomplete response (content-length mismatch)');
            } else if (error.status === 429 || error.message.includes('rate limit')) {
                log(`${model.id} rate limited (${Math.round(latency)}ms)`, 'warning');
                API.triggerCooldown(model);
            } else if (error.status === 401 || error.status === 403) {
                API.autoExcludeModel(model.id, 'authentication failed');
            } else if (error.message.includes('timeout')) {
                log(`${model.id} timeout (${Math.round(latency)}ms)`, 'warning');
            } else if (error.status === 500 || error.status === 502 || error.status === 503) {
                log(`${model.id} server error (${error.status})`, 'warning');
                if (modelObj && modelObj.failureCount >= 2) {
                    API.autoExcludeModel(model.id, `${modelObj.failureCount} server errors`);
                }
            } else {
                log(`${model.id} failed: ${error.message}`, 'error');
                if (modelObj && modelObj.failureCount >= 2) {
                    API.autoExcludeModel(model.id, `${modelObj.failureCount} consecutive failures`);
                }
            }
            failedModels.add(model.id);
        }
    }
    throw new Error(lastError?.message || "All models exhausted");
}

function saveSettings() {
    const urlInput = document.getElementById('input-url');
    const keyInput = document.getElementById('input-key');
    const rememberKeyInput = document.getElementById('input-remember-key');
    const cooldownInput = document.getElementById('input-cooldown');
    const excludeKeywordsInput = document.getElementById('input-exclude-keywords');
    const guardrailsInput = document.getElementById('input-guardrails');
    const retriesInput = document.getElementById('input-retries');
    const maxTokensInput = document.getElementById('input-max-tokens');
    const ttsEnabledInput = document.getElementById('input-tts-enabled');
    const ttsUrlInput = document.getElementById('input-tts-url');
    const memoryThresholdInput = document.getElementById('input-memory-threshold');
    
    const newUrl = urlInput?.value.trim() || "";
    const newKey = keyInput?.value.trim() || "";
    const rememberKey = rememberKeyInput ? rememberKeyInput.checked : true;
    const newCooldown = cooldownInput?.value.trim() || "99";
    const excludeKeywords = excludeKeywordsInput?.value.trim() || "";
    const newGuardrails = guardrailsInput?.value || "";
    const newRetries = retriesInput?.value || "3";
    const newMaxTokens = maxTokensInput?.value.trim() || "2000";
    const ttsEnabled = ttsEnabledInput ? ttsEnabledInput.checked : false;
    const ttsUrl = ttsUrlInput?.value.trim() || "http://127.0.0.1:8000/generate-speech";
    const memoryThreshold = memoryThresholdInput?.value.trim() || "12";
    
    if (!newUrl || !newKey) {
        alert("Please fill in both Base URL and API Key.");
        return;
    }
    
    localStorage.setItem('llmapiui_base_url', newUrl);
    localStorage.setItem('llmapiui_remember_key', rememberKey.toString());
    
    if (rememberKey) {
        localStorage.setItem('llmapiui_api_key', newKey);
    } else {
        localStorage.removeItem('llmapiui_api_key');
        State.setAPIKey(newKey); // Store in memory only
    }
    
    localStorage.setItem('llmapiui_cooldown', newCooldown);
    localStorage.setItem('llmapiui_exclude_keywords', excludeKeywords);
    localStorage.setItem('llmapiui_guardrails', newGuardrails);
    localStorage.setItem('llmapiui_max_retries', newRetries);
    localStorage.setItem('llmapiui_max_tokens', newMaxTokens);
    localStorage.setItem('llmapiui_tts_enabled', ttsEnabled.toString());
    localStorage.setItem('llmapiui_tts_url', ttsUrl);
    localStorage.setItem('llmapiui_memory_threshold', memoryThreshold);
    
    log("Settings saved.", "success");
    State.loadSettings();
    
    if (window.closeSettingsModal) {
        window.closeSettingsModal();
    }
    
    API.fetchModels();
}

window.sendMessage = sendMessage;
window.saveSettings = saveSettings;
window.clearLogs = clearLogs;