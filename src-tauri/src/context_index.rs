use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Deserialize)]
pub struct ContextChunkInput {
    pub chunk_id: String,
    pub text: String,
    pub source_type: String,
    pub source_id: String,
    pub timestamp: u64,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ContextIndexSyncStats {
    pub total_chunks: usize,
    pub embedded_new_or_changed: usize,
    pub removed: usize,
    pub embedding_dim: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RetrievedChunk {
    pub chunk_id: String,
    pub source_type: String,
    pub source_id: String,
    pub timestamp: u64,
    pub path: Option<String>,
    pub score: f32,
    pub text: String,
}

#[derive(Debug, Clone)]
struct ChunkEntry {
    source_type: String,
    source_id: String,
    timestamp: u64,
    path: Option<String>,
    text: String,
    embedding: Vec<f32>,
    norm: f32,
}

#[derive(Default)]
pub struct ContextIndex {
    chunks: HashMap<String, ChunkEntry>,
    embedding_dim: Option<usize>,
}

impl ContextIndex {
    pub fn clear(&mut self) {
        self.chunks.clear();
        self.embedding_dim = None;
    }

    pub fn stats(&self) -> ContextIndexSyncStats {
        ContextIndexSyncStats {
            total_chunks: self.chunks.len(),
            embedded_new_or_changed: 0,
            removed: 0,
            embedding_dim: self.embedding_dim,
        }
    }
}

fn cosine_similarity(a: &[f32], a_norm: f32, b: &[f32], b_norm: f32) -> f32 {
    if a.is_empty() || b.is_empty() || a.len() != b.len() {
        return 0.0;
    }
    let denom = a_norm * b_norm;
    if denom <= 0.0 {
        return 0.0;
    }
    let mut dot = 0.0f32;
    for (x, y) in a.iter().zip(b.iter()) {
        dot += x * y;
    }
    dot / denom
}

fn l2_norm(v: &[f32]) -> f32 {
    let mut sum = 0.0f32;
    for x in v {
        sum += x * x;
    }
    sum.sqrt()
}

pub fn plan_sync(
    index: &ContextIndex,
    chunks: &[ContextChunkInput],
) -> (HashSet<String>, Vec<ContextChunkInput>) {
    let mut present: HashSet<String> = HashSet::with_capacity(chunks.len());
    let mut to_embed: Vec<ContextChunkInput> = Vec::new();

    for c in chunks {
        present.insert(c.chunk_id.clone());

        let needs_embed = match index.chunks.get(&c.chunk_id) {
            None => true,
            Some(existing) => existing.text != c.text,
        };

        if needs_embed {
            to_embed.push(c.clone());
        }
    }

    (present, to_embed)
}

pub fn apply_sync(
    index: &mut ContextIndex,
    present: HashSet<String>,
    embedded: Vec<(ContextChunkInput, Vec<f32>)>,
) -> Result<ContextIndexSyncStats, String> {
    // Remove chunks not present anymore.
    let before = index.chunks.len();
    index
        .chunks
        .retain(|chunk_id, _| present.contains(chunk_id));
    let removed = before.saturating_sub(index.chunks.len());

    let mut embedded_new_or_changed = 0usize;

    for (meta, embedding) in embedded {
        let norm = l2_norm(&embedding);

        // Set embedding dimension on first insert.
        if index.embedding_dim.is_none() {
            index.embedding_dim = Some(embedding.len());
        }

        // If dimension changes, reset index to avoid invalid similarity.
        if let Some(dim) = index.embedding_dim {
            if dim != embedding.len() {
                index.clear();
                return Err("Embedding dimension changed; index cleared".to_string());
            }
        }

        index.chunks.insert(
            meta.chunk_id.clone(),
            ChunkEntry {
                source_type: meta.source_type.clone(),
                source_id: meta.source_id.clone(),
                timestamp: meta.timestamp,
                path: meta.path.clone(),
                text: meta.text.clone(),
                embedding,
                norm,
            },
        );

        embedded_new_or_changed += 1;
    }

    Ok(ContextIndexSyncStats {
        total_chunks: index.chunks.len(),
        embedded_new_or_changed,
        removed,
        embedding_dim: index.embedding_dim,
    })
}

fn normalize_base_url(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/');
    trimmed.to_string()
}

async fn embed_openai_compatible(
    client: &Client,
    api_key: &str,
    base_url: &str,
    model: &str,
    inputs: &[String],
) -> Result<Vec<Vec<f32>>, String> {
    if model.trim().is_empty() {
        return Err("Embedding model is required".to_string());
    }

    let base = normalize_base_url(base_url);
    let endpoint = format!("{}/embeddings", base);

    let body = serde_json::json!({
        "model": model,
        "input": inputs,
    });

    let mut req = client.post(endpoint).json(&body);
    if !api_key.trim().is_empty() {
        req = req.bearer_auth(api_key);
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(crate::chat::helpers::sanitize_api_error("Embeddings", status.as_u16(), &text));
    }

    let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let data = json
        .get("data")
        .and_then(|d| d.as_array())
        .ok_or_else(|| "Invalid embeddings response: missing data".to_string())?;

    // OpenAI returns an array of objects with embedding arrays.
    // Some providers may not preserve input ordering strictly; we assume it does.
    let mut out: Vec<Vec<f32>> = Vec::with_capacity(data.len());
    for item in data {
        let emb = item
            .get("embedding")
            .and_then(|e| e.as_array())
            .ok_or_else(|| "Invalid embeddings response: missing embedding".to_string())?;

        let mut vec = Vec::with_capacity(emb.len());
        for v in emb {
            let f = v
                .as_f64()
                .ok_or_else(|| "Invalid embeddings response: non-float".to_string())?;
            vec.push(f as f32);
        }
        out.push(vec);
    }

    Ok(out)
}

async fn embed_gemini(
    client: &Client,
    api_key: &str,
    base_url: &str,
    model: &str,
    inputs: &[String],
) -> Result<Vec<Vec<f32>>, String> {
    if api_key.trim().is_empty() {
        return Err("Gemini API key is required for embeddings".to_string());
    }
    if model.trim().is_empty() {
        return Err("Gemini embedding model is required".to_string());
    }

    // Gemini uses v1beta and has batch endpoint.
    let base = normalize_base_url(base_url);
    let endpoint = format!(
        "{}/models/{}:batchEmbedContents",
        base, model
    );

    let requests: Vec<serde_json::Value> = inputs
        .iter()
        .map(|text| {
            serde_json::json!({
                "model": format!("models/{}", model),
                "content": {
                    "parts": [{ "text": text }]
                }
            })
        })
        .collect();

    let body = serde_json::json!({
        "requests": requests
    });

    let resp = client
        .post(endpoint)
        .query(&[("key", api_key)])
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(crate::chat::helpers::sanitize_api_error("Gemini embeddings", status.as_u16(), &text));
    }

    let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let embeddings = json
        .get("embeddings")
        .and_then(|e| e.as_array())
        .ok_or_else(|| "Invalid Gemini embeddings response: missing embeddings".to_string())?;

    let mut out: Vec<Vec<f32>> = Vec::with_capacity(embeddings.len());
    for item in embeddings {
        let values = item
            .get("values")
            .and_then(|v| v.as_array())
            .ok_or_else(|| "Invalid Gemini embeddings response: missing values".to_string())?;

        let mut vec = Vec::with_capacity(values.len());
        for v in values {
            let f = v
                .as_f64()
                .ok_or_else(|| "Invalid Gemini embeddings response: non-float".to_string())?;
            vec.push(f as f32);
        }
        out.push(vec);
    }

    Ok(out)
}

async fn embed_texts(
    client: &Client,
    provider: &str,
    api_key: &str,
    url: Option<&str>,
    model: &str,
    inputs: &[String],
) -> Result<Vec<Vec<f32>>, String> {
    let provider = provider.to_lowercase();

    match provider.as_str() {
        "gemini" => {
            let base = url.unwrap_or("https://generativelanguage.googleapis.com/v1beta");
            embed_gemini(client, api_key, base, model, inputs).await
        }
        // Default to OpenAI-compatible embeddings endpoint.
        // Works for OpenAI and many local servers (ollama / llama.cpp server) when configured.
        _ => {
            let base = url.unwrap_or("https://api.openai.com/v1");
            embed_openai_compatible(client, api_key, base, model, inputs).await
        }
    }
}

pub async fn embed_texts_for_provider(
    client: &Client,
    provider: &str,
    api_key: &str,
    url: Option<&str>,
    model: &str,
    inputs: &[String],
) -> Result<Vec<Vec<f32>>, String> {
    embed_texts(client, provider, api_key, url, model, inputs).await
}

pub fn query_with_embedding(
    index: &ContextIndex,
    query_vec: Vec<f32>,
    top_k: usize,
) -> Vec<RetrievedChunk> {
    if index.chunks.is_empty() {
        return vec![];
    }

    let query_norm = l2_norm(&query_vec);

    let mut scored: Vec<RetrievedChunk> = Vec::with_capacity(index.chunks.len());
    for (chunk_id, entry) in &index.chunks {
        let score = cosine_similarity(&query_vec, query_norm, &entry.embedding, entry.norm);
        scored.push(RetrievedChunk {
            chunk_id: chunk_id.clone(),
            source_type: entry.source_type.clone(),
            source_id: entry.source_id.clone(),
            timestamp: entry.timestamp,
            path: entry.path.clone(),
            score,
            text: entry.text.clone(),
        });
    }

    scored.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let k = std::cmp::max(1, top_k);
    scored.truncate(std::cmp::min(k, scored.len()));
    scored
}

pub async fn context_index_sync(
    index: &mut ContextIndex,
    provider: &str,
    api_key: &str,
    url: Option<&str>,
    embedding_model: &str,
    chunks: Vec<ContextChunkInput>,
) -> Result<ContextIndexSyncStats, String> {
    if embedding_model.trim().is_empty() {
        return Err("Embedding model is not configured".to_string());
    }

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let mut present: HashSet<String> = HashSet::with_capacity(chunks.len());
    for c in &chunks {
        present.insert(c.chunk_id.clone());
    }

    // Remove chunks not present anymore.
    let before = index.chunks.len();
    index
        .chunks
        .retain(|chunk_id, _| present.contains(chunk_id));
    let removed = before.saturating_sub(index.chunks.len());

    // Determine which chunks need (re)embedding.
    let mut to_embed_ids: Vec<String> = Vec::new();
    let mut to_embed_texts: Vec<String> = Vec::new();
    let mut to_embed_meta: Vec<ContextChunkInput> = Vec::new();

    for c in chunks {
        let needs_embed = match index.chunks.get(&c.chunk_id) {
            None => true,
            Some(existing) => existing.text != c.text,
        };

        if needs_embed {
            to_embed_ids.push(c.chunk_id.clone());
            to_embed_texts.push(c.text.clone());
            to_embed_meta.push(c);
        }
    }

    let mut embedded_new_or_changed = 0usize;

    if !to_embed_texts.is_empty() {
        // Batch embeddings to keep requests reasonable.
        let batch_size = 32usize;
        let mut offset = 0usize;
        while offset < to_embed_texts.len() {
            let end = std::cmp::min(offset + batch_size, to_embed_texts.len());
            let batch_texts: Vec<String> = to_embed_texts[offset..end].to_vec();

            let vectors = embed_texts(
                &client,
                provider,
                api_key,
                url,
                embedding_model,
                &batch_texts,
            )
            .await?;

            if vectors.len() != batch_texts.len() {
                return Err("Embeddings response size mismatch".to_string());
            }

            for i in 0..vectors.len() {
                let global_i = offset + i;
                let chunk_id = &to_embed_ids[global_i];
                let meta = &to_embed_meta[global_i];
                let embedding = vectors[i].clone();
                let norm = l2_norm(&embedding);

                // Set embedding dimension on first insert.
                if index.embedding_dim.is_none() {
                    index.embedding_dim = Some(embedding.len());
                }

                // If dimension changes, reset index to avoid invalid similarity.
                if let Some(dim) = index.embedding_dim {
                    if dim != embedding.len() {
                        index.clear();
                        return Err("Embedding dimension changed; index cleared".to_string());
                    }
                }

                index.chunks.insert(
                    chunk_id.clone(),
                    ChunkEntry {
                        source_type: meta.source_type.clone(),
                        source_id: meta.source_id.clone(),
                        timestamp: meta.timestamp,
                        path: meta.path.clone(),
                        text: meta.text.clone(),
                        embedding,
                        norm,
                    },
                );

                embedded_new_or_changed += 1;
            }

            offset = end;
        }
    }

    Ok(ContextIndexSyncStats {
        total_chunks: index.chunks.len(),
        embedded_new_or_changed,
        removed,
        embedding_dim: index.embedding_dim,
    })
}

pub async fn context_index_query(
    index: &ContextIndex,
    provider: &str,
    api_key: &str,
    url: Option<&str>,
    embedding_model: &str,
    query: &str,
    top_k: usize,
) -> Result<Vec<RetrievedChunk>, String> {
    if embedding_model.trim().is_empty() {
        return Err("Embedding model is not configured".to_string());
    }

    if index.chunks.is_empty() {
        return Ok(vec![]);
    }

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let inputs = vec![query.trim().to_string()];
    let mut vectors =
        embed_texts(&client, provider, api_key, url, embedding_model, &inputs).await?;

    let query_vec = vectors
        .pop()
        .ok_or_else(|| "Failed to compute query embedding".to_string())?;

    let query_norm = l2_norm(&query_vec);

    let mut scored: Vec<RetrievedChunk> = Vec::with_capacity(index.chunks.len());
    for (chunk_id, entry) in &index.chunks {
        let score = cosine_similarity(&query_vec, query_norm, &entry.embedding, entry.norm);
        scored.push(RetrievedChunk {
            chunk_id: chunk_id.clone(),
            source_type: entry.source_type.clone(),
            source_id: entry.source_id.clone(),
            timestamp: entry.timestamp,
            path: entry.path.clone(),
            score,
            text: entry.text.clone(),
        });
    }

    scored.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let k = std::cmp::max(1, top_k);
    scored.truncate(std::cmp::min(k, scored.len()));
    Ok(scored)
}
