import * as State from './functions/state.js';
import { log, clearLogs } from './functions/logger.js';
import * as API from './functions/api.js';
import { validateResponse, redactContent } from './functions/validator.js';
import * as UI from './functions/ui.js';

document.addEventListener('DOMContentLoaded', () => {
    // Bind functions to window so that index.html and dynamic elements can call them
    window.log = log;
    window.clearLogs = clearLogs;
    window.appendMessage = UI.appendMessage;
    window.showTypingIndicator = UI.showTypingIndicator;
    window.hideTypingIndicator = UI.hideTypingIndicator;
    window.switchSession = switchSession;
    window.createNewSession = createNewSession;
    window.renameActiveSession = renameActiveSession;
    window.deleteActiveSession = deleteActiveSession;
    window.toggleSessionDropdown = toggleSessionDropdown;
    window.toggleAgentMode = toggleAgentMode;

    if (!State.securityWarningShown) {
        console.warn('API Key stored in localStorage - This is safe for personal use only. Do not deploy publicly.');
        State.setSecurityWarningShown(true);
    }
    
    const activeSession = State.loadSettings();
    UI.renderSessionsDropdown();
    UI.updateTokenThermometer();
    if (activeSession) {
        UI.renderSavedChat();
        UI.renderMemoryClusters();
        if (State.conversationHistory.length > 0) {
            log(`Restored ${State.conversationHistory.filter(m => m.role !== 'system').length / 2} turns.`, 'success');
        }
    }
    
    // Populate all settings fields from State (single source of truth)
    const textFields = {
        'input-url':              State.BASE_URL,
        'input-key':              State.API_KEY,
        'input-cooldown':         State.COOLDOWN_TIME,
        'input-guardrails':       State.GUARDRAILS,
        'input-retries':          State.MAX_RETRIES,
        'input-max-tokens':       State.MAX_TOKENS_PER_MODEL,
        'input-memory-threshold': State.MEMORY_THRESHOLD_TURNS,
        'input-tts-url':          State.TTS_ENDPOINT,
        'input-exclude-keywords': State.EXCLUDE_KEYWORDS,
        'input-temperature':      State.TEMPERATURE,
        'input-top-p':            State.TOP_P,
    };
    Object.entries(textFields).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    });

    // Checkboxes
    const rememberKeyEl = document.getElementById('input-remember-key');
    if (rememberKeyEl) rememberKeyEl.checked = State.REMEMBER_KEY;
    const ttsEnabledEl = document.getElementById('input-tts-enabled');
    if (ttsEnabledEl) ttsEnabledEl.checked = State.TTS_ENABLED;

    // Slider display spans
    const tempDisplay = document.getElementById('display-temperature');
    if (tempDisplay) tempDisplay.innerText = State.TEMPERATURE;
    const topPDisplay = document.getElementById('display-top-p');
    if (topPDisplay) topPDisplay.innerText = State.TOP_P;

    API.fetchModels();
    if (State.ENABLE_HEALTH_CHECKS) API.startHealthChecks();
    
    const inputField = document.getElementById('user-input');
    if (inputField) {
        // Auto-resize textarea as user types
        inputField.addEventListener('input', () => {
            inputField.style.height = 'auto';
            inputField.style.height = Math.min(inputField.scrollHeight, 160) + 'px';
        });

        // Enter = send, Shift+Enter = new line
        inputField.addEventListener('keydown', (e) => {
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
    inputField.style.height = 'auto';
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
            assistantBubble.querySelectorAll('pre code').forEach(el => {
                if (typeof hljs !== 'undefined') {
                    hljs.highlightElement(el);
                }
            });
        } else {
            assistantBubble.innerText = safeText;
        }
        chatContainer.scrollTop = chatContainer.scrollHeight;
    };
    
    try {
        let currentPrompt = prompt;
        let finalResponseText = "";
        let finalModelId = "";
        let isFirstIteration = true;
        
        for (let i = 0; i < 5; i++) {
            const result = await sendMessageWithRetry(currentPrompt, null, 0, onChunk);
            const responseText = result.text;
            
            // Check for tool call (either wrapped in XML tags or just raw JSON)
            let toolMatch = responseText.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
            let toolJsonRaw = null;
            
            if (toolMatch) {
                toolJsonRaw = toolMatch[1].trim();
            } else {
                // Fallback: try to find a raw JSON object that looks like a tool call
                const fallbackMatch = responseText.match(/{\s*"name"\s*:\s*"[^"]+"\s*,\s*"args"\s*:\s*{[\s\S]*?}\s*}/);
                if (fallbackMatch) {
                    toolJsonRaw = fallbackMatch[0].trim();
                }
            }
            
            if (toolJsonRaw) {
                // Tool Call Detected
                let toolName, toolArgs;
                let parseSuccess = false;
                let toolResultString = "";
                
                try {
                    const parsed = JSON.parse(toolJsonRaw);
                    toolName = parsed.name;
                    toolArgs = parsed.args;
                    parseSuccess = true;
                } catch (e) {
                    toolResultString = `[Error] Failed to parse JSON: ${e.message}`;
                }
                
                if (parseSuccess) {
                    // Update UI to show tool usage (subtle)
                    const toolIndicator = document.createElement('div');
                    toolIndicator.className = 'tool-indicator';
                    toolIndicator.innerHTML = `<i class="fa-solid fa-gear fa-spin text-muted"></i> <span>Using tool: <b>${toolName}</b>...</span>`;
                    document.getElementById('chat-container').appendChild(toolIndicator);
                    document.getElementById('chat-container').scrollTop = document.getElementById('chat-container').scrollHeight;
                    
                    try {
                        const res = await fetch('http://localhost:3000/api/tools/execute', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: toolName, args: toolArgs })
                        });
                        const data = await res.json();
                        toolResultString = data.success ? data.result : `[Error] ${data.error}`;
                        toolIndicator.innerHTML = `<i class="fa-solid fa-check text-success"></i> <span>Tool used: <b>${toolName}</b></span>`;
                    } catch (err) {
                        toolResultString = `[Error] Network failed: ${err.message}`;
                        toolIndicator.innerHTML = `<i class="fa-solid fa-xmark text-danger"></i> <span>Tool failed: <b>${toolName}</b></span>`;
                    }
                    
                    // Clean the JSON out of the chat bubble so the user doesn't see the ugly raw tool call
                    if (assistantBubble) {
                        let cleanedText = responseText;
                        if (toolMatch) {
                            cleanedText = cleanedText.replace(toolMatch[0], '');
                        } else {
                            cleanedText = cleanedText.replace(toolJsonRaw, '');
                        }
                        cleanedText = cleanedText.trim();
                        
                        if (cleanedText === '') {
                            assistantBubble.style.display = 'none';
                        } else {
                            assistantBubble.innerHTML = typeof marked !== "undefined" ? DOMPurify.sanitize(marked.parse(cleanedText)) : cleanedText;
                        }
                    }
                }
                
                // Save this turn to history
                let currentHistory = [...State.conversationHistory];
                currentHistory.push({ role: "user", content: isFirstIteration ? prompt : currentPrompt });
                currentHistory.push({ role: "assistant", content: responseText });
                State.setConversationHistory(currentHistory);
                
                // Prepare next prompt
                currentPrompt = `[TOOL RESULT for ${toolName || 'tool'}]:\n${toolResultString}\n\nCRITICAL INSTRUCTION: You MUST explicitly state the factual data from the tool result above in your response. You can maintain your assigned persona, but you cannot hide the actual answer.`;
                assistantBubble = null; // reset for next chunk
                isFirstIteration = false;
                
            } else {
                // Final response
                finalResponseText = responseText;
                finalModelId = result.modelId;
                
                // Save this turn to history
                let currentHistory = [...State.conversationHistory];
                currentHistory.push({ role: "user", content: isFirstIteration ? prompt : currentPrompt });
                currentHistory.push({ role: "assistant", content: finalResponseText });
                State.setConversationHistory(currentHistory);
                
                break; // exit loop
            }
        }
        
        UI.hideTypingIndicator();
        
        const validatedResponse = validateResponse(finalResponseText);
        const safeResponse = redactContent(validatedResponse);
        
        // Add the model metadata label to the completed assistant bubble
        if (assistantBubble && finalModelId) {
            const meta = document.createElement('span');
            meta.className = 'message-meta';
            meta.innerHTML = `<i class="fa-solid fa-bolt"></i> via ${finalModelId}`;
            assistantBubble.appendChild(meta);
        }

        UI.forwardToTTS(safeResponse);
        
        API.trimConversationHistory();
        localStorage.setItem('llmapiui_memory', JSON.stringify(State.conversationHistory));
        State.setPendingUserMessage(null);
        UI.updateTokenThermometer();
        
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
    const tempInput = document.getElementById('input-temperature');
    const topPInput = document.getElementById('input-top-p');
    
    // Initialize Agent Mode button state
    const agentModeBtn = document.getElementById('agent-mode-btn');
    if (agentModeBtn) {
        if (State.AGENT_MODE) {
            agentModeBtn.classList.add('active');
            agentModeBtn.innerHTML = `<i class="fa-solid fa-robot"></i> Agent Mode: ON`;
        } else {
            agentModeBtn.classList.remove('active');
            agentModeBtn.innerHTML = `<i class="fa-solid fa-robot"></i> Agent Mode: OFF`;
        }
    }
    
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
    const temperature = tempInput?.value || "0.7";
    const topP = topPInput?.value || "0.9";
    
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
    localStorage.setItem('llmapiui_temperature', temperature);
    localStorage.setItem('llmapiui_top_p', topP);
    
    log("Settings saved.", "success");
    State.loadSettings();
    UI.updateTokenThermometer();
    
    if (window.closeSettingsModal) {
        window.closeSettingsModal();
    }
    
    API.fetchModels();
}

function clearConversation() {
    if (!confirm('Clear all messages and start fresh in this session? This cannot be undone.')) return;
    State.setConversationHistory([]);
    State.setSystemMessageAdded(false);
    State.setPendingUserMessage(null);
    localStorage.removeItem('llmapiui_memory');
    UI.clearChatUI();
    UI.updateTokenThermometer();
    log('Conversation cleared.', 'warning');
}

function resetGuardrailsToDefault() {
    localStorage.removeItem('llmapiui_guardrails');
    // Re-run loadSettings so State.GUARDRAILS picks up the code default
    State.loadSettings();
    const el = document.getElementById('input-guardrails');
    if (el) el.value = State.GUARDRAILS;
    log('Guardrails reset to default Rei persona.', 'success');
}

function switchSession(id) {
    if (State.switchSession(id)) {
        UI.clearChatUI();
        UI.renderSavedChat();
        UI.renderSessionsDropdown();
        UI.updateTokenThermometer();
        UI.renderMemoryClusters();
        log(`Switched to session: ${State.sessions.find(s => s.id === id).name}`, 'info');
    }
}

function createNewSession() {
    const name = prompt("Enter a name for the new session:", `Session ${State.sessions.length + 1}`);
    if (name === null) return; // cancelled
    const sessionName = name.trim() || `Session ${State.sessions.length + 1}`;
    
    const sess = State.createNewSession(sessionName);
    UI.clearChatUI();
    UI.renderSessionsDropdown();
    UI.updateTokenThermometer();
    UI.renderMemoryClusters();
    log(`Created new session: ${sess.name}`, 'success');
}

function renameActiveSession() {
    const active = State.sessions.find(s => s.id === State.currentSessionId);
    if (!active) return;
    const newName = prompt(`Rename session "${active.name}" to:`, active.name);
    if (!newName || !newName.trim()) return;
    active.name = newName.trim();
    State.saveSessions();
    UI.renderSessionsDropdown();
    log(`Session renamed to "${active.name}"`, 'success');
}

function deleteActiveSession() {
    const active = State.sessions.find(s => s.id === State.currentSessionId);
    if (!active) return;
    if (!confirm(`Are you sure you want to delete session "${active.name}"?`)) return;
    
    State.deleteSession(State.currentSessionId);
    UI.clearChatUI();
    UI.renderSavedChat();
    UI.renderSessionsDropdown();
    UI.updateTokenThermometer();
    UI.renderMemoryClusters();
    log(`Session deleted.`, 'warning');
}

function toggleSessionDropdown(e) {
    e.stopPropagation();
    const menu = document.getElementById('session-dropdown-menu');
    const trigger = document.getElementById('session-dropdown-trigger');
    if (!menu || !trigger) return;
    const isOpen = menu.classList.contains('open');
    menu.classList.toggle('open', !isOpen);
    trigger.classList.toggle('open', !isOpen);
}

window.sendMessage = sendMessage;
window.saveSettings = saveSettings;
window.clearConversation = clearConversation;
window.resetGuardrailsToDefault = resetGuardrailsToDefault;
window.clearLogs = clearLogs;
window.switchSession = switchSession;
window.createNewSession = createNewSession;
window.renameActiveSession = renameActiveSession;
window.deleteActiveSession = deleteActiveSession;
window.toggleSessionDropdown = toggleSessionDropdown;

// ==================== AGENT MODE ====================
function toggleAgentMode() {
    const newState = !State.AGENT_MODE;
    State.setAgentMode(newState);
    localStorage.setItem('llmapiui_agent_mode', newState.toString());
    
    const btn = document.getElementById('agent-mode-btn');
    if (btn) {
        if (newState) {
            btn.classList.add('active');
            btn.innerHTML = `<i class="fa-solid fa-robot"></i> Agent Mode: ON`;
            log("Agent Mode enabled. Tools will be available.", "info");
        } else {
            btn.classList.remove('active');
            btn.innerHTML = `<i class="fa-solid fa-robot"></i> Agent Mode: OFF`;
            log("Agent Mode disabled. Tools are hidden.", "info");
        }
    }
}