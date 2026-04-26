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
    memory_injection_enabled: bool = Field(default=False)
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class KnowledgeChunk(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    filename: str = Field(index=True)
    chunk_index: int
    text: str = Field(sa_column=Column(Text))
    metadata_json: str = Field(default="{}", sa_column=Column(Text))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ChatSession(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = "Nuova Conversazione"
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

class Simulation(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(default="Nuova Simulazione")
    world_prompt: str = Field(default="", sa_column=Column(Text))
    trigger_event: str = Field(default="", sa_column=Column(Text))
    max_rounds: int = Field(default=3)
    model: Optional[str] = Field(default=None)  # None = usa modello globale
    status: str = Field(default="draft")  # draft | running | completed
    analysis: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    agents: List["SimulationAgent"] = Relationship(back_populates="simulation")
    turns: List["SimulationTurn"] = Relationship(back_populates="simulation")

class SimulationAgent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    simulation_id: int = Field(foreign_key="simulation.id")
    name: str
    role: str = Field(default="")
    system_prompt: str = Field(default="", sa_column=Column(Text))
    model: Optional[str] = Field(default=None)
    order: int = Field(default=0)
    simulation: Simulation = Relationship(back_populates="agents")

class SimulationTurn(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    simulation_id: int = Field(foreign_key="simulation.id")
    round_number: int
    agent_id: int
    agent_name: str
    content: str = Field(default="", sa_column=Column(Text))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    simulation: Simulation = Relationship(back_populates="turns")
