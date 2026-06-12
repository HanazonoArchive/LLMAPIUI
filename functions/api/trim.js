import * as State from '../state.js';
import { log } from '../logger.js';
import * as MemoryMath from '../memoryMath.js';

export function trimConversationHistory() {
    const threshold = State.MEMORY_THRESHOLD_TURNS || 12;
    
    // Find system message
    const systemMessage = State.conversationHistory.find(m => m.role === 'system');
    const rawHistory = State.conversationHistory.filter(m => m.role !== 'system');
    
    if (rawHistory.length <= threshold) return;
    
    // We compress 4 messages at a time (2 complete turn pairs)
    const archiveCount = 4;
    const sliceToArchive = rawHistory.slice(0, archiveCount);
    const remainingHistory = rawHistory.slice(archiveCount);
    
    log(`[Memory Engine] Compressing oldest ${archiveCount} stale messages...`, 'info');
    
    // Extract new tags
    const newTags = MemoryMath.archiveHistorySlice(sliceToArchive, 4);
    
    // Merge tags, filter duplicates, keep up to 8 tags
    let mergedTags = [...State.archiveContextClusters];
    newTags.forEach(tag => {
        if (!mergedTags.includes(tag)) {
            mergedTags.push(tag);
        }
    });
    
    if (mergedTags.length > 8) {
        mergedTags = mergedTags.slice(-8);
    }
    
    State.setArchiveContextClusters(mergedTags);
    State.saveArchiveContext();
    
    log(`[Memory Engine] Memory digested. Added: ${newTags.join(', ') || 'none'}. Archive context: ${mergedTags.join(', ')}`, 'success');
    
    // Save updated history
    const newHistory = systemMessage ? [systemMessage, ...remainingHistory] : remainingHistory;
    State.setConversationHistory(newHistory);
}
