from .base import BaseTool
from typing import Any, Dict


class MemoryTool(BaseTool):
    @property
    def name(self) -> str:
        return "manage_memory"

    @property
    def description(self) -> str:
        return (
            "Gestisce la memoria persistente dell'utente. "
            "Usa 'save' per memorizzare un fatto importante sull'utente (preferenze, contesto, obiettivi). "
            "Usa 'delete' per rimuovere un ricordo obsoleto o errato specificando il suo id. "
            "Usa 'list' per vedere tutte le memorie salvate con i loro id."
        )

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        return {
            'type': 'object',
            'properties': {
                'action': {
                    'type': 'string',
                    'enum': ['save', 'delete', 'list'],
                    'description': "Azione da eseguire: 'save' per salvare, 'delete' per eliminare, 'list' per elencare."
                },
                'content': {
                    'type': 'string',
                    'description': "Il testo del ricordo da salvare (richiesto per action='save')."
                },
                'memory_id': {
                    'type': 'integer',
                    'description': "ID del ricordo da eliminare (richiesto per action='delete')."
                },
            },
            'required': ['action']
        }

    async def execute(self, action: str, content: str = None, memory_id: int = None) -> str:
        from sqlmodel import Session, select
        from ..models import MemoryEntry
        from ..main import engine
        from datetime import datetime, timezone

        if action == 'list':
            with Session(engine) as db:
                entries = db.exec(select(MemoryEntry).order_by(MemoryEntry.created_at)).all()
            if not entries:
                return "Nessuna memoria salvata."
            return "\n".join(f"[id:{e.id}] {e.content}" for e in entries)

        if action == 'save':
            if not content:
                return "Errore: 'content' è richiesto per salvare una memoria."
            with Session(engine) as db:
                entry = MemoryEntry(content=content)
                db.add(entry)
                db.commit()
                db.refresh(entry)
            return f"Memoria salvata (id:{entry.id}): {content}"

        if action == 'delete':
            if not memory_id:
                return "Errore: 'memory_id' è richiesto per eliminare una memoria."
            with Session(engine) as db:
                entry = db.get(MemoryEntry, memory_id)
                if not entry:
                    return f"Nessuna memoria trovata con id {memory_id}."
                db.delete(entry)
                db.commit()
            return f"Memoria {memory_id} eliminata."

        return "Azione non riconosciuta."
