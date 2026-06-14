import json
import logging
import re
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app import crud, models
from app.models import schemas

logger = logging.getLogger("app.mcp")

MAX_TOOL_CALLS = 3
MAX_RESOURCES = 5


def to_mcp_server_dto(server: models.McpServer) -> schemas.McpServerDto:
    return schemas.McpServerDto(
        id=server.id,
        name=server.name,
        transport=server.transport.value if hasattr(server.transport, "value") else str(server.transport),
        command=server.command,
        args=server.args,
        env=server.env,
        url=server.url,
        enabled=server.enabled,
        createdAt=server.created_at.isoformat() + "Z",
        updatedAt=server.updated_at.isoformat() + "Z",
    )


def _validate_create_input(input_data: schemas.CreateMcpServerInput):
    if input_data.transport == "STDIO" and not input_data.command:
        raise ValueError("Command is required for STDIO transport.")
    if input_data.transport == "SSE" and not input_data.url:
        raise ValueError("URL is required for SSE transport.")


async def create(db: AsyncSession, user_id: str, input_data: schemas.CreateMcpServerInput) -> schemas.McpServerDto:
    _validate_create_input(input_data)
    server = await crud.create_mcp_server(
        db,
        user_id=user_id,
        name=input_data.name,
        transport=models.McpTransport(input_data.transport),
        command=input_data.command,
        args=input_data.args,
        env=input_data.env,
        url=input_data.url,
        enabled=input_data.enabled,
    )
    return to_mcp_server_dto(server)


async def list_servers(db: AsyncSession, user_id: str) -> list[schemas.McpServerDto]:
    servers = await crud.list_mcp_servers_for_user(db, user_id)
    return [to_mcp_server_dto(s) for s in servers]


async def update(
    db: AsyncSession,
    server_id: str,
    user_id: str,
    input_data: schemas.UpdateMcpServerInput,
) -> schemas.McpServerDto:
    server = await crud.get_mcp_server_by_id_and_user_id(db, server_id, user_id)
    if not server:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MCP server not found.")

    update_data = input_data.model_dump(exclude_unset=True)
    if "transport" in update_data and update_data["transport"] is not None:
        update_data["transport"] = models.McpTransport(update_data["transport"])

    transport = update_data.get("transport", server.transport)
    command = update_data.get("command", server.command)
    url = update_data.get("url", server.url)
    if transport == models.McpTransport.STDIO and not command:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Command is required for STDIO transport.")
    if transport == models.McpTransport.SSE and not url:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="URL is required for SSE transport.")

    updated = await crud.update_mcp_server(db, server_id, **update_data)
    return to_mcp_server_dto(updated)


async def remove(db: AsyncSession, server_id: str, user_id: str):
    server = await crud.get_mcp_server_by_id_and_user_id(db, server_id, user_id)
    if not server:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MCP server not found.")
    await crud.delete_mcp_server(db, server_id)


async def test_server(db: AsyncSession, server_id: str, user_id: str) -> schemas.McpTestResultDto:
    server = await crud.get_mcp_server_by_id_and_user_id(db, server_id, user_id)
    if not server:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MCP server not found.")

    try:
        tools, resources = await _connect_and_discover(server)
        return schemas.McpTestResultDto(
            ok=True,
            toolCount=len(tools),
            resourceCount=len(resources),
            tools=[t.name for t in tools],
        )
    except Exception as e:
        logger.warning(f"MCP test failed for {server.name}: {e}")
        return schemas.McpTestResultDto(ok=False, error=str(e))


def _score_tool(tool, query: str) -> float:
    q_words = {w for w in re.findall(r"[a-z0-9]+", query.lower()) if len(w) > 2}
    if not q_words:
        return 0.0
    name_words = set(re.findall(r"[a-z0-9]+", tool.name.lower()))
    desc_words = set(re.findall(r"[a-z0-9]+", (tool.description or "").lower()))
    return float(len(q_words & (name_words | desc_words)))


def _build_tool_args(tool, query: str) -> dict[str, Any] | None:
    schema = tool.inputSchema or {}
    props = schema.get("properties") or {}
    required = schema.get("required") or []

    for key in ("query", "input", "text", "prompt", "question", "search"):
        if key in props:
            return {key: query}

    if required:
        first = required[0]
        prop = props.get(first, {})
        if prop.get("type") == "string":
            return {first: query}
        return None

    if props:
        first_key = next(iter(props))
        if props[first_key].get("type") == "string":
            return {first_key: query}
        return None

    return {}


def _extract_tool_result_text(result) -> str:
    chunks = []
    for block in result.content or []:
        text = getattr(block, "text", None)
        if text:
            chunks.append(text)
            continue
        if isinstance(block, dict):
            if block.get("text"):
                chunks.append(block["text"])
            elif block.get("type") == "text" and block.get("text"):
                chunks.append(block["text"])
    if chunks:
        return "\n".join(chunks)
    return json.dumps(result.model_dump() if hasattr(result, "model_dump") else str(result), default=str)[:4000]


async def _connect_and_discover(server: models.McpServer):
    if server.transport == models.McpTransport.SSE:
        from mcp import ClientSession
        from mcp.client.sse import sse_client

        async with sse_client(server.url) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                tools_resp = await session.list_tools()
                resources_resp = await session.list_resources()
                return tools_resp.tools, resources_resp.resources

    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    params = StdioServerParameters(
        command=server.command,
        args=server.args or [],
        env=server.env or None,
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools_resp = await session.list_tools()
            resources_resp = await session.list_resources()
            return tools_resp.tools, resources_resp.resources


async def _session_context(session, server_name: str, query: str) -> str:
    sections: list[str] = [f"### MCP Server: {server_name}"]

    tools_resp = await session.list_tools()
    tools = tools_resp.tools or []
    if tools:
        tool_lines = []
        for tool in tools:
            desc = tool.description or "No description"
            tool_lines.append(f"- {tool.name}: {desc}")
        sections.append("Available tools:\n" + "\n".join(tool_lines))
    else:
        sections.append("No tools exposed by this server.")

    ranked = sorted(tools, key=lambda t: _score_tool(t, query), reverse=True)
    tool_results: list[str] = []
    calls = 0
    for tool in ranked:
        if calls >= MAX_TOOL_CALLS:
            break
        score = _score_tool(tool, query)
        args = _build_tool_args(tool, query)
        if args is None:
            continue
        if score < 1 and calls > 0:
            break
        try:
            result = await session.call_tool(tool.name, arguments=args)
            tool_results.append(f"Tool `{tool.name}` result:\n{_extract_tool_result_text(result)}")
            calls += 1
        except Exception as e:
            logger.debug(f"MCP tool {tool.name} call failed: {e}")

    if tool_results:
        sections.append("Tool execution results:\n" + "\n\n".join(tool_results))

    try:
        resources_resp = await session.list_resources()
        resources = (resources_resp.resources or [])[:MAX_RESOURCES]
        if resources:
            resource_lines = []
            for resource in resources:
                name = getattr(resource, "name", None) or str(resource.uri)
                resource_lines.append(f"- {name} ({resource.uri})")
            sections.append("Resources:\n" + "\n".join(resource_lines))

            for resource in resources[:3]:
                try:
                    content = await session.read_resource(resource.uri)
                    text_blocks = []
                    for block in content.contents or []:
                        text = getattr(block, "text", None)
                        if text:
                            text_blocks.append(text[:2000])
                    if text_blocks:
                        sections.append(
                            f"Resource `{resource.uri}` content:\n" + "\n".join(text_blocks)
                        )
                except Exception as e:
                    logger.debug(f"Failed to read MCP resource {resource.uri}: {e}")
    except Exception as e:
        logger.debug(f"Failed to list MCP resources for {server_name}: {e}")

    return "\n\n".join(sections)


async def _gather_from_server(server: models.McpServer, query: str) -> str:
    if server.transport == models.McpTransport.SSE:
        from mcp import ClientSession
        from mcp.client.sse import sse_client

        async with sse_client(server.url) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                return await _session_context(session, server.name, query)

    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    params = StdioServerParameters(
        command=server.command,
        args=server.args or [],
        env=server.env or None,
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            return await _session_context(session, server.name, query)


async def gather_mcp_context(db: AsyncSession, user_id: str, query: str) -> str:
    servers = await crud.list_mcp_servers_for_user(db, user_id, enabled_only=True)
    if not servers:
        return ""

    parts: list[str] = []
    for server in servers:
        try:
            ctx = await _gather_from_server(server, query)
            if ctx:
                parts.append(ctx)
        except Exception as e:
            logger.warning(f"MCP server '{server.name}' failed: {e}")
            parts.append(f"[MCP server '{server.name}' unavailable: {e}]")

    if not parts:
        return ""
    return "--- MCP TOOL CONTEXT ---\n" + "\n\n".join(parts)
