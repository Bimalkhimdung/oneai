import subprocess
import platform
import psutil
import urllib.request
import urllib.parse
import re
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from app import dependencies
from app.services import installer

router = APIRouter(prefix="/settings")

class InstallRequest(BaseModel):
    provider: str

class PullModelRequest(BaseModel):
    model_name: str

class CpuSpecs(BaseModel):
    brand: str
    physicalCores: int
    logicalCores: int
    percent: float

class RamSpecs(BaseModel):
    totalGb: float
    usedGb: float
    freeGb: float
    percent: float

class StorageSpecs(BaseModel):
    totalGb: float
    usedGb: float
    freeGb: float
    percent: float

class SystemSpecsResponse(BaseModel):
    cpu: CpuSpecs
    ram: RamSpecs
    storage: StorageSpecs

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

@router.get("/system-specs", response_model=SystemSpecsResponse)
async def get_system_specs(
    current_user: dict = Depends(dependencies.require_auth)
):
    try:
        # Get CPU brand/model name
        brand = "Unknown CPU"
        if platform.system() == "Darwin":
            try:
                brand = subprocess.check_output(["sysctl", "-n", "machdep.cpu.brand_string"]).decode().strip()
            except Exception:
                pass
        if not brand or brand == "Unknown CPU":
            brand = platform.processor() or platform.machine() or "Generic CPU"

        cpu_specs = CpuSpecs(
            brand=brand,
            physicalCores=psutil.cpu_count(logical=False) or 0,
            logicalCores=psutil.cpu_count(logical=True) or 0,
            percent=psutil.cpu_percent(interval=0.1)
        )

        vm = psutil.virtual_memory()
        ram_specs = RamSpecs(
            totalGb=round(vm.total / (1024 ** 3), 1),
            usedGb=round(vm.used / (1024 ** 3), 1),
            freeGb=round(vm.available / (1024 ** 3), 1),
            percent=vm.percent
        )

        disk = psutil.disk_usage("/")
        storage_specs = StorageSpecs(
            totalGb=round(disk.total / (1024 ** 3), 1),
            usedGb=round(disk.used / (1024 ** 3), 1),
            freeGb=round(disk.free / (1024 ** 3), 1),
            percent=disk.percent
        )

        return SystemSpecsResponse(
            cpu=cpu_specs,
            ram=ram_specs,
            storage=storage_specs
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve system specifications: {str(e)}"
        )

@router.get("/ollama/search")
async def search_ollama_models(
    q: str = Query("", description="Search query for ollama models"),
    current_user: dict = Depends(dependencies.require_auth)
):
    try:
        url = f"https://ollama.com/search?q={urllib.parse.quote(q)}"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            html = response.read().decode('utf-8')

        # Extract all <a href="/library/...> blocks via regex
        blocks = re.findall(
            r'<a href="/library/([^"]+)".*?<span x-test-search-response-title>([^<]+)</span>.*?<p[^>]*>([^<]+)</p>', 
            html, 
            re.DOTALL
        )
        
        models = []
        for block in blocks:
            models.append({
                "id": block[0],
                "name": block[1].strip(),
                "description": block[2].strip().replace('\n', ' ')
            })
            
        return {"models": models}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to search models: {str(e)}"
        )

@router.post("/ollama/pull")
async def pull_ollama_model(
    req: PullModelRequest,
    current_user: dict = Depends(dependencies.require_auth)
):
    res = installer.trigger_model_pull(req.model_name)
    if not res.get("ok", True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=res.get("message", "Failed to start model pull")
        )
    return res
