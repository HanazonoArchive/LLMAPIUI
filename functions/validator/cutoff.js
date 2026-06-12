import { log } from '../logger.js';

export function isResponseCutOff(response) {
    if (!response || typeof response !== 'string') return false;
    
    const trimmed = response.trim();
    if (trimmed.length === 0) return true;
    
    const endsWithComplete = /[.!?)\]}'"]\s*$/.test(trimmed);
    
    const cutoffPatterns = [
        /\.\.\.$/m, /,\s*$/m, /and\s*$/mi, /or\s*$/mi, /the\s*$/mi,
        /a\s*$/mi, /an\s*$/mi, /to\s*$/mi, /of\s*$/mi, /in\s*$/mi,
        /for\s*$/mi, /with\s*$/mi, /that\s*$/mi, /this\s*$/mi,
        /from\s*$/mi, /by\s*$/mi, /at\s*$/mi, /:\s*$/m, /;\s*$/m,
        /-\s*$/m, /\[\s*$/m, /\(\s*$/m, /{\s*$/m
    ];
    
    if (!endsWithComplete && cutoffPatterns.some(pattern => pattern.test(trimmed))) {
        return true;
    }
    
    const lastChar = trimmed.charAt(trimmed.length - 1);
    if (/[a-zA-Z0-9]/.test(lastChar) && !endsWithComplete && trimmed.length > 100) {
        return true;
    }
    
    return false;
}

export function validateResponse(response) {
    if (!response || typeof response !== 'string') return null;
    
    const wordCount = response.split(/\s+/).length;
    
    if (wordCount > 30 && isResponseCutOff(response)) {
        log(`Response appears cut-off (ends mid-sentence)`, 'warning');
        const error = new Error("Response cut-off detected");
        error.isCutOff = true;
        error.partialResponse = response;
        throw error;
    }
    
    if (wordCount > 600) {
        log(`Response too long: ${wordCount} words (max 600)`, 'warning');
        return null;
    }
    
    const bannedPatterns = [
        /\bas an ai\b/i, /\bas a language model\b/i, /\bdisclaimer\b/i,
        /\bi don't have personal\b/i, /\bunable to\b/i
    ];
    
    for (const pattern of bannedPatterns) {
        if (pattern.test(response)) {
            log(`Response contains banned disclaimer`, 'warning');
            return null;
        }
    }
    
    return response;
}
