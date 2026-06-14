/**
 * Local MCP test server (SSE transport) for oneai backend MCP URL testing.
 *
 * Start:  npm run mcp:sse
 * URL:    http://127.0.0.1:8080/sse
 *
 * Configure in Settings → MCP Servers:
 *   Transport: SSE
 *   URL: http://127.0.0.1:8080/sse
 */

import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

const PORT = Number(process.env.MCP_SSE_PORT || 8080);
const HOST = process.env.MCP_SSE_HOST || "127.0.0.1";

/** @type {Map<string, SSEServerTransport>} */
const transports = new Map();

function createMcpServer() {
  const server = new McpServer({
    name: "oneai-web-test-mcp",
    version: "1.0.0",
  });

  server.tool(
    "echo",
    "Echo back the input text (useful for connectivity tests)",
    { text: z.string().describe("Text to echo back") },
    async ({ text }) => ({
      content: [{ type: "text", text: `Echo from oneai web MCP: ${text}` }],
    })
  );

  server.tool(
    "get_time",
    "Return the current server time in ISO format",
    {},
    async () => ({
      content: [{ type: "text", text: new Date().toISOString() }],
    })
  );

  server.tool(
    "project_info",
    "Return basic info about the oneai Local AI Hub project",
    {},
    async () => ({
      content: [
        {
          type: "text",
          text: [
            "Project: Local AI Hub (oneai)",
            "Stack: Next.js frontend + FastAPI backend + Ollama",
            "This is a test MCP SSE server in web/server/mcp-sse.js",
          ].join("\n"),
        },
      ],
    })
  );

  return server;
}

const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"] }));
app.use(express.json({ limit: "4mb" }));

app.get("/", (_req, res) => {
  res.type("text/plain").send(
    [
      "oneai MCP SSE test server",
      "",
      "MCP SSE endpoint: GET /sse",
      "Message endpoint:  POST /messages?sessionId=...",
      "",
      "Use in Settings → MCP Servers:",
      `  URL: http://${HOST}:${PORT}/sse`,
      "",
      "Tools: echo, get_time, project_info",
    ].join("\n")
  );
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, transport: "sse", sessions: transports.size });
});

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  transports.set(transport.sessionId, transport);

  res.on("close", () => {
    transports.delete(transport.sessionId);
    console.log(`[mcp-sse] client disconnected session=${transport.sessionId}`);
  });

  const server = createMcpServer();
  await server.connect(transport);
  console.log(`[mcp-sse] client connected session=${transport.sessionId}`);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId;
  if (!sessionId || typeof sessionId !== "string") {
    res.status(400).send("Missing sessionId query parameter");
    return;
  }

  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(404).send("Unknown session");
    return;
  }

  await transport.handlePostMessage(req, res, req.body);
});

app.listen(PORT, HOST, () => {
  console.log(`[mcp-sse] MCP SSE test server listening on http://${HOST}:${PORT}`);
  console.log(`[mcp-sse] Configure MCP URL: http://${HOST}:${PORT}/sse`);
  console.log("[mcp-sse] Tools: echo, get_time, project_info");
}).on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[mcp-sse] Port ${PORT} is already in use.`);
    console.error(`[mcp-sse] Another MCP SSE server may already be running — try:`);
    console.error(`[mcp-sse]   curl http://${HOST}:${PORT}/health`);
    console.error(`[mcp-sse] To restart, stop the existing process:`);
    console.error(`[mcp-sse]   lsof -i :${PORT} -sTCP:LISTEN`);
    console.error(`[mcp-sse]   kill <PID>`);
    console.error(`[mcp-sse] Or use a different port: MCP_SSE_PORT=8081 npm run mcp:sse`);
    process.exit(1);
  }
  throw err;
});
