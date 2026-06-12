import * as State from '../state.js';
import { log } from '../logger.js';
import { stripMarkdownForSpeech } from '../validator.js';

export async function forwardToTTS(textResponse) {
    if (!State.TTS_ENABLED) {
        return;
    }
    
    const ttsEndpoint = State.TTS_ENDPOINT || "http://127.0.0.1:8000/generate-speech";
    const cleanSpeechText = stripMarkdownForSpeech(textResponse);
    
    if (!cleanSpeechText) {
        log(`TTS skipped: Response text contains no speakable prose.`, 'warning');
        return;
    }

    log(`Forwarding cleaned prose to Kokoro-TTS pipeline...`, 'info');
    console.log(`[TTS Plaintext Target]: "${cleanSpeechText}"`);

    try {
        const response = await fetch(ttsEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: cleanSpeechText })
        });

        if (!response.ok) throw new Error(`TTS server responded with status: ${response.status}`);
        const data = await response.json();
        log(`TTS Audio Compiled: ${data.message || "Success"}`, 'success');

    } catch (error) {
        log(`TTS pipeline error: ${error.message}`, 'error');
        console.error("TTS Forwarding Failed:", error);
    }
}
