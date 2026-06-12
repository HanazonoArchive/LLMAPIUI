import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import fs from 'fs';
import { pipeline } from '@xenova/transformers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve static assets from the current directory
app.use(express.static(__dirname));

const DB_PATH = path.join(__dirname, 'data', 'vectors.json');

// Helper to load vector database from disk
function loadDB() {
    try {
        if (!fs.existsSync(path.dirname(DB_PATH))) {
            fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
        }
        if (fs.existsSync(DB_PATH)) {
            const raw = fs.readFileSync(DB_PATH, 'utf8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error('[RAG DB] Load DB error:', e);
    }
    return {};
}

// Helper to save vector database to disk
function saveDB(db) {
    try {
        if (!fs.existsSync(path.dirname(DB_PATH))) {
            fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
        }
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
        console.error('[RAG DB] Save DB error:', e);
    }
}

// Lazy-loaded pipeline for local embedding generation
let embeddingPipeline = null;
async function getEmbeddingPipeline() {
    if (!embeddingPipeline) {
        console.log('[Embeddings] Loading pipeline for Xenova/all-MiniLM-L6-v2 (runs locally in Node)...');
        // This will automatically download the ~23MB model on first run and cache it locally
        embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        console.log('[Embeddings] Pipeline loaded successfully.');
    }
    return embeddingPipeline;
}

// Generate embedding for a string of text
async function getEmbedding(text) {
    const extractor = await getEmbeddingPipeline();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}

// Compute dot product of two normalized vectors (Cosine Similarity)
function dotProduct(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        sum += a[i] * b[i];
    }
    return sum;
}

// API endpoint to archive turns
app.post('/api/memory/archive', async (req, res) => {
    try {
        const { sessionId, messages } = req.body;
        if (!sessionId || !messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Missing required parameters (sessionId, messages)' });
        }
        
        console.log(`[RAG DB] Archiving ${messages.length} messages for session ${sessionId}...`);
        
        // Group messages into user-assistant pairs
        const turnsToArchive = [];
        for (let i = 0; i < messages.length; i += 2) {
            const userMsg = messages[i];
            const assistantMsg = messages[i + 1];
            if (userMsg && assistantMsg) {
                const combinedText = `User: ${userMsg.content}\nAssistant: ${assistantMsg.content}`;
                turnsToArchive.push({
                    text: combinedText,
                    user: userMsg.content,
                    assistant: assistantMsg.content,
                    timestamp: Date.now()
                });
            } else if (userMsg) {
                turnsToArchive.push({
                    text: `User: ${userMsg.content}`,
                    user: userMsg.content,
                    assistant: '',
                    timestamp: Date.now()
                });
            }
        }
        
        const db = loadDB();
        if (!db[sessionId]) {
            db[sessionId] = [];
        }
        
        // Compute embeddings and add to database
        for (const turn of turnsToArchive) {
            console.log(`[RAG DB] Generating embedding for turn: "${turn.text.substring(0, 40)}..."`);
            const embedding = await getEmbedding(turn.text);
            db[sessionId].push({
                text: turn.text,
                user: turn.user,
                assistant: turn.assistant,
                timestamp: turn.timestamp,
                embedding
            });
        }
        
        saveDB(db);
        console.log(`[RAG DB] Archived ${turnsToArchive.length} turns for session ${sessionId}`);
        res.json({ success: true, count: turnsToArchive.length });
    } catch (error) {
        console.error('[RAG DB] Archive error:', error);
        res.status(500).json({ error: error.message });
    }
});

// API endpoint to search memories
app.post('/api/memory/search', async (req, res) => {
    try {
        const { sessionId, query, limit = 3 } = req.body;
        if (!sessionId || !query) {
            return res.status(400).json({ error: 'Missing required parameters (sessionId, query)' });
        }
        
        const db = loadDB();
        const sessionMemories = db[sessionId] || [];
        if (sessionMemories.length === 0) {
            return res.json({ matches: [] });
        }
        
        console.log(`[RAG DB] Searching memories in session ${sessionId} for query: "${query}"`);
        const queryEmbedding = await getEmbedding(query);
        
        // Calculate similarity for each memory
        const scoredMemories = sessionMemories.map(mem => {
            const similarity = dotProduct(queryEmbedding, mem.embedding);
            return {
                text: mem.text,
                user: mem.user,
                assistant: mem.assistant,
                timestamp: mem.timestamp,
                similarity
            };
        });
        
        // Sort by similarity descending
        scoredMemories.sort((a, b) => b.similarity - a.similarity);
        
        // Filter out results below threshold
        const threshold = 0.35;
        const matches = scoredMemories
            .filter(m => m.similarity >= threshold)
            .slice(0, limit);
            
        console.log(`[RAG DB] Found ${matches.length} matches above similarity threshold ${threshold}`);
        res.json({ matches });
    } catch (error) {
        console.error('[RAG DB] Search error:', error);
        res.status(500).json({ error: error.message });
    }
});

// API endpoint to retrieve all memory tags/summaries for a session (for memory list visualization)
app.post('/api/memory/list', (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ error: 'Missing required parameter: sessionId' });
        }
        
        const db = loadDB();
        const sessionMemories = db[sessionId] || [];
        
        // Return structured summaries of archived turns for UI display
        const list = sessionMemories.map(mem => ({
            text: mem.text,
            user: mem.user,
            assistant: mem.assistant,
            timestamp: mem.timestamp
        }));
        
        res.json({ memories: list });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API endpoint to clear database for a session
app.post('/api/memory/clear', (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ error: 'Missing required parameter: sessionId' });
        }
        
        const db = loadDB();
        if (db[sessionId]) {
            delete db[sessionId];
            saveDB(db);
            console.log(`[RAG DB] Cleared memories for session ${sessionId}`);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`  LLMAPIUI Express server running at:`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`==================================================\n`);
});
