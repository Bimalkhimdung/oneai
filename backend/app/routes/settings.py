import subprocess
import platform
import psutil
import urllib.request
import urllib.parse
import re
import json
import concurrent.futures
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from app import dependencies
from app.services import installer

router = APIRouter(prefix="/settings")

class InstallRequest(BaseModel):
    provider: str

class PullModelRequest(BaseModel):
    model_name: str
    tracking_id: str | None = None

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

def _fetch_registry_size(model_id: str) -> tuple[str, str]:
    url = f"https://registry.ollama.ai/v2/library/{model_id}/manifests/latest"
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/vnd.docker.distribution.manifest.v2+json"})
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            total = sum(layer.get("size", 0) for layer in data.get("layers", []))
            if total > 0:
                size_gb = round(total / (1024**3), 1)
                return model_id, f"{size_gb} GB"
    except Exception:
        pass
    return model_id, ""

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
async def get_system_specs():
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
    page: int = Query(1, description="Page number"),
    current_user: dict = Depends(dependencies.require_auth)
):
    try:
        url = f"https://ollama.com/search?q={urllib.parse.quote(q)}"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            html = response.read().decode('utf-8')

        # Extract all <li x-test-model> blocks via regex
        blocks = re.findall(
            r'<li x-test-model.*?<a href="/library/([^"]+)".*?<span x-test-search-response-title>([^<]+)</span>.*?<p[^>]*>([^<]+)</p>(.*?)</li>', 
            html, 
            re.DOTALL
        )
        
        # Paginate blocks
        limit = 10
        total_blocks = len(blocks)
        has_more = (page * limit) < total_blocks
        start_idx = (page - 1) * limit
        end_idx = page * limit
        blocks = blocks[start_idx:end_idx]
        
        models = []
        for block in blocks:
            rest = block[3]
            raw_tags = re.findall(r'<span[^>]*class="[^"]*text-[^"]*"[^>]*>([^<]+)</span>', rest)
            tags = [t.strip() for t in raw_tags if t.strip() and not t.strip().startswith('span')]

            models.append({
                "id": block[0].strip(),
                "name": block[1].strip(),
                "description": block[2].strip().replace('\n', ' '),
                "tags": tags
            })
            
        # Also fetch local models so they always show up
        import json
        try:
            req_local = urllib.request.Request("http://127.0.0.1:11434/api/tags")
            with urllib.request.urlopen(req_local, timeout=1) as resp:
                local_data = json.loads(resp.read().decode('utf-8'))
                existing_ids = {m["id"] for m in models}
                
                local_sizes = {}
                
                for lm in local_data.get("models", []):
                    m_name = lm["name"]
                    m_id = m_name.replace(":latest", "")
                    
                    # Calculate size in GB
                    size_gb = round(lm.get("size", 0) / (1024 ** 3), 1)
                    size_str = f"{size_gb} GB" if size_gb > 0 else ""
                    local_sizes[m_id] = size_str
                    
                    if m_id not in existing_ids:
                        if not q or q.lower() in m_id.lower() or q.lower() in m_name.lower():
                            tags = []
                            details = lm.get("details", {})
                            if details.get("parameter_size"):
                                tags.append(details["parameter_size"].lower())
                                
                            models.append({
                                "id": m_id,
                                "name": m_name,
                                "description": "Locally installed model.",
                                "tags": tags,
                                "size": size_str
                            })
                            
                # Attach sizes to existing models if they are installed
                for m in models:
                    if m["id"] in local_sizes:
                        m["size"] = local_sizes[m["id"]]
                        
        except Exception:
            pass
            
        # 3. Fetch sizes for any uninstalled models from remote registry in parallel
        unfetched_models = [m["id"] for m in models if not m.get("size")]
        if unfetched_models:
            with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
                remote_sizes = dict(executor.map(_fetch_registry_size, unfetched_models))
            
            for m in models:
                if not m.get("size") and remote_sizes.get(m["id"]):
                    m["size"] = remote_sizes[m["id"]]
            
        return {"models": models, "has_more": has_more}
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
    res = installer.trigger_model_pull(req.model_name, req.tracking_id)
    if not res.get("ok", True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=res.get("message", "Failed to start model pull")
        )
    return res

@router.post("/ollama/delete")
async def delete_ollama_model(
    req: PullModelRequest,
    current_user: dict = Depends(dependencies.require_auth)
):
    res = installer.delete_model(req.model_name)
    if not res.get("ok", True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=res.get("message", "Failed to delete model")
        )
    return res
