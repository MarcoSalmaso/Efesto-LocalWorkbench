from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, JSON, Text
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone

class SystemSettings(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_name: str = Field(default="Utente")
    system_prompt: str = Field(default="Sei Efesto, un assistente AI utile e conciso.", sa_column=Column(Text))
    context_length: int = Field(default=10)
    rag_embedding_model: str = Field(default="qwen3-embedding:4b")
    active_embedding_model: str = Field(default="")
    rag_chunk_size: int = Field(default=800)
    rag_batch_size: int = Field(default=8)
    rag_search_limit: int = Field(default=3)
    gen_temperature: float = Field(default=0.8)
    gen_top_p: float = Field(default=0.9)
    gen_num_predict: int = Field(default=-1)
    default_model: str = Field(default="")
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class KnowledgeChunk(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    filename: str = Field(index=True)
    chunk_index: int
    text: str = Field(sa_column=Column(Text))
    metadata_json: str = Field(default="{}", sa_column=Column(Text))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ModelConfig(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    provider: str = "ollama"
    is_active: bool = True
    parameters: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ToolDefinition(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    description: str
    enabled: bool = True
    tool_type: str = "local" # local, mcp
    config: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))

class ChatSession(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = "Nuova Conversazione"
    model_id: Optional[int] = Field(default=None, foreign_key="modelconfig.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    messages: List["ChatMessage"] = Relationship(back_populates="session")

class ChatMessage(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="chatsession.id")
    role: str # user, assistant, system, tool
    content: str = Field(default="", sa_column=Column(Text))
    thinking: Optional[str] = Field(default=None, sa_column=Column(Text))
    # Per i messaggi di tipo 'assistant' che chiamano dei tool
    tool_calls: Optional[List[Dict[str, Any]]] = Field(default=None, sa_column=Column(JSON))
    # Per i messaggi di tipo 'tool' che contengono il risultato
    tool_call_id: Optional[str] = None
    # Snapshot dell'agente al momento dell'invio (null = Efesto globale)
    agent_name: Optional[str] = Field(default=None)
    agent_color: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    session: ChatSession = Relationship(back_populates="messages")

class Workflow(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(default="Nuovo Workflow")
    definition: str = Field(default="{}", sa_column=Column(Text))  # JSON: {nodes, edges}
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Agent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: str = Field(default="", sa_column=Column(Text))
    model: Optional[str] = Field(default=None)          # None = usa modello globale
    system_prompt: str = Field(default="", sa_column=Column(Text))
    tools_enabled: str = Field(default="*", sa_column=Column(Text))  # "*" = tutti, oppure JSON list
    temperature: Optional[float] = Field(default=None)  # None = usa globale
    top_p: Optional[float] = Field(default=None)
    color: str = Field(default="orange")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Prompt(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    content: str = Field(sa_column=Column(Text))
    tags: str = Field(default="", sa_column=Column(Text))  # comma-separated
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MemoryEntry(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    content: str = Field(sa_column=Column(Text))
    metadata_info: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
