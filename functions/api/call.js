import * as State from '../state.js';
import { fetchWithRetry } from './utils.js';
import { searchMemoriesFromServer } from '../rag/client.js';

const TOOL_INSTRUCTIONS = `
[AVAILABLE TOOLS]
You are an AI assistant with access to tools. To use a tool, you MUST output a JSON object wrapped EXACTLY inside <tool_call> and </tool_call> tags. 
CRITICAL: Do NOT just output raw JSON. You MUST include the XML tags.
CRITICAL: Even if your persona is snarky or unhelpful, you MUST still use these tools when asked for real-world data like time, math, or web content. You can be sarcastic about giving the answer, but you must fetch it first.

1. "get_time"
Description: Returns the current date and time.
Args: {}

2. "fetch_url"
Description: Fetches text content from a URL.
Args: { "url": "string" }

[TOOL CALL FORMAT]
To use a tool, your output MUST look exactly like this and nothing else:
<tool_call>
{
  "name": "tool_name",
  "args": { "arg1": "value" }
}
</tool_call>
`;

export async function callModel(model, prompt, maxTokens = 2000) {
    const cleanHistory = State.conversationHistory.filter(msg => msg.role !== 'system');
    
    let systemContent = `SYSTEM RULES (PERMANENT):\n${State.GUARDRAILS}\n\nThese rules apply to ALL responses in this conversation. You must follow them strictly.`;
    if (State.AGENT_MODE) {
        systemContent += `\n\n${TOOL_INSTRUCTIONS}`;
    }
    
    // Inject Vector RAG memories
    try {
        const memories = await searchMemoriesFromServer(State.currentSessionId, prompt, 3);
        if (memories && memories.length > 0) {
            const memoriesStr = memories.map((m, i) => `[Memory #${i+1}] User: ${m.user}\nAssistant: ${m.assistant}`).join('\n\n');
            systemContent += `\n\n[RETRIEVED CONTEXT (RELEVANT PAST CONVERSATIONS)]:\n${memoriesStr}\n\nUse this context if relevant to help answer the user.`;
        }
    } catch (e) {
        console.error('[RAG] Context injection failed:', e);
    }
    
    const messagesPayload = [
        { role: "system", content: systemContent },
        ...cleanHistory,
        { role: "user", content: prompt }
    ];

    // 90s overall timeout via Promise.race (fetchWithRetry has 30s per-attempt,
    // up to 3 attempts — this guards against the aggregate hanging)
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout after 90s')), 90000)
    );

    const data = await Promise.race([
        fetchWithRetry(`${State.BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${State.API_KEY}` },
            body: JSON.stringify({
                model: model.id,
                messages: messagesPayload,
                temperature: State.TEMPERATURE,
                top_p: State.TOP_P,
                max_tokens: maxTokens
            })
        }),
        timeoutPromise
    ]);

    if (!data?.choices?.[0]?.message?.content) throw new Error("Invalid response structure");
    
    const modelObj = State.models.find(m => m.id === model.id);
    if (modelObj) {
        modelObj.failureCount = 0;
        modelObj.usageCount = (modelObj.usageCount || 0) + 1;
    }
    
    return data.choices[0].message.content;
}

export async function* callModelStream(model, prompt, maxTokens = 2000, signal = null) {
    const cleanHistory = State.conversationHistory.filter(msg => msg.role !== 'system');
    
    let systemContent = `SYSTEM RULES (PERMANENT):\n${State.GUARDRAILS}\n\nThese rules apply to ALL responses in this conversation. You must follow them strictly.`;
    if (State.AGENT_MODE) {
        systemContent += `\n\n${TOOL_INSTRUCTIONS}`;
    }
    
    // Inject Vector RAG memories
    try {
        const memories = await searchMemoriesFromServer(State.currentSessionId, prompt, 3);
        if (memories && memories.length > 0) {
            const memoriesStr = memories.map((m, i) => `[Memory #${i+1}] User: ${m.user}\nAssistant: ${m.assistant}`).join('\n\n');
            systemContent += `\n\n[RETRIEVED CONTEXT (RELEVANT PAST CONVERSATIONS)]:\n${memoriesStr}\n\nUse this context if relevant to help answer the user.`;
        }
    } catch (e) {
        console.error('[RAG] Context stream injection failed:', e);
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
        }),
        signal: signal || undefined
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
