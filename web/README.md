# Local AI Hub Website

This folder contains a standalone Node.js/Vite one-page website for the Local AI Hub project.

## Install

```bash
npm install
```

## Run locally

```bash
npm run dev
```

Open `http://127.0.0.1:5174`.

## MCP SSE test server (port 8080)

For testing the backend MCP **SSE** transport in Settings → MCP Servers:

```bash
npm run mcp:sse
```

Then add an MCP server with:

- **Transport:** SSE
- **URL:** `http://127.0.0.1:8080/sse`

Verify:

```bash
curl http://127.0.0.1:8080/health
curl http://127.0.0.1:8080/
```

Use **Test** on the server in `/settings/mcp`, or enable MCP in chat and ask e.g. "what time is it?" or "run project_info".

Available test tools: `echo`, `get_time`, `project_info`.

## Build

```bash
npm run build
```

The production output is generated in `dist/`.

## Files

- `index.html` - Vite HTML shell and page content
- `src/main.js` - app entrypoint
- `src/styles.css` - responsive visual design
- `public/assets/` - static images served by Vite
