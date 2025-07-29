# Semantic Memory System

A powerful semantic memory system with vector-based search and recall capabilities, built with Mastra AI framework integration.

## 🧠 Features

- **Vector Embeddings**: Uses OpenAI's text-embedding-3-small for semantic similarity
- **Mastra Integration**: Built on Mastra's LibSQL vector database for performance  
- **Real-time Embedding**: Support for batch and individual text embedding
- **Semantic Search**: Search by meaning, not just keywords
- **Contextual Recall**: Get surrounding context for chat messages and conversations
- **MCP Integration**: Model Context Protocol server for Claude Code integration

## 📦 Packages

- `@semantic-memory/client` - Core client library for embedding and search operations
- `@semantic-memory/mcp-server` - MCP server for Claude Code integration

## 🚀 Quick Start

### Installation

```bash
pnpm install
pnpm run build
```

### Environment Setup

```bash
export OPENAI_API_KEY="your-openai-api-key"
export SEMANTIC_MEMORY_DB_PATH="/path/to/your/database"
```

### Usage

```typescript
import { SemanticMemoryClient } from '@semantic-memory/client';

const client = new SemanticMemoryClient({
  dbPath: './semantic_memory_db',
  openAIApiKey: process.env.OPENAI_API_KEY
});

await client.initialize();

// Embed content
await client.embed({
  type: 'chat',
  content: 'Hello, how are you?',
  metadata: {
    platform: 'discord',
    username: 'user123',
    timestamp: new Date().toISOString()
  }
});

// Search
const results = await client.search('greeting messages');
console.log(results);
```

## 🔧 MCP Server

The MCP server provides the following tools:

- `embed_text` - Embed single text content
- `embed_batch` - Embed multiple items efficiently  
- `semantic_search` - Search using natural language
- `recall` - Contextual recall from specific categories
- `get_stats` - Database statistics

### Running the MCP Server

```bash
cd packages/mcp-server
pnpm start
```

## 🛠️ Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Development mode
pnpm run dev
```

## 📊 Database

Uses LibSQL (embedded SQLite with vector support) for fast, local vector storage with semantic search capabilities.

## 🔐 Requirements

- Node.js >= 16.0.0
- OpenAI API key
- pnpm >= 8.0.0