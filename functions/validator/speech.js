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
