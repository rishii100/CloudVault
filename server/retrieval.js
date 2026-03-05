/**
 * Lightweight TF-IDF based retrieval engine.
 * Chunks reference documents and finds the most relevant passages for a given query.
 */

/**
 * Tokenize text into lowercase words
 */
function tokenize(text) {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
}

/**
 * Compute term frequency for a list of tokens
 */
function termFrequency(tokens) {
    const tf = {};
    for (const t of tokens) {
        tf[t] = (tf[t] || 0) + 1;
    }
    const len = tokens.length || 1;
    for (const t in tf) {
        tf[t] = tf[t] / len;
    }
    return tf;
}

/**
 * Compute IDF from a collection of documents (each is an array of tokens)
 */
function inverseDocumentFrequency(documents) {
    const N = documents.length;
    const idf = {};
    const allTerms = new Set();

    for (const doc of documents) {
        const uniqueTerms = new Set(doc);
        for (const t of uniqueTerms) {
            allTerms.add(t);
            idf[t] = (idf[t] || 0) + 1;
        }
    }

    for (const t of allTerms) {
        idf[t] = Math.log((N + 1) / (idf[t] + 1)) + 1; // smoothed IDF
    }

    return idf;
}

/**
 * Compute cosine similarity between two TF-IDF vectors
 */
function cosineSimilarity(vecA, vecB) {
    let dot = 0, magA = 0, magB = 0;
    const allKeys = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);

    for (const key of allKeys) {
        const a = vecA[key] || 0;
        const b = vecB[key] || 0;
        dot += a * b;
        magA += a * a;
        magB += b * b;
    }

    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Chunk a document into overlapping paragraphs
 */
function chunkDocument(text, chunkSize = 500, overlap = 100) {
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 20);

    // If paragraphs are small, use them directly
    if (paragraphs.every(p => p.length < chunkSize)) {
        return paragraphs.map(p => p.trim());
    }

    // Otherwise chunk by character count with overlap
    const chunks = [];
    let start = 0;
    while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        const chunk = text.slice(start, end).trim();
        if (chunk.length > 20) {
            chunks.push(chunk);
        }
        start += chunkSize - overlap;
    }

    return chunks;
}

/**
 * Build a retrieval index from reference documents
 * @param {Array<{id: number, filename: string, content: string}>} docs
 * @returns {Object} index object for querying
 */
function buildIndex(docs) {
    const chunks = [];

    for (const doc of docs) {
        const docChunks = chunkDocument(doc.content);
        for (const chunk of docChunks) {
            chunks.push({
                docId: doc.id,
                docName: doc.filename,
                text: chunk,
                tokens: tokenize(chunk),
            });
        }
    }

    const allTokenDocs = chunks.map(c => c.tokens);
    const idf = inverseDocumentFrequency(allTokenDocs);

    // Pre-compute TF-IDF vectors for each chunk
    const chunkVectors = chunks.map(c => {
        const tf = termFrequency(c.tokens);
        const tfidf = {};
        for (const t in tf) {
            tfidf[t] = tf[t] * (idf[t] || 0);
        }
        return tfidf;
    });

    return { chunks, idf, chunkVectors };
}

/**
 * Retrieve top-k relevant chunks for a query
 * @param {string} query
 * @param {Object} index - built from buildIndex
 * @param {number} topK
 * @returns {Array<{docName, text, score}>}
 */
function retrieve(query, index, topK = 3) {
    const queryTokens = tokenize(query);
    const queryTf = termFrequency(queryTokens);
    const queryVector = {};
    for (const t in queryTf) {
        queryVector[t] = queryTf[t] * (index.idf[t] || 0);
    }

    const scored = index.chunks.map((chunk, i) => ({
        docId: chunk.docId,
        docName: chunk.docName,
        text: chunk.text,
        score: cosineSimilarity(queryVector, index.chunkVectors[i]),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).filter(s => s.score > 0.01);
}

module.exports = { buildIndex, retrieve, tokenize };
