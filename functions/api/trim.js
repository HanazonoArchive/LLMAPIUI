import * as State from '../state.js';
import { log } from '../logger.js';
import { archiveMessagesToServer } from '../rag/client.js';

export async function trimConversationHistory() {
    const threshold = State.MEMORY_THRESHOLD_TURNS || 12;
    
    // Find system message
    const systemMessage = State.conversationHistory.find(m => m.role === 'system');
    const rawHistory = State.conversationHistory.filter(m => m.role !== 'system');
    
    if (rawHistory.length <= threshold) return;
    
    // We compress 4 messages at a time (2 complete turn pairs)
    const archiveCount = 4;
    const sliceToArchive = rawHistory.slice(0, archiveCount);
    const remainingHistory = rawHistory.slice(archiveCount);
    
    log(`[Memory Engine] Moving oldest ${archiveCount} stale messages to local Vector RAG store...`, 'info');
    
    // Send to RAG server backend
    const success = await archiveMessagesToServer(State.currentSessionId, sliceToArchive);
    if (success) {
        // Dynamic import to avoid circular dependency locks and update the UI
        import('../ui.js').then(m => {
            if (m.renderMemoryClusters) {
                m.renderMemoryClusters();
            }
            if (m.updateTokenThermometer) {
                m.updateTokenThermometer();
            }
        });
    }
    
    // Save updated history locally on client state
    const newHistory = systemMessage ? [systemMessage, ...remainingHistory] : remainingHistory;
    State.setConversationHistory(newHistory);
}
