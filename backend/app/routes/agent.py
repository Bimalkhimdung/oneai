import datetime
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app import dependencies
from app.agent.multi_orchestrator import AgentProfileConfig, MultiAgentOrchestrator, MAX_ROUNDS
from app.agent.orchestrator import AgentOrchestrator, MAX_ITERATIONS
from app.models import database, schemas, AgentSession, AgentMessage, AgentTeam, AgentProfile

logger = logging.getLogger("app.agent.routes")

router = APIRouter(prefix="/agent")


def _session_dto(s: AgentSession) -> schemas.AgentSessionDto:
    return schemas.AgentSessionDto(
        id=s.id,
        userId=s.user_id,
        title=s.title,
        status=s.status,
        createdAt=s.created_at.isoformat() + "Z",
        updatedAt=s.updated_at.isoformat() + "Z",
    )


def _message_dto(m: AgentMessage) -> schemas.AgentMessageDto:
    return schemas.AgentMessageDto(
        id=m.id,
        sessionId=m.session_id,
        role=m.role,
        content=m.content,
        eventType=m.event_type,
        metadata=m.meta_data,
        createdAt=m.created_at.isoformat() + "Z",
    )


def _profile_dto(p: AgentProfile) -> schemas.AgentProfileDto:
    return schemas.AgentProfileDto(
        id=p.id,
        name=p.name,
        role=p.role,
        model=p.model,
        systemPrompt=p.system_prompt,
        sortOrder=p.sort_order,
    )


def _team_dto(t: AgentTeam) -> schemas.AgentTeamDto:
    return schemas.AgentTeamDto(
        id=t.id,
        name=t.name,
        profiles=[_profile_dto(p) for p in sorted(t.profiles, key=lambda x: x.sort_order)],
        createdAt=t.created_at.isoformat() + "Z",
        updatedAt=t.updated_at.isoformat() + "Z",
    )


def _profiles_from_input(items: list[schemas.AgentProfileInput]) -> list[AgentProfileConfig]:
    return [
        AgentProfileConfig(
            name=i.name,
            role=i.role,
            model=i.model,
            system_prompt=i.system_prompt,
        )
        for i in items
    ]


async def _load_profiles(
    db: AsyncSession,
    user_id: str,
    body: schemas.AgentRunRequest,
) -> list[AgentProfileConfig] | None:
    if body.agents and len(body.agents) >= 2:
        return _profiles_from_input(body.agents)
    if body.team_id:
        stmt = (
            select(AgentTeam)
            .where(AgentTeam.id == body.team_id, AgentTeam.user_id == user_id)
            .options(selectinload(AgentTeam.profiles))
        )
        team = (await db.execute(stmt)).scalar_one_or_none()
        if not team:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found.")
        if len(team.profiles) < 2:
            raise HTTPException(status_code=400, detail="Team needs at least 2 agents.")
        return [
            AgentProfileConfig(
                name=p.name,
                role=p.role,
                model=p.model,
                system_prompt=p.system_prompt,
            )
            for p in sorted(team.profiles, key=lambda x: x.sort_order)
        ]
    return None


@router.get("/tools", response_model=list[schemas.ToolDefinition])
async def list_tools(
    current_user: dict = Depends(dependencies.require_auth),
):
    from app.agent.tools import get_static_tool_definitions
    return [
        schemas.ToolDefinition(
            name=t["name"],
            description=t["description"],
            parameters=t["parameters"],
        )
        for t in get_static_tool_definitions()
    ]


@router.get("/teams", response_model=list[schemas.AgentTeamDto])
async def list_teams(
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db),
):
    stmt = (
        select(AgentTeam)
        .where(AgentTeam.user_id == current_user["id"])
        .options(selectinload(AgentTeam.profiles))
        .order_by(AgentTeam.updated_at.desc())
    )
    teams = (await db.execute(stmt)).scalars().all()
    return [_team_dto(t) for t in teams]


@router.post("/teams", response_model=schemas.AgentTeamDto, status_code=status.HTTP_201_CREATED)
async def create_team(
    body: schemas.CreateAgentTeamInput,
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db),
):
    if len(body.profiles) < 2:
        raise HTTPException(status_code=400, detail="At least 2 agents required.")
    team = AgentTeam(user_id=current_user["id"], name=body.name)
    db.add(team)
    await db.flush()
    for i, p in enumerate(body.profiles):
        db.add(AgentProfile(
            team_id=team.id,
            name=p.name,
            role=p.role,
            model=p.model,
            system_prompt=p.system_prompt,
            sort_order=i,
        ))
    await db.commit()
    stmt = (
        select(AgentTeam)
        .where(AgentTeam.id == team.id)
        .options(selectinload(AgentTeam.profiles))
    )
    team = (await db.execute(stmt)).scalar_one()
    return _team_dto(team)


@router.patch("/teams/{team_id}", response_model=schemas.AgentTeamDto)
async def update_team(
    team_id: str,
    body: schemas.UpdateAgentTeamInput,
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db),
):
    stmt = (
        select(AgentTeam)
        .where(AgentTeam.id == team_id, AgentTeam.user_id == current_user["id"])
        .options(selectinload(AgentTeam.profiles))
    )
    team = (await db.execute(stmt)).scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found.")
    if body.name:
        team.name = body.name
    if body.profiles is not None:
        if len(body.profiles) < 2:
            raise HTTPException(status_code=400, detail="At least 2 agents required.")
        await db.execute(delete(AgentProfile).where(AgentProfile.team_id == team_id))
        for i, p in enumerate(body.profiles):
            db.add(AgentProfile(
                team_id=team.id,
                name=p.name,
                role=p.role,
                model=p.model,
                system_prompt=p.system_prompt,
                sort_order=i,
            ))
    team.updated_at = datetime.datetime.utcnow()
    await db.commit()
    stmt = (
        select(AgentTeam)
        .where(AgentTeam.id == team_id)
        .options(selectinload(AgentTeam.profiles))
    )
    team = (await db.execute(stmt)).scalar_one()
    return _team_dto(team)


@router.delete("/teams/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team(
    team_id: str,
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db),
):
    stmt = select(AgentTeam).where(AgentTeam.id == team_id, AgentTeam.user_id == current_user["id"])
    team = (await db.execute(stmt)).scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found.")
    await db.delete(team)
    await db.commit()


@router.post("/run")
async def run_agent(
    body: schemas.AgentRunRequest,
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db),
):
    profiles = await _load_profiles(db, current_user["id"], body)
    use_multi = body.mode == "multi" or profiles is not None

    if use_multi and not profiles:
        raise HTTPException(
            status_code=400,
            detail="Multi-agent mode requires team_id or agents (min 2).",
        )
    if not use_multi and not body.model:
        raise HTTPException(status_code=400, detail="Single-agent mode requires model.")

    session: AgentSession | None = None
    if body.session_id:
        stmt = select(AgentSession).where(
            AgentSession.id == body.session_id,
            AgentSession.user_id == current_user["id"],
        )
        session = (await db.execute(stmt)).scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

    if not session:
        session = AgentSession(
            user_id=current_user["id"],
            title=None,
            status="ACTIVE",
            system_prompt=body.system_prompt,
            team_id=body.team_id,
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)
    elif body.team_id:
        session.team_id = body.team_id
        await db.commit()

    async def event_stream():
        try:
            if use_multi and profiles:
                orchestrator = MultiAgentOrchestrator(
                    db=db,
                    user_id=current_user["id"],
                    session=session,
                    profiles=profiles,
                    max_rounds=body.max_iterations or MAX_ROUNDS,
                )
                async for chunk in orchestrator.run(body.prompt):
                    yield chunk
            else:
                orchestrator = AgentOrchestrator(
                    db=db,
                    user_id=current_user["id"],
                    session=session,
                    model=body.model or "",
                    system_prompt=body.system_prompt,
                    max_iterations=body.max_iterations or MAX_ITERATIONS,
                )
                async for chunk in orchestrator.run(body.prompt):
                    yield chunk
        except Exception as e:
            logger.error(f"Agent run failed: {e}", exc_info=True)
            import json
            yield f"event: error\ndata: {json.dumps({'content': str(e)})}\n\n"
            yield f"event: done\ndata: {{}}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/session/{session_id}", response_model=schemas.AgentSessionDetailDto)
async def get_session(
    session_id: str,
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db),
):
    stmt = (
        select(AgentSession)
        .where(AgentSession.id == session_id, AgentSession.user_id == current_user["id"])
        .options(selectinload(AgentSession.messages))
    )
    session = (await db.execute(stmt)).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

    dto = _session_dto(session)
    messages = sorted(session.messages, key=lambda m: m.created_at)
    return schemas.AgentSessionDetailDto(
        **dto.model_dump(),
        messages=[_message_dto(m) for m in messages],
    )


@router.get("/sessions", response_model=list[schemas.AgentSessionDto])
async def list_sessions(
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db),
):
    stmt = (
        select(AgentSession)
        .where(AgentSession.user_id == current_user["id"])
        .order_by(AgentSession.updated_at.desc())
    )
    sessions = (await db.execute(stmt)).scalars().all()
    return [_session_dto(s) for s in sessions]


@router.delete("/session/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: str,
    current_user: dict = Depends(dependencies.require_auth),
    db: AsyncSession = Depends(database.get_db),
):
    stmt = select(AgentSession).where(
        AgentSession.id == session_id,
        AgentSession.user_id == current_user["id"],
    )
    session = (await db.execute(stmt)).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    await db.execute(delete(AgentSession).where(AgentSession.id == session_id))
    await db.commit()
