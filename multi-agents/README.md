# Multi-Agent Frameworks (Fast & Accessible)

Selected open-source multi-agent / multi-bot frameworks from GitHub. 
Prioritized for speed of setup, accessibility (MIT/Apache licenses, good docs, active maintenance), and practical use.

Copies are shallow clones with `.git` removed. Original licenses apply.

## Included

| Project | Source | Why selected | Approx. size |
|---------|--------|--------------|--------------|
| **crewAI** | crewAIInc/crewAI | Fastest for role-based multi-agent crews. Easy Python API. | ~60MB (docs trimmed) |
| **langgraph** | langchain-ai/langgraph | Best for stateful, controllable multi-agent graphs. Production-ready. | 17MB |
| **openai-agents-python** | openai/openai-agents-python | Lightweight official OpenAI multi-agent SDK with handoffs. | 32MB |
| **smolagents** | huggingface/smolagents | Minimal code-first agents. Very lightweight. | 2.6MB |
| **MetaGPT** | FoundationAgents/MetaGPT | Multi-agent software company simulation (SOP-based). | 43MB |
| **agno** | agno-agi/agno | Lightweight agents with built-in memory and tools. | 86MB |
| **camel** | camel-ai/camel | Research-oriented multi-agent society / role-playing. | 151MB |

## Quick start tips

- Most are pure Python: `pip install` the package or run from source.
- Prefer `openai-agents-python` or `smolagents` for the lightest start.
- Use `crewAI` for quick role-based teams.
- Use `langgraph` when you need explicit control flow and checkpoints.

These are reference copies inside Okaro for local study and integration with research/paper tools in `ai-research-repos/`.
