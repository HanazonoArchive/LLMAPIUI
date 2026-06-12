// Deterministic Mathematical Memory Extraction Engine
import { log } from './logger.js';

// Colloquial English stop-words and conversational filler
const STOP_WORDS = new Set([
    'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 
    'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 
    'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 
    'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am', 'is', 'are', 
    'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does', 
    'did', 'doing', 'a', 'an', 'the', 'and', 'but', 'if', 'or', 'because', 'as', 'until', 
    'while', 'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 
    'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 
    'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 
    'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 
    'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 
    'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should', 'now',
    'yeah', 'yes', 'no', 'okay', 'ok', 'oh', 'hey', 'hi', 'like', 'well', 'really', 
    'mean', 'think', 'know', 'get', 'got', 'make', 'would', 'could', 'should', 'want', 
    'use', 'does', 'going', 'go', 'good', 'tell', 'say', 'said', 'one', 'two', 'think',
    'please', 'actually', 'right', 'something', 'everything', 'someone', 'anyone'
]);

/**
 * Tokenize a raw string by cleaning punctuation, lowercasing, spliting,
 * and filtering out stop words, numeric values, and short tokens.
 * @param {string} text 
 * @returns {string[]}
 */
export function tokenize(text) {
    if (!text || typeof text !== 'string') return [];
    
    // Clean punctuation (replace symbols with spaces, keep letters and digits)
    const cleanText = text.replace(/[^a-zA-Z0-9\s]/g, ' ');
    const rawTokens = cleanText.toLowerCase().split(/\s+/);
    
    return rawTokens.filter(token => {
        // Exclude tokens that are stop words, length <= 2, or numeric strings
        if (token.length <= 2) return false;
        if (STOP_WORDS.has(token)) return false;
        if (/^\d+$/.test(token)) return false;
        return true;
    });
}

/**
 * Perform a TF-IDF ranking on a collection of tokenized documents.
 * Document matches represent dialogue turns.
 * @param {string[][]} documents 
 * @param {number} maxTags 
 * @returns {string[]}
 */
export function calculateTFIDF(documents, maxTags = 6) {
    const N = documents.length;
    if (N === 0) return [];
    
    // Count Term Frequencies (TF) and Document Frequencies (DF)
    const termFrequencies = {};
    const documentFrequencies = {};
    const allUniqueTerms = new Set();
    
    documents.forEach(doc => {
        const uniqueInDoc = new Set(doc);
        uniqueInDoc.forEach(term => {
            documentFrequencies[term] = (documentFrequencies[term] || 0) + 1;
            allUniqueTerms.add(term);
        });
        
        doc.forEach(term => {
            termFrequencies[term] = (termFrequencies[term] || 0) + 1;
        });
    });
    
    // Calculate TF-IDF Score per unique term
    const scores = [];
    allUniqueTerms.forEach(term => {
        const tf = termFrequencies[term];
        const df = documentFrequencies[term];
        
        // IDF Formula: log(1 + N/DF) to keep it positive and scaled correctly
        const idf = Math.log(1 + (N / df));
        const score = tf * idf;
        
        scores.push({ term, score });
    });
    
    // Sort terms descending by TF-IDF score
    scores.sort((a, b) => b.score - a.score);
    
    log(`[Memory Engine] Evaluated ${allUniqueTerms.size} unique terms across ${N} turns.`, 'info');
    
    return scores.slice(0, maxTags).map(item => item.term);
}

/**
 * Extract semantic context keywords from a slice of historical turns.
 * @param {Array<{role: string, content: string}>} historyToArchive 
 * @param {number} maxTags 
 * @returns {string[]}
 */
export function archiveHistorySlice(historyToArchive, maxTags = 6) {
    if (!historyToArchive || historyToArchive.length === 0) return [];
    
    // Group adjacent User + Assistant messages into single "turn documents"
    const documents = [];
    let currentDoc = [];
    
    historyToArchive.forEach(msg => {
        if (msg.role === 'system') return;
        
        const tokens = tokenize(msg.content);
        currentDoc.push(...tokens);
        
        // Push turn when assistant completes its response
        if (msg.role === 'assistant') {
            if (currentDoc.length > 0) {
                documents.push(currentDoc);
                currentDoc = [];
            }
        }
    });
    
    // Catch trailing prompt if assistant turn is missing or incomplete
    if (currentDoc.length > 0) {
        documents.push(currentDoc);
    }
    
    return calculateTFIDF(documents, maxTags);
}
