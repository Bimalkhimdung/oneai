from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from app import dependencies
from app.services import installer

router = APIRouter(prefix="/settings")

class InstallRequest(BaseModel):
    provider: str

@router.get("/installations")
async def get_installations(
    current_user: dict = Depends(dependencies.require_auth)
):
    # Returns statuses of all providers
    return installer.get_statuses()

@router.post("/install")
async def start_installation(
    req: InstallRequest,
    current_user: dict = Depends(dependencies.require_auth)
):
    provider = req.provider.upper()
    if provider not in ["OLLAMA", "LLAMA_CPP", "VLLM"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid provider name"
        )
    res = installer.trigger_install(provider)
    if not res.get("ok", True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=res.get("message", "Failed to trigger installation")
        )
    return res
