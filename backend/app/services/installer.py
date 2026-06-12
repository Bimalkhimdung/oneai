import asyncio
import logging
import os
import shutil

logger = logging.getLogger("app.installer")

# In-memory status and log storage
INSTALL_STATUS = {
    "OLLAMA": {"status": "idle", "logs": [], "progress": 0},
    "LLAMA_CPP": {"status": "idle", "logs": [], "progress": 0},
    "VLLM": {"status": "idle", "logs": [], "progress": 0},
}

async def run_command_stream_logs(provider: str, cmd_list: list[str]):
    INSTALL_STATUS[provider]["status"] = "installing"
    INSTALL_STATUS[provider]["logs"] = []
    INSTALL_STATUS[provider]["progress"] = 10
    
    cmd_str = " ".join(cmd_list)
    logger.info(f"Starting installation command for {provider}: {cmd_str}")
    INSTALL_STATUS[provider]["logs"].append(f"Running: {cmd_str}\n")
    
    try:
        # Start subprocess
        process = await asyncio.create_subprocess_shell(
            cmd_str,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        async def read_stream(stream, is_stderr=False):
            while True:
                line = await stream.readline()
                if not line:
                    break
                line_str = line.decode("utf-8", errors="ignore")
                prefix = "[ERR] " if is_stderr else ""
                INSTALL_STATUS[provider]["logs"].append(f"{prefix}{line_str}")
                # Log to system console as well
                logger.debug(f"[{provider}] {prefix}{line_str.strip()}")

        # Run stdout and stderr reading concurrently
        await asyncio.gather(
            read_stream(process.stdout, is_stderr=False),
            read_stream(process.stderr, is_stderr=True)
        )
        
        returncode = await process.wait()
        if returncode == 0:
            INSTALL_STATUS[provider]["status"] = "completed"
            INSTALL_STATUS[provider]["progress"] = 100
            INSTALL_STATUS[provider]["logs"].append("\nInstallation completed successfully!\n")
            logger.info(f"Installation of {provider} completed successfully.")
        else:
            INSTALL_STATUS[provider]["status"] = "failed"
            INSTALL_STATUS[provider]["logs"].append(f"\nInstallation failed with exit code {returncode}.\n")
            logger.error(f"Installation of {provider} failed with code {returncode}.")
            
    except Exception as e:
        INSTALL_STATUS[provider]["status"] = "failed"
        INSTALL_STATUS[provider]["logs"].append(f"\nError occurred: {str(e)}\n")
        logger.exception(f"Exception raised during installation of {provider}")

def trigger_install(provider: str):
    if INSTALL_STATUS[provider]["status"] == "installing":
        return {"ok": False, "message": "Already installing"}
        
    cmd = []
    if provider == "OLLAMA":
        # Check if Ollama app exists, if brew is present use brew cask, else download directly
        has_brew = shutil.which("brew") is not None
        if has_brew:
            cmd = ["brew", "install", "--cask", "ollama"]
        else:
            # Direct download zip, extract to /Applications, then start it
            cmd = [
                "echo 'Downloading Ollama for macOS...'",
                "&& curl -L https://ollama.com/download/Ollama-darwin.zip -o /tmp/Ollama.zip",
                "&& echo 'Extracting to /Applications...'",
                "&& unzip -o /tmp/Ollama.zip -d /Applications",
                "&& echo 'Cleaning up...'",
                "&& rm /tmp/Ollama.zip",
                "&& echo 'Ollama installed successfully under /Applications!'"
            ]
            
    elif provider == "LLAMA_CPP":
        has_brew = shutil.which("brew") is not None
        if has_brew:
            cmd = ["brew", "install", "llama.cpp"]
        else:
            cmd = [
                "echo 'Cloning llama.cpp...'",
                "&& git clone https://github.com/ggerganov/llama.cpp.git /tmp/llama.cpp",
                "&& cd /tmp/llama.cpp",
                "&& echo 'Compiling llama.cpp with Metal support...'",
                "&& make",
                "&& echo 'Copying binaries to /usr/local/bin (requires sudo) or local home...'",
                "&& mkdir -p ~/bin",
                "&& cp llama-cli ~/bin/",
                "&& echo 'Binary copied to ~/bin/llama-cli'"
            ]
            
    elif provider == "VLLM":
        # Install vLLM in virtual environment
        cmd = [
            "echo 'Installing vLLM using pip...'",
            "&& pip3 install vllm"
        ]
    else:
        return {"ok": False, "message": "Invalid provider"}
        
    # Start the task in background
    asyncio.create_task(run_command_stream_logs(provider, cmd))
    return {"ok": True, "status": "installing"}

def get_statuses():
    # Proactively check if they are already installed on user's path to show "installed" status initially
    for p in ["OLLAMA", "LLAMA_CPP"]:
        if INSTALL_STATUS[p]["status"] == "idle":
            # Check executable availability
            exec_name = "ollama" if p == "OLLAMA" else "llama-cli"
            if shutil.which(exec_name) is not None or (p == "OLLAMA" and os.path.exists("/Applications/Ollama.app")):
                INSTALL_STATUS[p]["status"] = "installed"
                INSTALL_STATUS[p]["progress"] = 100
                
    return INSTALL_STATUS
