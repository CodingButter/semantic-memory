#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { SemanticMemoryClient, EmbedItem } from '@semantic-memory/client';
import * as path from 'path';

const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
const SEMANTIC_MEMORY_DB_PATH = process.env.SEMANTIC_MEMORY_DB_PATH || path.join(PROJECT_ROOT, 'semantic_memory_db');

class SemanticMemoryServer {
  private server: Server;
  private semanticMemory: SemanticMemoryClient;

  constructor() {
    this.server = new Server(
      {
        name: 'semantic-memory',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.semanticMemory = new SemanticMemoryClient({
      dbPath: SEMANTIC_MEMORY_DB_PATH,
      openAIApiKey: process.env.OPENAI_API_KEY
    });

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'embed_text',
            description: 'Embed text content into semantic memory for later retrieval',
            inputSchema: {
              type: 'object',
              properties: {
                content: {
                  type: 'string',
                  description: 'The text content to embed'
                },
                type: {
                  type: 'string',
                  enum: ['chat', 'code', 'conversation', 'document'],
                  description: 'The type of content being embedded'
                },
                metadata: {
                  type: 'object',
                  description: 'Additional metadata to store with the embedding',
                  additionalProperties: true
                }
              },
              required: ['content', 'type']
            }
          },
          {
            name: 'embed_batch',
            description: 'Embed multiple text items into semantic memory efficiently',
            inputSchema: {
              type: 'object',
              properties: {
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      content: { type: 'string' },
                      type: { 
                        type: 'string',
                        enum: ['chat', 'code', 'conversation', 'document']
                      },
                      metadata: { 
                        type: 'object',
                        additionalProperties: true
                      }
                    },
                    required: ['content', 'type']
                  },
                  description: 'Array of items to embed'
                }
              },
              required: ['items']
            }
          },
          {
            name: 'semantic_search',
            description: 'Search semantic memory using natural language queries',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'The search query'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return',
                  default: 10
                },
                threshold: {
                  type: 'number',
                  description: 'Minimum similarity threshold (0-1)',
                  default: 0.7
                }
              },
              required: ['query']
            }
          },
          {
            name: 'recall',
            description: 'Recall memories from a specific category with contextual information',
            inputSchema: {
              type: 'object',
              properties: {
                category: {
                  type: 'string',
                  description: 'Category to search in (chat-history, conversations, code, documents, or all)'
                },
                query: {
                  type: 'string',
                  description: 'What to recall'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results',
                  default: 10
                },
                threshold: {
                  type: 'number',
                  description: 'Minimum similarity threshold',
                  default: 0.7
                },
                contextWindow: {
                  type: 'number',
                  description: 'Minutes of context to include around results',
                  default: 3
                }
              },
              required: ['category', 'query']
            }
          },
          {
            name: 'get_stats',
            description: 'Get statistics about the semantic memory database',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'embed_text': {
          const { content, type, metadata = {} } = args as {
            content: string;
            type: 'chat' | 'code' | 'conversation' | 'document';
            metadata?: Record<string, any>;
          };

          const item: EmbedItem = { content, type, metadata };
          await this.semanticMemory.embed(item);

          return {
            content: [
              {
                type: 'text',
                text: `Successfully embedded ${type} content: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`
              }
            ]
          };
        }

        case 'embed_batch': {
          const { items } = args as { items: EmbedItem[] };
          await this.semanticMemory.embedBatch(items);

          return {
            content: [
              {
                type: 'text',
                text: `Successfully embedded ${items.length} items into semantic memory`
              }
            ]
          };
        }

        case 'semantic_search': {
          const { query, limit = 10, threshold = 0.7 } = args as {
            query: string;
            limit?: number;
            threshold?: number;
          };

          const results = await this.semanticMemory.search(query, { limit, threshold });

          return {
            content: [
              {
                type: 'text',
                text: `Found ${results.length} results for "${query}":\n\n` +
                      results.map((result, i) => 
                        `${i + 1}. [${(result.similarity * 100).toFixed(1)}%] ${result.content.substring(0, 200)}${result.content.length > 200 ? '...' : ''}\n` +
                        `   Metadata: ${JSON.stringify(result.metadata, null, 2)}`
                      ).join('\n\n')
              }
            ]
          };
        }

        case 'recall': {
          const { category, query, limit = 10, threshold = 0.7, contextWindow = 3 } = args as {
            category: string;
            query: string;
            limit?: number;
            threshold?: number;
            contextWindow?: number;
          };

          const results = await this.semanticMemory.recall(category, query, {
            limit,
            threshold,
            contextWindow
          });

          return {
            content: [
              {
                type: 'text',
                text: `Recalled ${results.length} memories from ${category} for "${query}":\n\n` +
                      results.map((result, i) => {
                        let text = `${i + 1}. [${(result.similarity * 100).toFixed(1)}%] ${result.content}\n`;
                        text += `   Type: ${result.metadata.type}, Platform: ${result.metadata.platform || 'unknown'}\n`;
                        text += `   Timestamp: ${result.metadata.timestamp || 'unknown'}\n`;
                        if (result.metadata.username) {
                          text += `   User: ${result.metadata.username}\n`;
                        }
                        if ((result as any).context?.length > 0) {
                          text += `   Context: ${(result as any).context.length} surrounding messages\n`;
                        }
                        return text;
                      }).join('\n')
              }
            ]
          };
        }

        case 'get_stats': {
          const stats = await this.semanticMemory.getStats();

          return {
            content: [
              {
                type: 'text',
                text: `Semantic Memory Statistics:\n\n` +
                      `Total Embeddings: ${stats.totalEmbeddings}\n\n` +
                      `Categories:\n` +
                      Object.entries(stats.categories)
                        .map(([category, count]) => `  ${category}: ${count}`)
                        .join('\n')
              }
            ]
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  async run() {
    await this.semanticMemory.initialize();
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error('Semantic Memory MCP server running on stdio');
  }
}

const server = new SemanticMemoryServer();
server.run().catch(console.error);