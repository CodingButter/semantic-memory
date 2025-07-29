import { embed, embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';
import { LibSQLVector } from '@mastra/libsql';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface SemanticMemoryConfig {
  dbPath: string;
  openAIApiKey?: string;
  embeddingModel?: string;
  embeddingDimensions?: number;
}

export interface EmbedItem {
  type: 'chat' | 'code' | 'conversation' | 'document';
  content: string;
  metadata: Record<string, any>;
}

export interface SearchResult {
  content: string;
  metadata: Record<string, any>;
  similarity: number;
}

export interface RecallOptions {
  query: string;
  limit?: number;
  threshold?: number;
  contextWindow?: number;
}

export class SemanticMemoryClient {
  private vectorStore: LibSQLVector;
  private config: Required<SemanticMemoryConfig>;
  private initialized = false;

  constructor(config: SemanticMemoryConfig) {
    this.config = {
      dbPath: config.dbPath,
      openAIApiKey: config.openAIApiKey || process.env.OPENAI_API_KEY || '',
      embeddingModel: config.embeddingModel || 'text-embedding-3-small',
      embeddingDimensions: config.embeddingDimensions || 1536
    };

    if (!this.config.openAIApiKey) {
      throw new Error('OpenAI API key is required for semantic memory');
    }

    // Initialize LibSQL vector store
    this.vectorStore = new LibSQLVector({
      connectionUrl: `file:${path.join(this.config.dbPath, 'vectors.db')}`
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure database directory exists
    await fs.mkdir(this.config.dbPath, { recursive: true });
    
    // Initialize vector store
    await this.vectorStore.initialize();
    
    this.initialized = true;
    console.log(`[SemanticMemory] Initialized with database at: ${this.config.dbPath}`);
  }

  async embed(item: EmbedItem): Promise<void> {
    await this.initialize();

    // Generate embedding
    const { embedding } = await embed({
      model: openai.embedding(this.config.embeddingModel),
      value: item.content
    });

    // Store in vector database
    await this.vectorStore.insert({
      id: `${item.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      values: embedding,
      metadata: {
        type: item.type,
        content: item.content,
        ...item.metadata,
        embedded_at: new Date().toISOString()
      }
    });
  }

  async embedBatch(items: EmbedItem[]): Promise<void> {
    await this.initialize();

    if (items.length === 0) return;

    // Generate embeddings for all items
    const { embeddings } = await embedMany({
      model: openai.embedding(this.config.embeddingModel),
      values: items.map(item => item.content)
    });

    // Insert all embeddings
    const insertPromises = items.map(async (item, index) => {
      await this.vectorStore.insert({
        id: `${item.type}_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
        values: embeddings[index],
        metadata: {
          type: item.type,
          content: item.content,
          ...item.metadata,
          embedded_at: new Date().toISOString()
        }
      });
    });

    await Promise.all(insertPromises);
  }

  async search(query: string, options: { limit?: number; threshold?: number } = {}): Promise<SearchResult[]> {
    await this.initialize();

    const { limit = 10, threshold = 0.7 } = options;

    // Generate query embedding
    const { embedding } = await embed({
      model: openai.embedding(this.config.embeddingModel),
      value: query
    });

    // Search vector database
    const results = await this.vectorStore.query({
      vector: embedding,
      topK: limit
    });

    // Filter by threshold and format results
    return results
      .filter(result => result.score >= threshold)
      .map(result => ({
        content: result.metadata.content,
        metadata: result.metadata,
        similarity: result.score
      }));
  }

  async recall(category: string, query: string, options: RecallOptions = {}): Promise<SearchResult[]> {
    await this.initialize();

    const { limit = 10, threshold = 0.7, contextWindow = 3 } = options;

    // First, do a semantic search
    const results = await this.search(query, { limit: limit * 2, threshold });

    // Filter by category if specified
    const categoryResults = category === 'all' 
      ? results 
      : results.filter(r => r.metadata.type === category || r.metadata.platform === category);

    // If context window is requested, try to get surrounding context
    if (contextWindow > 0) {
      // For chat messages, try to get surrounding messages by timestamp
      const enhancedResults = await Promise.all(
        categoryResults.slice(0, limit).map(async (result) => {
          if (result.metadata.type === 'chat' && result.metadata.timestamp) {
            const contextResults = await this.getContextualMessages(
              result.metadata.timestamp,
              result.metadata.platform,
              contextWindow
            );
            return {
              ...result,
              context: contextResults
            };
          }
          return result;
        })
      );
      return enhancedResults;
    }

    return categoryResults.slice(0, limit);
  }

  private async getContextualMessages(timestamp: string, platform: string, windowSize: number): Promise<SearchResult[]> {
    const targetTime = new Date(timestamp);
    const beforeTime = new Date(targetTime.getTime() - (windowSize * 60 * 1000)); // windowSize minutes before
    const afterTime = new Date(targetTime.getTime() + (windowSize * 60 * 1000));  // windowSize minutes after

    // This is a simplified context search - in a real implementation,
    // you might want to add more sophisticated temporal queries
    const contextQuery = `messages from ${platform} around ${timestamp}`;
    const contextResults = await this.search(contextQuery, { limit: 20, threshold: 0.5 });

    return contextResults.filter(r => {
      if (!r.metadata.timestamp) return false;
      const msgTime = new Date(r.metadata.timestamp);
      return msgTime >= beforeTime && msgTime <= afterTime && r.metadata.platform === platform;
    });
  }

  async getStats(): Promise<{ totalEmbeddings: number; categories: Record<string, number> }> {
    await this.initialize();

    // Note: LibSQL doesn't have built-in count functions, so this is a simplified version
    // In a real implementation, you might need a more sophisticated stats query
    const allResults = await this.search('', { limit: 10000, threshold: 0 });
    
    const categories: Record<string, number> = {};
    allResults.forEach(result => {
      const category = result.metadata.type || 'unknown';
      categories[category] = (categories[category] || 0) + 1;
    });

    return {
      totalEmbeddings: allResults.length,
      categories
    };
  }
}