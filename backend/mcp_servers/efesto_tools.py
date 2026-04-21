#!/usr/bin/env python3
"""
Simple MCP server for testing — JSON-RPC 2.0 over stdio.
Tools: get_time, calculator, echo
"""
import sys
import json
import math
from datetime import datetime

TOOLS = [
    {
        "name": "get_time",
        "description": "Restituisce la data e l'ora corrente del sistema.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "format": {
                    "type": "string",
                    "description": "Formato opzionale strftime, es. '%d/%m/%Y %H:%M'. Default: leggibile.",
                }
            },
            "required": [],
        },
    },
    {
        "name": "calculator",
        "description": "Calcola un'espressione matematica. Supporta +, -, *, /, **, sqrt, sin, cos, tan, log, pi, e.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "Espressione da calcolare, es. '2 ** 10' o 'sqrt(144)'.",
                }
            },
            "required": ["expression"],
        },
    },
    {
        "name": "echo",
        "description": "Restituisce il testo ricevuto, opzionalmente trasformato.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Testo da restituire."},
                "transform": {
                    "type": "string",
                    "enum": ["none", "upper", "lower", "reverse"],
                    "description": "Trasformazione da applicare.",
                },
            },
            "required": ["text"],
        },
    },
]


def handle_tool(name: str, args: dict) -> str:
    if name == "get_time":
        fmt = args.get("format", "%A %d %B %Y, %H:%M:%S")
        return datetime.now().strftime(fmt)

    elif name == "calculator":
        expr = args.get("expression", "")
        safe = {k: getattr(math, k) for k in dir(math) if not k.startswith("_")}
        safe["sqrt"] = math.sqrt
        safe["pi"] = math.pi
        safe["e"] = math.e
        try:
            result = eval(expr, {"__builtins__": {}}, safe)  # noqa: S307
            return str(result)
        except Exception as exc:
            return f"Errore: {exc}"

    elif name == "echo":
        text = args.get("text", "")
        t = args.get("transform", "none")
        if t == "upper":   return text.upper()
        if t == "lower":   return text.lower()
        if t == "reverse": return text[::-1]
        return text

    return f"Tool '{name}' non trovato."


def send(obj: dict):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def main():
    req_id = 0
    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            continue

        method = msg.get("method", "")
        msg_id = msg.get("id")
        params = msg.get("params", {})

        # Notifications (no id) — just acknowledge and continue
        if msg_id is None:
            continue

        if method == "initialize":
            send({
                "jsonrpc": "2.0", "id": msg_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "efesto-tools", "version": "1.0.0"},
                },
            })

        elif method == "tools/list":
            send({"jsonrpc": "2.0", "id": msg_id, "result": {"tools": TOOLS}})

        elif method == "tools/call":
            tool_name = params.get("name", "")
            arguments = params.get("arguments", {})
            output = handle_tool(tool_name, arguments)
            send({
                "jsonrpc": "2.0", "id": msg_id,
                "result": {"content": [{"type": "text", "text": output}]},
            })

        else:
            send({
                "jsonrpc": "2.0", "id": msg_id,
                "error": {"code": -32601, "message": f"Method not found: {method}"},
            })


if __name__ == "__main__":
    main()
