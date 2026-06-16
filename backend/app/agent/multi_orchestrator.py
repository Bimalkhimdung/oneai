"""LangChain multi-agent supervisor — agents communicate like an agentic CLI crew."""

import datetime
import json
import logging
import re
from dataclasses import dataclass
from typing import AsyncIterator

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_ollama import ChatOllama
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.ollama_conn import resolve_ollama_server, ollama_base_url
from app.models import AgentMessage, AgentSession

logger = logging.getLogger("app.agent.multi")

MAX_ROUNDS = 12


@dataclass
class AgentProfileConfig:
    name: str
    role: str
    model: str
    system_prompt: str | None = None


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _parse_supervisor_json(text: str, agent_names: list[str]) -> dict:
    text = text.strip()
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[^{}]*\"agent\"[^{}]*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    upper = text.upper()
    if "FINISH" in upper:
        return {"agent": "FINISH", "reason": text}
    for name in agent_names:
        if name.lower() in text.lower():
            return {"agent": name, "reason": text}
    return {"agent": "FINISH", "reason": "Could not parse supervisor decision."}


class MultiAgentOrchestrator:
    def __init__(
        self,
        db: AsyncSession,
        user_id: str,
        session: AgentSession,
        profiles: list[AgentProfileConfig],
    ):
        self.db = db
        self.user_id = user_id
        self.session = session
        self.profiles = profiles

    async def _persist(
        self,
        role: str,
        content: str,
        event_type: str | None = None,
        metadata: dict | None = None,
    ):
        msg = AgentMessage(
            session_id=self.session.id,
            role=role,
            content=content,
            event_type=event_type,
            meta_data=metadata,
        )
        self.db.add(msg)
        await self.db.flush()

    def _build_supervisor_prompt(self) -> str:
        roster = "\n".join(
            f"- {p.name}: {p.role} (model: {p.model})"
            for p in self.profiles
        )
        names = ", ".join(p.name for p in self.profiles)
        return (
            "You are the supervisor coordinating a multi-agent team (agentic CLI style).\n"
            "Given the user task and conversation transcript, pick the next agent to speak "
            "or FINISH when the task is complete.\n\n"
            f"Team roster:\n{roster}\n\n"
            "Reply with ONLY valid JSON:\n"
            '{"agent": "<name or FINISH>", "reason": "<brief reason>"}\n'
            f"Valid agent names: {names}, FINISH"
        )

    async def run(self, prompt: str) -> AsyncIterator[str]:
        if len(self.profiles) < 2:
            yield _sse("error", {"content": "Multi-agent mode requires at least 2 agents."})
            yield _sse("done", {})
            return

        conn, _ = await resolve_ollama_server(self.db, self.user_id)
        base_url = ollama_base_url(conn)

        supervisor_model = self.profiles[0].model
        supervisor = ChatOllama(model=supervisor_model, base_url=base_url, temperature=0.1)

        llms: dict[str, ChatOllama] = {}
        for p in self.profiles:
            llms[p.name] = ChatOllama(model=p.model, base_url=base_url, temperature=0.3)

        transcript: list[str] = []
        agent_names = [p.name for p in self.profiles]

        await self._persist("user", prompt, "user")
        await self.db.commit()

        if not self.session.title:
            self.session.title = prompt[:80]
            self.session.updated_at = datetime.datetime.utcnow()
            await self.db.commit()

        yield _sse("thought", {"content": f"Starting multi-agent team ({len(self.profiles)} agents)..."})

        last_agent: str | None = None

        for round_num in range(MAX_ROUNDS):
            transcript_text = "\n".join(transcript) if transcript else "(no messages yet)"
            supervisor_input = (
                f"User task:\n{prompt}\n\n"
                f"Transcript:\n{transcript_text}\n\n"
                f"Round {round_num + 1}. Who should act next?"
            )

            try:
                sup_resp = await supervisor.ainvoke([
                    SystemMessage(content=self._build_supervisor_prompt()),
                    HumanMessage(content=supervisor_input),
                ])
                decision = _parse_supervisor_json(str(sup_resp.content), agent_names)
            except Exception as e:
                yield _sse("error", {"content": f"Supervisor failed: {e}"})
                yield _sse("done", {})
                return

            next_agent = (decision.get("agent") or "FINISH").strip()
            reason = decision.get("reason") or ""

            if next_agent.upper() == "FINISH":
                yield _sse("handoff", {"from": last_agent, "to": "FINISH", "reason": reason})
                final = transcript[-1] if transcript else "Task completed."
                # Synthesize if we have multiple agent contributions
                if len(transcript) > 1:
                    try:
                        synth = await supervisor.ainvoke([
                            SystemMessage(content="Synthesize a clear final answer for the user."),
                            HumanMessage(content=f"Task: {prompt}\n\nDiscussion:\n{transcript_text}"),
                        ])
                        final = str(synth.content)
                    except Exception:
                        pass
                yield _sse("response", {"content": final})
                await self._persist("assistant", final, "response", {"mode": "multi-agent"})
                self.session.updated_at = datetime.datetime.utcnow()
                await self.db.commit()
                yield _sse("done", {"sessionId": self.session.id})
                return

            profile = next((p for p in self.profiles if p.name == next_agent), None)
            if not profile:
                yield _sse("thought", {"content": f"Supervisor picked unknown agent '{next_agent}', retrying..."})
                continue

            if last_agent and last_agent != profile.name:
                yield _sse("handoff", {"from": last_agent, "to": profile.name, "reason": reason})
            elif not last_agent:
                yield _sse("handoff", {"from": None, "to": profile.name, "reason": reason})

            last_agent = profile.name

            agent_system = (
                f"You are {profile.name}. Your role: {profile.role}\n"
                "Respond to the user task. Be concise. You are collaborating with other agents.\n"
                f"{profile.system_prompt or ''}"
            ).strip()

            agent_input = (
                f"User task:\n{prompt}\n\n"
                f"Team discussion so far:\n{transcript_text}\n\n"
                f"Your turn ({profile.name}). Contribute your expertise."
            )

            try:
                llm = llms[profile.name]
                agent_resp = await llm.ainvoke([
                    SystemMessage(content=agent_system),
                    HumanMessage(content=agent_input),
                ])
                content = str(agent_resp.content).strip()
            except Exception as e:
                content = f"[{profile.name} error: {e}]"

            line = f"[{profile.name}]: {content}"
            transcript.append(line)

            yield _sse("agent_message", {"agent": profile.name, "content": content, "model": profile.model})
            await self._persist(
                "assistant",
                content,
                "agent_message",
                {"agent": profile.name, "model": profile.model},
            )
            await self.db.commit()

        yield _sse("error", {"content": f"Max rounds ({MAX_ROUNDS}) reached without FINISH."})
        partial = "\n".join(transcript)
        yield _sse("response", {"content": partial or "No output."})
        await self.db.commit()
        yield _sse("done", {"sessionId": self.session.id})
