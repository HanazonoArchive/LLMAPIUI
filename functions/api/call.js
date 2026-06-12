import * as State from '../state.js';
import { fetchWithRetry } from './utils.js';

export async function callModel(model, prompt, maxTokens = 2000) {
    const cleanHistory = State.conversationHistory.filter(msg => msg.role !== 'system');
    
    let systemContent = `SYSTEM RULES (PERMANENT):\n${State.GUARDRAILS}\n\nThese rules apply to ALL responses in this conversation. You must follow them strictly.`;
    if (State.archiveContextClusters && State.archiveContextClusters.length > 0) {
        const clusterStrings = State.archiveContextClusters.map(c => typeof c === 'string' ? c : c.tag);
        systemContent += `\n\n[CONTEXT CLUSTERS (HISTORICAL INTERACTION THEMES): ${clusterStrings.join(' • ')}]`;
    }
    
    const messagesPayload = [
        { role: "system", content: systemContent },
        ...cleanHistory,
        { role: "user", content: prompt }
    ];
    
    const data = await fetchWithRetry(`${State.BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${State.API_KEY}` },
        body: JSON.stringify({ 
            model: model.id, 
            messages: messagesPayload, 
            temperature: State.TEMPERATURE, 
            top_p: State.TOP_P, 
            max_tokens: maxTokens 
        })
    });
    
    if (!data?.choices?.[0]?.message?.content) throw new Error("Invalid response structure");
    
    const modelObj = State.models.find(m => m.id === model.id);
    if (modelObj) {
        modelObj.failureCount = 0;
        modelObj.usageCount = (modelObj.usageCount || 0) + 1;
    }
    
    return data.choices[0].message.content;
}

export async function* callModelStream(model, prompt, maxTokens = 2000) {
    const cleanHistory = State.conversationHistory.filter(msg => msg.role !== 'system');
    
    let systemContent = `SYSTEM RULES (PERMANENT):\n${State.GUARDRAILS}\n\nThese rules apply to ALL responses in this conversation. You must follow them strictly.`;
    if (State.archiveContextClusters && State.archiveContextClusters.length > 0) {
        const clusterStrings = State.archiveContextClusters.map(c => typeof c === 'string' ? c : c.tag);
        systemContent += `\n\n[CONTEXT CLUSTERS (HISTORICAL INTERACTION THEMES): ${clusterStrings.join(' • ')}]`;
    }
    
    const messagesPayload = [
        { role: "system", content: systemContent },
        ...cleanHistory,
        { role: "user", content: prompt }
    ];
    
    const response = await fetch(`${State.BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${State.API_KEY}` 
        },
        body: JSON.stringify({ 
            model: model.id, 
            messages: messagesPayload, 
            temperature: State.TEMPERATURE, 
            top_p: State.TOP_P, 
            max_tokens: maxTokens,
            stream: true
        })
    });
    
    if (!response.ok) {
        let errText = "";
        try { errText = await response.text(); } catch (e) {}
        const error = new Error(errText || `HTTP ${response.status}`);
        error.status = response.status;
        throw error;
    }
    
    if (!response.body) {
        throw new Error("No response body for streaming");
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            
            buffer = lines.pop() || "";
            
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                if (trimmed === "data: [DONE]") continue;
                
                if (trimmed.startsWith("data: ")) {
                    const jsonStr = trimmed.slice(6);
                    try {
                        const parsed = JSON.parse(jsonStr);
                        const content = parsed.choices?.[0]?.delta?.content || "";
                        if (content) {
                            yield content;
                        }
                    } catch (e) {
                        // ignore malformed line
                    }
                }
            }
        }
        
        if (buffer && buffer.startsWith("data: ")) {
            const jsonStr = buffer.slice(6).trim();
            if (jsonStr !== "[DONE]") {
                try {
                    const parsed = JSON.parse(jsonStr);
                    const content = parsed.choices?.[0]?.delta?.content || "";
                    if (content) yield content;
                } catch (e) {}
            }
        }
    } finally {
        reader.releaseLock();
    }
    
    const modelObj = State.models.find(m => m.id === model.id);
    if (modelObj) {
        modelObj.failureCount = 0;
        modelObj.usageCount = (modelObj.usageCount || 0) + 1;
    }
}
