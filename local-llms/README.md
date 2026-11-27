# Local LLMs for Okaro / FitVerso

This folder collects free, open-weight models and runners that can run on a personal PC (consumer GPU or even CPU) for:

- Text generation
- Analysis
- Research assistance (RAG, summarization, literature review helpers)
- Integration with the rest of the Okaro monorepo (multi-agents, academic APIs, PaperOrchestra, etc.)

## Recommended free models that fit on a PC (late 2026)

| Hardware | Recommended models | Approx. size (Q4) | Notes |
|----------|--------------------|-------------------|-------|
| 8–16 GB RAM / laptop | Gemma 4 E4B / 12B, Qwen3.5-4B/9B, gpt-oss-20b | 3–14 GB | Fast enough for chat & summarization |
| 24 GB GPU (RTX 4090 etc.) | Qwen3.8-27B, Gemma 4 31B, Qwen3.6-35B-A3B | 16–23 GB | Best quality/speed balance |
| 32–64 GB unified / high-end | gpt-oss-120b (quantized), larger MoE | 60+ GB | Strong reasoning & research |
| Any | Phi-4, Devstral Small 2, various 7–14B | 4–15 GB | Coding, math, analysis |

All of the above are available via **Ollama** with a single command:

```bash
ollama run qwen3.8:27b
ollama run gemma4:12b
ollama run gpt-oss:20b
ollama run qwen3.6:35b
```

Or pull GGUF versions from Hugging Face (bartowski, unsloth, official) and run with llama.cpp.

## Included projects

| Folder | What it is | Why it's here |
|--------|------------|---------------|
| `ollama/` | Easiest way to run models locally | One-command install + model library |
| `llama.cpp/` | Core high-performance inference engine | Powers almost everything else; CPU + GPU |
| `LocalAI/` | Drop-in OpenAI-compatible API server | Text, vision, embeddings, speech |
| `jan/` | Desktop app for local chat | Nice GUI, offline |
| `unsloth/` | Fast fine-tuning & efficient inference | Train/adapt models on consumer hardware |
| `awesome-local-llms/` | Curated list of local LLM tools | Discovery |
| `LLMs-local/` | Another excellent curated list | More resources |

## Quick start

1. Install Ollama:  
   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ```
2. Run a model:  
   ```bash
   ollama run qwen3.8:27b
   ```
3. Use the OpenAI-compatible API at `http://localhost:11434` from the multi-agent frameworks already in Okaro.

For research workflows, combine these local models with the clients in `academic-apis/` (OpenAlex, PubMed, Crossref) and the multi-agent setups in `multi-agents/`.

## Notes

- Models themselves are **not** committed (too large). They are downloaded on demand.
- Prefer Apache 2.0 / MIT licensed models for commercial use (Qwen, Gemma 4, gpt-oss, many others).
- Quantization (Q4_K_M default in Ollama) is what makes high-parameter models fit on a PC.

Feel free to add more runners or model collections as needed.

## Official model series repos (cited)

These are the official code/model-card repositories for the high-parameter families recommended above. Weights are downloaded separately via Ollama or Hugging Face (not included here due to size).

| Folder | Model family | Official repo | Notes |
|--------|--------------|---------------|-------|
| `Qwen3/` | Qwen3 / Qwen3.8 series | https://github.com/QwenLM/Qwen3 | Best overall for local research & analysis |
| `gemma/` | Gemma 4 | https://github.com/google-deepmind/gemma | Strong open-weight alternative from Google |

Use with the runners already in this folder (ollama, llama.cpp, etc.).
