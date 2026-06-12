// Client communicator for local backend RAG APIs
import { log } from '../logger.js';

/**
 * Send messages to server to chunk, embed, and archive
 * @param {string} sessionId
 * @param {Array} messages
 * @returns {Promise<boolean>}
 */
export async function archiveMessagesToServer(sessionId, messages) {
    if (!sessionId || !messages || messages.length === 0) return false;
    
    try {
        log(`[RAG Client] Sending ${messages.length} messages to archive...`, 'info');
        const response = await fetch('/api/memory/archive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, messages })
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Server error');
        }
        
        const data = await response.json();
        log(`[RAG Client] Successfully archived ${data.count} turn pairs on the server.`, 'success');
        return true;
    } catch (e) {
        log(`[RAG Client] Failed to archive memories: ${e.message}`, 'error');
        return false;
    }
}

/**
 * Query the vector search endpoint for related memories
 * @param {string} sessionId
 * @param {string} query
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function searchMemoriesFromServer(sessionId, query, limit = 3) {
    if (!sessionId || !query.trim()) return [];
    
    try {
        const response = await fetch('/api/memory/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, query, limit })
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Server error');
        }
        
        const data = await response.json();
        return data.matches || [];
    } catch (e) {
        log(`[RAG Client] Memory search failed: ${e.message}`, 'error');
        return [];
    }
}

/**
 * Fetch list of all stored memory turn pair details for rendering
 * @param {string} sessionId
 * @returns {Promise<Array>}
 */
export async function fetchMemoriesList(sessionId) {
    if (!sessionId) return [];
    
    try {
        const response = await fetch('/api/memory/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId })
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Server error');
        }
        
        const data = await response.json();
        return data.memories || [];
    } catch (e) {
        log(`[RAG Client] Failed to retrieve memories list: ${e.message}`, 'error');
        return [];
    }
}

/**
 * Tell server to wipe memories for the session
 * @param {string} sessionId
 * @returns {Promise<boolean>}
 */
export async function clearMemoriesOnServer(sessionId) {
    if (!sessionId) return false;
    
    try {
        const response = await fetch('/api/memory/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId })
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Server error');
        }
        
        log(`[RAG Client] Cleared server-side memories for session: ${sessionId}`, 'warning');
        return true;
    } catch (e) {
        log(`[RAG Client] Failed to clear memories: ${e.message}`, 'error');
        return false;
    }
}
