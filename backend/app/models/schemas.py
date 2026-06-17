import re
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Any, Dict

# Input Validation Schemas
class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    fullName: str = Field(..., min_length=1, max_length=120)

class UpdateProfileInput(BaseModel):
    fullName: Optional[str] = Field(None, min_length=1, max_length=120)
    oldPassword: Optional[str] = Field(None, min_length=1, max_length=128)
    newPassword: Optional[str] = Field(None, min_length=8, max_length=128)

class LoginInput(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)

class ForgotPasswordInput(BaseModel):
    email: EmailStr

class ResetPasswordInput(BaseModel):
    token: str = Field(..., min_length=10)
    password: str = Field(..., min_length=8, max_length=128)

class CreateServerInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    host: str = Field(..., min_length=1, max_length=253)
    port: int = Field(..., ge=1, le=65535)
    provider: str
    apiKey: Optional[str] = Field(None, min_length=1, max_length=512)

    @field_validator("host")
    @classmethod
    def validate_host(cls, v):
        if not re.match(r"^[a-zA-Z0-9.\-_]+$", v):
            raise ValueError("Host can contain letters, numbers, dot, dash, underscore.")
        return v

class TestServerInput(BaseModel):
    host: str = Field(..., min_length=1, max_length=253)
    port: int = Field(..., ge=1, le=65535)
    provider: str
    apiKey: Optional[str] = Field(None, min_length=1, max_length=512)

    @field_validator("host")
    @classmethod
    def validate_host(cls, v):
        if not re.match(r"^[a-zA-Z0-9.\-_]+$", v):
            raise ValueError("Host can contain letters, numbers, dot, dash, underscore.")
        return v

class CreateChatInput(BaseModel):
    modelId: str = Field(..., min_length=1)
    title: Optional[str] = Field(None, max_length=120)

class SendMessageInput(BaseModel):
    content: str = Field(..., min_length=1, max_length=64000)
    web_search: bool = False
    mcp_enabled: bool = False

class UpdateChatInput(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=120)
    pinned: Optional[bool] = None

class CreateMcpServerInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    transport: str = Field(default="STDIO")
    command: Optional[str] = Field(None, min_length=1, max_length=512)
    args: Optional[List[str]] = None
    env: Optional[Dict[str, str]] = None
    url: Optional[str] = Field(None, max_length=2048)
    enabled: bool = True

    @field_validator("transport")
    @classmethod
    def validate_transport(cls, v):
        upper = v.upper()
        if upper not in ("STDIO", "SSE"):
            raise ValueError("Transport must be STDIO or SSE.")
        return upper

class UpdateMcpServerInput(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=60)
    transport: Optional[str] = None
    command: Optional[str] = Field(None, min_length=1, max_length=512)
    args: Optional[List[str]] = None
    env: Optional[Dict[str, str]] = None
    url: Optional[str] = Field(None, max_length=2048)
    enabled: Optional[bool] = None

    @field_validator("transport")
    @classmethod
    def validate_transport(cls, v):
        if v is None:
            return v
        upper = v.upper()
        if upper not in ("STDIO", "SSE"):
            raise ValueError("Transport must be STDIO or SSE.")
        return upper

class CompareInput(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=16000)
    modelIds: List[str] = Field(..., min_length=2, max_length=5)


class CompareResultDto(BaseModel):
    modelId: str
    modelName: str
    content: str
    tokensIn: Optional[int] = None
    tokensOut: Optional[int] = None
    durationMs: Optional[int] = None
    error: Optional[str] = None


class CompareResponseDto(BaseModel):
    prompt: str
    results: List[CompareResultDto]


# Outgoing Response DTO Schemas
class UserDto(BaseModel):
    id: str
    email: str
    fullName: str
    role: str
    createdAt: str

class AuthResultDto(BaseModel):
    user: UserDto
    accessToken: str
    expiresIn: int

class ServerDto(BaseModel):
    id: str
    name: str
    host: str
    port: int
    provider: str
    status: str
    version: Optional[str] = None
    lastSeenAt: Optional[str] = None
    createdAt: str
    models: list[dict] = Field(default_factory=list)

class ModelDto(BaseModel):
    id: str
    serverId: str
    name: str
    family: Optional[str] = None
    sizeBytes: str
    digest: str
    installedAt: str
    lastUsedAt: Optional[str] = None

class MessageDto(BaseModel):
    id: str
    chatId: str
    role: str
    content: str
    modelName: Optional[str] = None
    tokensIn: Optional[int] = None
    tokensOut: Optional[int] = None
    durationMs: Optional[int] = None
    createdAt: str

class DocumentDto(BaseModel):
    id: str
    chatId: str
    filename: str
    createdAt: str

class ChatDto(BaseModel):
    id: str
    title: str
    pinned: bool
    modelId: Optional[str] = None
    createdAt: str
    updatedAt: str

class ChatDetailDto(ChatDto):
    messages: List[MessageDto]
    documents: List[DocumentDto] = Field(default_factory=list)

class McpServerDto(BaseModel):
    id: str
    name: str
    transport: str
    command: Optional[str] = None
    args: Optional[List[str]] = None
    env: Optional[Dict[str, str]] = None
    url: Optional[str] = None
    enabled: bool
    createdAt: str
    updatedAt: str

class McpTestResultDto(BaseModel):
    ok: bool
    toolCount: int = 0
    resourceCount: int = 0
    tools: List[str] = Field(default_factory=list)
    error: Optional[str] = None

class AgentProfileInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    role: str = Field(..., min_length=1, max_length=2000)
    model: str = Field(..., min_length=1, max_length=120)
    system_prompt: Optional[str] = Field(None, max_length=4000)

class AgentRunRequest(BaseModel):
    prompt: str
    session_id: Optional[str] = None
    team_id: Optional[str] = None
    agents: Optional[List[AgentProfileInput]] = None
    model: Optional[str] = None
    system_prompt: Optional[str] = None
    mode: str = "single"
    max_iterations: Optional[int] = Field(None, ge=1, le=20)

class ChatAgentRunRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=16000)

class AgentProfileDto(BaseModel):
    id: str
    name: str
    role: str
    model: str
    systemPrompt: Optional[str] = None
    sortOrder: int

class AgentTeamDto(BaseModel):
    id: str
    name: str
    profiles: List[AgentProfileDto] = Field(default_factory=list)
    createdAt: str
    updatedAt: str

class CreateAgentTeamInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    profiles: List[AgentProfileInput] = Field(..., min_length=1, max_length=8)

class UpdateAgentTeamInput(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    profiles: Optional[List[AgentProfileInput]] = None

class AgentSessionDto(BaseModel):
    id: str
    userId: str
    title: Optional[str] = None
    status: str
    createdAt: str
    updatedAt: str

class ToolDefinition(BaseModel):
    name: str
    description: str
    parameters: dict

class MemoryQuery(BaseModel):
    query: str
    top_k: int = 5

class AgentMessageDto(BaseModel):
    id: str
    sessionId: str
    role: str
    content: str
    eventType: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    createdAt: str

class AgentSessionDetailDto(AgentSessionDto):
    messages: List[AgentMessageDto] = Field(default_factory=list)
