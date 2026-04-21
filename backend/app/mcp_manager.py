"""
Minimal MCP client manager using JSON-RPC 2.0 over stdio.
Compatible with Python 3.9+ (no SDK required).
"""
import asyncio
import json
import os
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

MCP_CONFIG_PATH = "mcp_config.json"

DEFAULT_CONFIG = {"mcpServers": {}}


# ── Config helpers ─────────────────────────────────────────────────────────────

def load_config() -> dict:
    if not os.path.exists(MCP_CONFIG_PATH):
        # Crea da esempio se disponibile, altrimenti usa default vuoto
        example = MCP_CONFIG_PATH.replace(".json", ".example.json")
        base = DEFAULT_CONFIG.copy()
        if os.path.exists(example):
            try:
                with open(example) as f:
                    base = json.load(f)
                # Disabilita tutti i server dell'esempio per sicurezza
                for srv in base.get("mcpServers", {}).values():
                    srv["enabled"] = False
            except Exception:
                base = DEFAULT_CONFIG.copy()
        save_config(base)
        return base
    with open(MCP_CONFIG_PATH) as f:
        return json.load(f)


def save_config(config: dict):
    with open(MCP_CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2)


# ── MCP stdio client ───────────────────────────────────────────────────────────

class MCPConnection:
    """Wraps a single MCP server subprocess and its JSON-RPC session."""

    def __init__(self, name: str, config: dict):
        self.name = name
        self.config = config
        self.process: Optional[asyncio.subprocess.Process] = None
        self.tools: List[dict] = []
        self.status: str = "disconnected"   # disconnected | connecting | connected | error
        self.error: Optional[str] = None
        self._req_id = 0
        self._lock = asyncio.Lock()

    # ── Internal JSON-RPC helpers ──────────────────────────────────────────────

    def _next_id(self) -> int:
        self._req_id += 1
        return self._req_id

    async def _send(self, method: str, params: dict = None, notification: bool = False) -> Optional[dict]:
        if not self.process or self.process.returncode is not None:
            raise RuntimeError("Process not running")

        msg: dict = {"jsonrpc": "2.0", "method": method}
        if not notification:
            msg["id"] = self._next_id()
        if params is not None:
            msg["params"] = params

        line = json.dumps(msg) + "\n"
        self.process.stdin.write(line.encode())
        await self.process.stdin.drain()

        if notification:
            return None

        # Read lines until we get the matching response
        while True:
            raw = await asyncio.wait_for(self.process.stdout.readline(), timeout=15)
            if not raw:
                raise RuntimeError("Server closed stdout")
            raw = raw.decode().strip()
            if not raw:
                continue
            try:
                resp = json.loads(raw)
            except json.JSONDecodeError:
                continue
            # Match by id; ignore server notifications
            if resp.get("id") == msg["id"]:
                if "error" in resp:
                    raise RuntimeError(resp["error"].get("message", str(resp["error"])))
                return resp.get("result")

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    async def connect(self):
        async with self._lock:
            self.status = "connecting"
            self.error = None
            try:
                env = {**os.environ, **self.config.get("env", {})}
                self.process = await asyncio.create_subprocess_exec(
                    self.config["command"],
                    *self.config.get("args", []),
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL,
                    env=env,
                )

                await self._send("initialize", {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "efesto", "version": "1.0"},
                })
                await self._send("notifications/initialized", notification=True)

                result = await self._send("tools/list", {})
                self.tools = result.get("tools", []) if result else []
                self.status = "connected"
            except Exception as e:
                self.status = "error"
                self.error = str(e)
                await self._kill()

    async def disconnect(self):
        async with self._lock:
            await self._kill()
            self.status = "disconnected"
            self.tools = []

    async def _kill(self):
        if self.process and self.process.returncode is None:
            try:
                self.process.terminate()
                await asyncio.wait_for(self.process.wait(), timeout=3)
            except Exception:
                try:
                    self.process.kill()
                except Exception:
                    pass
        self.process = None

    # ── Tool call ──────────────────────────────────────────────────────────────

    async def call_tool(self, tool_name: str, arguments: dict) -> str:
        result = await self._send("tools/call", {"name": tool_name, "arguments": arguments})
        if not result:
            return ""
        content = result.get("content", [])
        parts = []
        for item in content:
            if item.get("type") == "text":
                parts.append(item.get("text", ""))
        return "\n".join(parts) if parts else json.dumps(result)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "config": self.config,
            "status": self.status,
            "error": self.error,
            "tools": [{"name": t["name"], "description": t.get("description", "")} for t in self.tools],
        }


# ── MCPManager ─────────────────────────────────────────────────────────────────

class MCPManager:
    def __init__(self):
        self.connections: Dict[str, MCPConnection] = {}

    async def start_all(self):
        """Connect all enabled servers from config at startup."""
        config = load_config()
        for name, srv_cfg in config.get("mcpServers", {}).items():
            if srv_cfg.get("enabled", True):
                await self.start_server(name, srv_cfg)

    async def stop_all(self):
        for conn in list(self.connections.values()):
            await conn.disconnect()
        self.connections.clear()

    async def start_server(self, name: str, config: dict):
        if name in self.connections:
            await self.connections[name].disconnect()
        conn = MCPConnection(name, config)
        self.connections[name] = conn
        asyncio.ensure_future(conn.connect())

    async def stop_server(self, name: str):
        if name in self.connections:
            await self.connections[name].disconnect()
            del self.connections[name]

    async def restart_server(self, name: str):
        cfg = load_config()
        srv_cfg = cfg.get("mcpServers", {}).get(name)
        if not srv_cfg:
            raise ValueError(f"Server '{name}' not found in config")
        await self.start_server(name, srv_cfg)

    def get_all_tools_ollama(self) -> List[dict]:
        """Return all connected tools in Ollama function-calling format."""
        tools = []
        for name, conn in self.connections.items():
            if conn.status != "connected":
                continue
            for t in conn.tools:
                tools.append({
                    "type": "function",
                    "function": {
                        "name": f"mcp__{name}__{t['name']}",
                        "description": f"[MCP:{name}] {t.get('description', '')}",
                        "parameters": t.get("inputSchema", {"type": "object", "properties": {}}),
                    },
                })
        return tools

    async def call_tool(self, qualified_name: str, arguments: dict) -> str:
        """Call a tool by qualified name: mcp__<server>__<tool>."""
        parts = qualified_name.split("__", 2)
        if len(parts) != 3 or parts[0] != "mcp":
            raise ValueError(f"Invalid MCP tool name: {qualified_name}")
        _, server_name, tool_name = parts
        conn = self.connections.get(server_name)
        if not conn or conn.status != "connected":
            raise RuntimeError(f"MCP server '{server_name}' not connected")
        return await conn.call_tool(tool_name, arguments)

    def list_servers(self) -> List[dict]:
        config = load_config()
        servers = []
        for name, cfg in config.get("mcpServers", {}).items():
            conn = self.connections.get(name)
            servers.append({
                "name": name,
                "config": cfg,
                "status": conn.status if conn else "disconnected",
                "error": conn.error if conn else None,
                "tools": [{"name": t["name"], "description": t.get("description", "")} for t in (conn.tools if conn else [])],
            })
        return servers


# Global instance
mcp_manager = MCPManager()
