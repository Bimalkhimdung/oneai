import asyncio
import logging
import os
import platform
import shutil
import subprocess

logger = logging.getLogger("app.installer")

# In-memory status and log storage
INSTALL_STATUS = {
    "OLLAMA":    {"status": "idle", "logs": [], "progress": 0},
    "LLAMA_CPP": {"status": "idle", "logs": [], "progress": 0},
    "VLLM":      {"status": "idle", "logs": [], "progress": 0},
}

# ── OS detection ─────────────────────────────────────────────────────────────

def _get_os() -> str:
    """Returns 'windows', 'macos', or 'linux'."""
    s = platform.system().lower()
    if s == "windows":
        return "windows"
    if s == "darwin":
        return "macos"
    return "linux"


def _has(exe: str) -> bool:
    return shutil.which(exe) is not None


# ── Command builders ──────────────────────────────────────────────────────────

def _ollama_cmd() -> list[str] | None:
    """Returns the correct install command list for the current OS."""
    os_name = _get_os()

    if os_name == "windows":
        # PowerShell one-liner via irm/iex
        return [
            "powershell",
            "-NoProfile",
            "-Command",
            "irm https://ollama.com/install.ps1 | iex",
        ]

    if os_name == "macos":
        if _has("brew"):
            return ["brew", "install", "--cask", "ollama"]
        return [
            "sh", "-c",
            "echo 'Downloading Ollama for macOS...' && "
            "curl -L https://ollama.com/download/Ollama-darwin.zip -o /tmp/Ollama.zip && "
            "unzip -o /tmp/Ollama.zip -d /Applications && "
            "rm /tmp/Ollama.zip && "
            "echo 'Ollama installed successfully under /Applications!'"
        ]

    if os_name == "linux":
        # Official install script for Linux
        return ["sh", "-c", "curl -fsSL https://ollama.com/install.sh | sh"]

    return None


def _llamacpp_cmd() -> list[str] | None:
    os_name = _get_os()

    if os_name == "windows":
        # Pre-built releases via winget (if available) or manual message
        if _has("winget"):
            return ["winget", "install", "--id", "ggerganov.llama.cpp", "-e"]
        # Fallback: guide the user to download manually
        return [
            "powershell", "-NoProfile", "-Command",
            "Write-Host 'Please download llama.cpp from https://github.com/ggerganov/llama.cpp/releases'",
        ]

    if os_name == "macos":
        if _has("brew"):
            return ["brew", "install", "llama.cpp"]
        # Build from source
        return [
            "sh", "-c",
            (
                "echo 'Cloning llama.cpp...' && "
                "git clone https://github.com/ggerganov/llama.cpp.git /tmp/llama.cpp && "
                "cd /tmp/llama.cpp && "
                "make -j$(sysctl -n hw.logicalcpu) && "
                "mkdir -p ~/bin && cp llama-cli ~/bin/ && "
                "echo 'llama.cpp binary installed to ~/bin/llama-cli'"
            ),
        ]

    # Linux
    return [
        "sh", "-c",
        (
            "echo 'Cloning llama.cpp...' && "
            "git clone https://github.com/ggerganov/llama.cpp.git /tmp/llama.cpp && "
            "cd /tmp/llama.cpp && "
            "make -j$(nproc) && "
            "mkdir -p ~/bin && cp llama-cli ~/bin/ && "
            "echo 'llama.cpp binary installed to ~/bin/llama-cli'"
        ),
    ]


def _vllm_cmd() -> list[str] | None:
    os_name = _get_os()
    if os_name == "windows":
        return [
            "powershell", "-NoProfile", "-Command",
            "Write-Host 'vLLM does not support Windows natively. Use WSL2 with a Linux distribution.'",
        ]
    # macOS / Linux — pip install
    pip = "pip3" if _has("pip3") else "pip"
    return ["sh", "-c", f"echo 'Installing vLLM...' && {pip} install vllm"]


# ── Subprocess runner ─────────────────────────────────────────────────────────

async def run_command_stream_logs(provider: str, cmd: list[str]):
    INSTALL_STATUS[provider]["status"] = "installing"
    INSTALL_STATUS[provider]["logs"] = []
    INSTALL_STATUS[provider]["progress"] = 10

    cmd_str = " ".join(cmd)
    logger.info(f"Starting installation for {provider} on {_get_os()}: {cmd_str}")
    INSTALL_STATUS[provider]["logs"].append(f"$ {cmd_str}\n")

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,  # merge stderr → stdout for simpler streaming
        )

        async for raw_line in process.stdout:
            line = raw_line.decode("utf-8", errors="ignore")
            INSTALL_STATUS[provider]["logs"].append(line)
            logger.debug(f"[{provider}] {line.strip()}")

        returncode = await process.wait()
        if returncode == 0:
            INSTALL_STATUS[provider]["status"] = "completed"
            INSTALL_STATUS[provider]["progress"] = 100
            INSTALL_STATUS[provider]["logs"].append("\n✓ Installation completed successfully!\n")
            logger.info(f"Installation of {provider} completed successfully.")
        else:
            INSTALL_STATUS[provider]["status"] = "failed"
            INSTALL_STATUS[provider]["logs"].append(
                f"\n✗ Installation failed (exit code {returncode}).\n"
            )
            logger.error(f"Installation of {provider} failed with code {returncode}.")

    except Exception as e:
        INSTALL_STATUS[provider]["status"] = "failed"
        INSTALL_STATUS[provider]["logs"].append(f"\n✗ Error: {e}\n")
        logger.exception(f"Exception during installation of {provider}")


# ── Public API ────────────────────────────────────────────────────────────────

def trigger_install(provider: str) -> dict:
    if provider not in INSTALL_STATUS:
        return {"ok": False, "message": "Invalid provider"}

    if INSTALL_STATUS[provider]["status"] == "installing":
        return {"ok": False, "message": "Already installing"}

    cmd_builders = {
        "OLLAMA":    _ollama_cmd,
        "LLAMA_CPP": _llamacpp_cmd,
        "VLLM":      _vllm_cmd,
    }

    cmd = cmd_builders[provider]()
    if not cmd:
        return {"ok": False, "message": f"No install command available for {provider} on {_get_os()}"}

    asyncio.create_task(run_command_stream_logs(provider, cmd))
    return {"ok": True, "status": "installing", "os": _get_os()}


def get_statuses() -> dict:
    """
    Auto-detect already-installed engines by checking executables / known paths.
    Only updates entries that are still 'idle' so we don't overwrite in-progress jobs.
    """
    os_name = _get_os()

    checks = {
        "OLLAMA": lambda: (
            _has("ollama")
            or (os_name == "macos" and os.path.exists("/Applications/Ollama.app"))
            or (os_name == "windows" and os.path.exists(
                os.path.expandvars(r"%LOCALAPPDATA%\Programs\Ollama\ollama.exe")
            ))
        ),
        "LLAMA_CPP": lambda: _has("llama-cli") or _has("llama"),
        "VLLM": lambda: bool(
            subprocess.run(
                ["python3", "-c", "import vllm"],
                capture_output=True
            ).returncode == 0
        ),
    }

    for provider, check_fn in checks.items():
        if INSTALL_STATUS[provider]["status"] == "idle":
            try:
                if check_fn():
                    INSTALL_STATUS[provider]["status"] = "installed"
                    INSTALL_STATUS[provider]["progress"] = 100
            except Exception:
                pass  # Never crash the status endpoint

    return INSTALL_STATUS

def trigger_model_pull(model_name: str) -> dict:
    """Pulls a model using ollama pull and streams the output."""
    provider_key = f"OLLAMA_MODEL_{model_name}"
    
    if provider_key not in INSTALL_STATUS:
        INSTALL_STATUS[provider_key] = {"status": "idle", "logs": [], "progress": 0}
        
    if INSTALL_STATUS[provider_key]["status"] == "installing":
        return {"ok": False, "message": f"Already pulling {model_name}"}
        
    cmd = []
    os_name = _get_os()
    if os_name == "windows":
        ollama_exe = os.path.expandvars(r"%LOCALAPPDATA%\Programs\Ollama\ollama.exe")
        if not os.path.exists(ollama_exe):
            ollama_exe = "ollama"
        cmd = ["powershell", "-NoProfile", "-Command", f"& '{ollama_exe}' pull {model_name}"]
    else:
        cmd = ["ollama", "pull", model_name]
        
    asyncio.create_task(run_command_stream_logs(provider_key, cmd))
    return {"ok": True, "status": "installing"}
