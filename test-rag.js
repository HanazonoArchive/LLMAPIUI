import { pipeline } from '@xenova/transformers';

console.log('Loading pipeline for Xenova/all-MiniLM-L6-v2...');
const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
console.log('Pipeline loaded successfully.\n');

// Generate embeddings
async function getEmbedding(text) {
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}

// Compute dot product (since vectors are normalized, dot product = cosine similarity)
function dotProduct(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        sum += a[i] * b[i];
    }
    return sum;
}

const doc1 = "I love software engineering and writing JavaScript code.";
const doc2 = "Programming is an art form of logic and structure.";
const doc3 = "The green grass looks beautiful under the blue sky today.";

const query = "coding and computer science";

console.log('Generating embeddings...');
const emb1 = await getEmbedding(doc1);
const emb2 = await getEmbedding(doc2);
const emb3 = await getEmbedding(doc3);
const embQuery = await getEmbedding(query);

const sim1 = dotProduct(embQuery, emb1);
const sim2 = dotProduct(embQuery, emb2);
const sim3 = dotProduct(embQuery, emb3);

console.log('\n--- Cosine Similarity Results ---');
console.log(`Query: "${query}"\n`);
console.log(`Doc 1: "${doc1}"`);
console.log(`-> Similarity: ${sim1.toFixed(4)} (Expected: High)\n`);
console.log(`Doc 2: "${doc2}"`);
console.log(`-> Similarity: ${sim2.toFixed(4)} (Expected: High/Medium)\n`);
console.log(`Doc 3: "${doc3}"`);
console.log(`-> Similarity: ${sim3.toFixed(4)} (Expected: Very Low)\n`);

if (sim1 > sim3 && sim2 > sim3) {
    console.log('✅ TEST PASSED: Coding queries matched coding documents much better than weather documents!');
} else {
    console.log('❌ TEST FAILED: Embedding similarity math is incorrect.');
}
