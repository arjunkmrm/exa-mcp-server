#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createStatelessServer } from "@smithery/sdk/server/stateless.js";
import dotenv from "dotenv";
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// Import the tool registry system
import { toolRegistry } from "./tools/index.js";
import { log } from "./utils/logger.js";

dotenv.config();

// Parse command line arguments to determine which tools to enable
const argv = yargs(hideBin(process.argv))
  .option('tools', {
    type: 'string',
    description: 'Comma-separated list of tools to enable (if not specified, all enabled-by-default tools are used)',
    default: ''
  })
  .option('list-tools', {
    type: 'boolean',
    description: 'List all available tools and exit',
    default: false
  })
  .option('transport', {
    type: 'string',
    description: 'Transport type: stdio (default) or http',
    default: 'stdio',
    choices: ['stdio', 'http']
  })
  .option('port', {
    type: 'number',
    description: 'Port to run the HTTP server on (only used with http transport)',
    default: 8081
  })
  .help()
  .argv;

// Convert comma-separated string to Set for easier lookups
const argvObj = argv as any;
const toolsString = argvObj['tools'] || '';
const specifiedTools = new Set<string>(
  toolsString ? toolsString.split(',').map((tool: string) => tool.trim()) : []
);

// List all available tools if requested
if (argvObj['list-tools']) {
  console.log("Available tools:");
  
  Object.entries(toolRegistry).forEach(([id, tool]) => {
    console.log(`- ${id}: ${tool.name}`);
    console.log(`  Description: ${tool.description}`);
    console.log(`  Enabled by default: ${tool.enabled ? 'Yes' : 'No'}`);
    console.log();
  });
  
  process.exit(0);
}

// Check for API key after handling list-tools to allow listing without a key
const API_KEY = process.env.EXA_API_KEY;
if (!API_KEY) {
  throw new Error("EXA_API_KEY environment variable is required");
}

/**
 * Exa AI Web Search MCP Server
 * 
 * This MCP server integrates Exa AI's search capabilities with Claude and other MCP-compatible clients.
 * Exa is a search engine and API specifically designed for up-to-date web searching and retrieval,
 * offering more recent and comprehensive results than what might be available in an LLM's training data.
 * 
 * The server provides tools that enable:
 * - Real-time web searching with configurable parameters
 * - Research paper searches
 * - And more to come!
 */

function setupTools(server: McpServer): string[] {
  // Register tools based on specifications
  const registeredTools: string[] = [];
  
  Object.entries(toolRegistry).forEach(([toolId, tool]) => {
    // If specific tools were provided via CLI, only enable those
    // Otherwise, for HTTP transport, enable ALL tools
    // For stdio transport, use the default enabled status
    const shouldRegister = specifiedTools.size > 0 
      ? specifiedTools.has(toolId) 
      : (argvObj.transport === 'http' ? true : tool.enabled);
    
    if (shouldRegister) {
      server.tool(
        tool.name,
        tool.description,
        tool.schema,
        tool.handler
      );
      registeredTools.push(toolId);
    }
  });
  
  return registeredTools;
}

// For HTTP transport using Smithery SDK
if (argvObj.transport === 'http') {
  const { app } = createStatelessServer<{
    exaApiKey: string
  }>(({ config }: { config: { exaApiKey: string } }) => {
    try {
      log("Starting Exa MCP Server in HTTP mode...");
      
      // Create a new MCP server
      const server = new McpServer({
        name: "exa-search-server",
        version: "0.3.10"
      });
      
      // Set up tools
      const registeredTools = setupTools(server);
      log(`Registered ${registeredTools.length} tools: ${registeredTools.join(', ')}`);
      
      return server.server;
    } catch (e) {
      log(`Server initialization error: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
  });
  
  // Start the HTTP server
  const PORT = argvObj.port || process.env.PORT || 8081;
  app.listen(PORT, () => {
    log(`Exa MCP server running on http://localhost:${PORT}`);
  });
  
} else {
  // Original stdio transport
  class ExaServer {
    private server: McpServer;

    constructor() {
      this.server = new McpServer({
        name: "exa-search-server",
        version: "0.3.10"
      });
      
      log("Server initialized");
    }

    private setupTools(): string[] {
      return setupTools(this.server);
    }

    async run(): Promise<void> {
      try {
        // Set up tools before connecting
        const registeredTools = this.setupTools();
        
        log(`Starting Exa MCP server with ${registeredTools.length} tools: ${registeredTools.join(', ')}`);
        
        const transport = new StdioServerTransport();
        
        // Handle connection errors
        transport.onerror = (error) => {
          log(`Transport error: ${error.message}`);
        };
        
        await this.server.connect(transport);
        log("Exa Search MCP server running on stdio");
      } catch (error) {
        log(`Server initialization error: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }
  }

  // Create and run the server with proper error handling
  (async () => {
    try {
      const server = new ExaServer();
      await server.run();
    } catch (error) {
      log(`Fatal server error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  })();
}