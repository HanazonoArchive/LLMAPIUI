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
    
    // Merge tags with temporal decay
    const clusterMap = new Map();
    
    // Decay existing tags
    State.archiveContextClusters.forEach(c => {
        if (typeof c === 'string') {
            clusterMap.set(c, 0.75);
        } else if (c && c.tag) {
            clusterMap.set(c.tag, c.weight * 0.75);
        }
    });
    
    // Add new tags with weight 1.0 (reinforcing if already exists)
    newTags.forEach(tag => {
        const currentWeight = clusterMap.get(tag) || 0;
        clusterMap.set(tag, Math.min(1.0, currentWeight + 1.0));
    });
    
    // Filter out very weak tags, sort by weight descending, and keep up to 8
    let mergedTags = Array.from(clusterMap.entries())
        .map(([tag, weight]) => ({ tag, weight }))
        .filter(c => c.weight >= 0.15)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 8);
    
    State.setArchiveContextClusters(mergedTags);
    State.saveArchiveContext();
    
    const tagDisplayList = mergedTags.map(c => `${c.tag} (${c.weight.toFixed(2)})`);
    log(`[Memory Engine] Memory digested. Added: ${newTags.join(', ') || 'none'}. Archive context: ${tagDisplayList.join(', ')}`, 'success');
    
    // Dynamic import to avoid circular dependency locks and update the UI
    import('../ui.js').then(m => {
        if (m.renderMemoryClusters) {
            m.renderMemoryClusters();
        }
    });
    
    // Save updated history
    const newHistory = systemMessage ? [systemMessage, ...remainingHistory] : remainingHistory;
    State.setConversationHistory(newHistory);
}
