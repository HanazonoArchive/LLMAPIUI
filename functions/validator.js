import { log } from './logger.js';

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

export function stripMarkdownForSpeech(text) {
    if (!text) return "";
    let cleanText = text;
    cleanText = cleanText.replace(/```[\s\S]*?```/g, "");
    cleanText = cleanText.replace(/`([^`]+)`/g, "$1");
    cleanText = cleanText.replace(/\*\*\*([^*]+)\*\*\*/g, "$1");
    cleanText = cleanText.replace(/\*\*([^*]+)\*\*/g, "$1");
    cleanText = cleanText.replace(/\*([^*]+)\*/g, "$1");
    cleanText = cleanText.replace(/__([^_]+)__/g, "$1");
    cleanText = cleanText.replace(/_([^_]+)_/g, "$1");
    cleanText = cleanText.replace(/^#+\s+(.*)$/gm, "$1");
    cleanText = cleanText.replace(/^[\s]*[-*+>]\s+/gm, "");
    cleanText = cleanText.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    return cleanText.replace(/\s+/g, " ").trim();
}

const SUBSTITUTION_MAP = {
    'fuck': 'fudge',
    'fucking': 'freaking',
    'motherfucker': 'mean person',
    'shit': 'shoot',
    'bullshit': 'nonsense',
    'bitch': 'jerk',
    'bastard': 'rascal',
    'asshole': 'meanie',
    'dick': 'jerk',
    'pussy': 'coward',
    'slut': 'looser',
    'whore': 'person',
    'damn': 'darn',
    'crap': 'rubbish',
    'piss': 'vent',
    'cock': 'rooster',

    // insults
    'idiot': 'silly',
    'dumbass': 'goofball',
    'moron': 'goof',
    'stupid': 'unwise',
    'loser': 'underdog',
    'retard': 'slowpoke',

    // explicit
    'porn': 'media',
    'nude': 'bare',
    'naked': 'bare',
    'sex': 'intimacy',
    'boobs': 'chest',
    'penis': 'anatomy',
    'vagina': 'anatomy',

    // harmful phrases
    'kill yourself': 'calm down',
    'kys': 'take a break',
    'suicide': 'despair',

    // spam/scam
    'scam': 'trickery',
    'hack': 'exploit',
    'hacking': 'modifying'
};

function normalizeChar(char) {
    const c = char.toLowerCase();
    
    const replacements = {
        '@': 'a',
        '0': 'o',
        '1': 'i', '!': 'i',
        '3': 'e',
        '5': 's', '$': 's',
        '7': 't'
    };

    if (replacements[c]) return replacements[c];
    if (/[a-z0-9\s]/.test(c)) return c;
    return '';
}

export function redactContent(text, defaultPlaceholder = '[Cleaned]') {
    if (!text || typeof text !== 'string') return "";

    let resultText = text;
    let matchCount = 0;

    let normalizedStr = "";
    const originMap = [];

    for (let i = 0; i < text.length; i++) {
        const norm = normalizeChar(text[i]);
        if (norm !== '') {
            for (let j = 0; j < norm.length; j++) {
                originMap.push(i);
                normalizedStr += norm[j];
            }
        }
    }

    const sortedWords = Object.keys(SUBSTITUTION_MAP).sort((a, b) => b.length - a.length);

    const replacements = [];

    sortedWords.forEach(word => {
        const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?:^|\\b)${escapedWord}(?:\\b|$)`, 'gi');
        let match;

        while ((match = regex.exec(normalizedStr)) !== null) {
            const startNormIdx = match.index;
            const endNormIdx = startNormIdx + match[0].length - 1;

            const startOrigIdx = originMap[startNormIdx];
            const endOrigIdx = originMap[endNormIdx] + 1; 

            const replacementText = SUBSTITUTION_MAP[word] || defaultPlaceholder;

            replacements.push({ 
                start: startOrigIdx, 
                end: endOrigIdx, 
                word: replacementText 
            });
            matchCount++;

            if (match.index === regex.lastIndex) {
                regex.lastIndex++;
            }
        }
    });

    replacements.sort((a, b) => b.start - a.start);

    replacements.forEach(rep => {
        resultText = resultText.substring(0, rep.start) + rep.word + resultText.substring(rep.end);
    });

    if (matchCount > 0) {
        log(`Substitution Filter: Exchanged ${matchCount} inappropriate word(s) for polite alternatives.`, 'warning');
    }

    return resultText;
}