from fastapi import FastAPI, Depends, HTTPException, File, UploadFile, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlmodel import SQLModel, Session, create_engine, select
from sqlalchemy import text
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import ollama
import json
import asyncio
import threading
import uuid
import numpy as np
from datetime import datetime, timezone
from .models import ChatSession, ChatMessage, SystemSettings, KnowledgeChunk, Workflow, Agent, Prompt, Simulation, SimulationAgent, SimulationTurn, MemoryEntry
from .mcp_manager import mcp_manager, load_config, save_config

sqlite_file_name = "efesto.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"

engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})

def migrate_db():
    """Aggiunge colonne mancanti senza perdere dati esistenti."""
    migrations = [
        ("rag_embedding_model",    "TEXT NOT NULL DEFAULT 'qwen3-embedding:4b'"),
        ("rag_chunk_size",         "INTEGER NOT NULL DEFAULT 800"),
        ("rag_batch_size",         "INTEGER NOT NULL DEFAULT 8"),
        ("rag_search_limit",       "INTEGER NOT NULL DEFAULT 3"),
        ("active_embedding_model", "TEXT NOT NULL DEFAULT ''"),
        ("gen_temperature",         "REAL NOT NULL DEFAULT 0.8"),
        ("gen_top_p",               "REAL NOT NULL DEFAULT 0.9"),
        ("gen_num_predict",         "INTEGER NOT NULL DEFAULT -1"),
        ("default_model",           "TEXT NOT NULL DEFAULT ''"),
    ]
    with engine.connect() as conn:
        for col, definition in migrations:
            try:
                conn.execute(text(f"ALTER TABLE systemsettings ADD COLUMN {col} {definition}"))
                conn.commit()
            except Exception:
                pass  # Colonna già presente
        # Per installazioni esistenti: evita falsi warning sincronizzando active = rag
        try:
            conn.execute(text(
                "UPDATE systemsettings SET active_embedding_model = rag_embedding_model "
                "WHERE active_embedding_model = ''"
            ))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE agent ADD COLUMN color TEXT NOT NULL DEFAULT 'orange'"))
            conn.commit()
        except Exception:
            pass
        for col in ["agent_name TEXT", "agent_color TEXT"]:
            try:
                conn.execute(text(f"ALTER TABLE chatmessage ADD COLUMN {col}"))
                conn.commit()
            except Exception:
                pass
        try:
            conn.execute(text("ALTER TABLE systemsettings ADD COLUMN memory_injection_enabled INTEGER NOT NULL DEFAULT 0"))
            conn.commit()
        except Exception:
            pass

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)
    migrate_db()
    with Session(engine) as session:
        settings = session.exec(select(SystemSettings)).first()
        if not settings:
            session.add(SystemSettings())
            session.commit()

def get_session():
    with Session(engine) as session:
        yield session

app = FastAPI(title="Efesto API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def apply_rag_config(settings: SystemSettings):
    from .rag import rag_manager
    rag_manager.configure(
        embedding_model=settings.rag_embedding_model,
        chunk_size=settings.rag_chunk_size,
        batch_size=settings.rag_batch_size,
        search_limit=settings.rag_search_limit,
    )

@app.on_event("startup")
async def on_startup():
    create_db_and_tables()
    with Session(engine) as session:
        settings = session.exec(select(SystemSettings)).first()
        if settings:
            apply_rag_config(settings)
    await mcp_manager.start_all()


@app.on_event("shutdown")
async def on_shutdown():
    await mcp_manager.stop_all()

# --- Modelli ---
@app.get("/ollama/list")
def list_local_models():
    try:
        response = ollama.list()
        if hasattr(response, 'models'):
            return {"models": [m.model for m in response.models]}
        elif isinstance(response, dict):
            return {"models": [m['name'] for m in response.get('models', [])]}
        return {"models": []}
    except:
        return {"models": []}

@app.get("/ollama/ps")
def list_running_models():
    try:
        response = ollama.ps()
        if hasattr(response, 'models'):
            return {"models": [m.model for m in response.models]}
        elif isinstance(response, dict):
            return {"models": [m.get('name', m.get('model', '')) for m in response.get('models', [])]}
        return {"models": []}
    except:
        return {"models": []}

@app.get("/ollama/ps/stream")
async def stream_running_models():
    async def generate():
        last = None
        while True:
            try:
                response = ollama.ps()
                if hasattr(response, 'models'):
                    models = [m.model for m in response.models]
                elif isinstance(response, dict):
                    models = [m.get('name', m.get('model', '')) for m in response.get('models', [])]
                else:
                    models = []
            except:
                models = []
            if models != last:
                last = models
                yield f"data: {json.dumps({'models': models})}\n\n"
            await asyncio.sleep(2)
    return StreamingResponse(generate(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    })

# --- Sessioni ---
@app.get("/sessions/search")
def search_sessions(q: str, session: Session = Depends(get_session)):
    if not q.strip():
        return []
    from sqlalchemy import func, or_
    pattern = f"%{q.lower()}%"
    matching = session.exec(
        select(ChatSession)
        .where(or_(
            func.lower(ChatSession.title).like(pattern),
            ChatSession.id.in_(
                select(ChatMessage.session_id).where(
                    func.lower(ChatMessage.content).like(pattern),
                    ChatMessage.role.in_(["user", "assistant"]),
                )
            )
        ))
        .order_by(ChatSession.created_at.desc())
    ).all()

    results = []
    for s in matching:
        match_in = "title" if q.lower() in (s.title or "").lower() else "message"
        snippet = None
        if match_in == "message":
            msg = session.exec(
                select(ChatMessage).where(
                    ChatMessage.session_id == s.id,
                    func.lower(ChatMessage.content).like(pattern),
                    ChatMessage.role.in_(["user", "assistant"]),
                ).order_by(ChatMessage.created_at).limit(1)
            ).first()
            if msg:
                content = msg.content
                idx = content.lower().find(q.lower())
                start = max(0, idx - 35)
                end = min(len(content), idx + len(q) + 60)
                snippet = ("…" if start > 0 else "") + content[start:end] + ("…" if end < len(content) else "")
        results.append({
            "id": s.id, "title": s.title,
            "created_at": s.created_at.isoformat(),
            "match_in": match_in, "snippet": snippet,
        })
    return results

@app.get("/sessions/", response_model=List[ChatSession])
def read_sessions(session: Session = Depends(get_session)):
    return session.exec(select(ChatSession).order_by(ChatSession.created_at.desc())).all()

@app.get("/sessions/{session_id}/messages", response_model=List[ChatMessage])
def read_session_messages(session_id: int, session: Session = Depends(get_session)):
    return session.exec(select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at)).all()

@app.patch("/sessions/{session_id}")
def rename_session(session_id: int, data: dict, session: Session = Depends(get_session)):
    s = session.get(ChatSession, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Sessione non trovata")
    s.title = data.get("title", s.title).strip() or s.title
    session.commit()
    session.refresh(s)
    return s

@app.post("/sessions/", response_model=ChatSession)
def create_session(session_data: ChatSession, session: Session = Depends(get_session)):
    db_session = ChatSession(title=session_data.title)
    session.add(db_session)
    session.commit()
    session.refresh(db_session)
    return db_session

# --- Impostazioni ---
@app.get("/settings", response_model=SystemSettings)
def get_settings(session: Session = Depends(get_session)):
    return session.exec(select(SystemSettings)).first()

@app.post("/settings", response_model=SystemSettings)
def update_settings(new_settings: SystemSettings, session: Session = Depends(get_session)):
    db_settings = session.exec(select(SystemSettings)).first()
    if not db_settings:
        db_settings = SystemSettings()
        session.add(db_settings)
    db_settings.user_name = new_settings.user_name
    db_settings.system_prompt = new_settings.system_prompt
    db_settings.context_length = new_settings.context_length
    db_settings.rag_embedding_model = new_settings.rag_embedding_model
    db_settings.rag_chunk_size = new_settings.rag_chunk_size
    db_settings.rag_batch_size = new_settings.rag_batch_size
    db_settings.rag_search_limit = new_settings.rag_search_limit
    db_settings.gen_temperature = new_settings.gen_temperature
    db_settings.gen_top_p = new_settings.gen_top_p
    db_settings.gen_num_predict = new_settings.gen_num_predict
    db_settings.default_model = new_settings.default_model
    db_settings.memory_injection_enabled = new_settings.memory_injection_enabled
    db_settings.last_updated = datetime.now(timezone.utc)
    session.add(db_settings)
    session.commit()
    session.refresh(db_settings)
    apply_rag_config(db_settings)
    return db_settings

# --- Memoria persistente ---

class MemoryPayload(BaseModel):
    content: str

@app.get("/memory/")
def list_memories(session: Session = Depends(get_session)):
    return session.exec(select(MemoryEntry).order_by(MemoryEntry.created_at)).all()

@app.post("/memory/")
def create_memory(payload: MemoryPayload, session: Session = Depends(get_session)):
    entry = MemoryEntry(content=payload.content)
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry

@app.patch("/memory/{memory_id}")
def update_memory(memory_id: int, payload: MemoryPayload, session: Session = Depends(get_session)):
    entry = session.get(MemoryEntry, memory_id)
    if not entry:
        raise HTTPException(404, "Memoria non trovata")
    entry.content = payload.content
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry

@app.delete("/memory/{memory_id}")
def delete_memory(memory_id: int, session: Session = Depends(get_session)):
    entry = session.get(MemoryEntry, memory_id)
    if not entry:
        raise HTTPException(404, "Memoria non trovata")
    session.delete(entry)
    session.commit()
    return {"ok": True}

# --- Knowledge Base (RAG) ---
from .rag import rag_manager

class IndexRequest(BaseModel):
    text: str
    metadata: Optional[Dict[str, Any]] = None

@app.post("/knowledge/index")
async def index_knowledge(request: IndexRequest):
    try:
        rag_manager.add_document(request.text, request.metadata)
        return {"status": "success", "message": "Documento indicizzato correttamente."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/knowledge/upload")
async def upload_knowledge(file: UploadFile = File(...)):
    from .extractors import extract_text, SUPPORTED_EXTENSIONS, _ext
    if _ext(file.filename) not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Formato non supportato. Usa: {', '.join(sorted(SUPPORTED_EXTENSIONS))}")
    content = await file.read()
    try:
        text = extract_text(content, file.filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Errore nell'estrazione del testo: {e}")
    if not text.strip():
        raise HTTPException(status_code=400, detail="Il file non contiene testo estraibile.")

    filename = file.filename
    chunks = rag_manager._chunk_text(text, chunk_size=rag_manager.chunk_size)
    total = len(chunks)

    async def event_stream():
        loop = asyncio.get_event_loop()
        batch_size = rag_manager.batch_size
        try:
            # Salva i chunk testuali in SQLite (fonte di verità)
            with Session(engine) as db:
                for existing in db.exec(select(KnowledgeChunk).where(KnowledgeChunk.filename == filename)).all():
                    db.delete(existing)
                db.commit()
                for idx, chunk in enumerate(chunks):
                    db.add(KnowledgeChunk(
                        filename=filename,
                        chunk_index=idx,
                        text=chunk,
                        metadata_json=json.dumps({"filename": filename, "source": "upload",
                                                   "chunk": idx, "total_chunks": total}),
                    ))
                db.commit()

            done = 0
            for batch_start in range(0, total, batch_size):
                batch = chunks[batch_start:batch_start + batch_size]
                embeddings = await loop.run_in_executor(None, rag_manager._get_embeddings_batch, batch)

                if batch_start == 0:
                    dim = len(embeddings[0])
                    rag_manager.ensure_table_with_dim(dim)

                table = rag_manager.db.open_table("knowledge")
                rows = []
                for i, (chunk, embedding) in enumerate(zip(batch, embeddings)):
                    meta = {"filename": filename, "source": "upload",
                            "chunk": batch_start + i, "total_chunks": total}
                    rows.append({
                        "vector": np.array(embedding, dtype=np.float32),
                        "text": chunk,
                        "metadata": json.dumps(meta),
                    })
                table.add(rows)
                done += len(batch)
                yield f"data: {json.dumps({'current': done, 'total': total})}\n\n"

            with Session(engine) as db:
                settings = db.exec(select(SystemSettings)).first()
                if settings:
                    settings.active_embedding_model = rag_manager.embedding_model
                    db.add(settings)
                    db.commit()

            yield f"data: {json.dumps({'status': 'success', 'filename': filename, 'total': total})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'detail': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")

@app.get("/knowledge/list")
async def list_knowledge():
    try:
        return rag_manager.list_documents()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/knowledge/{filename}")
async def delete_knowledge(filename: str):
    try:
        rag_manager.delete_by_filename(filename)
        with Session(engine) as db:
            for c in db.exec(select(KnowledgeChunk).where(KnowledgeChunk.filename == filename)).all():
                db.delete(c)
            db.commit()
        return {"status": "success", "filename": filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/knowledge")
async def reset_knowledge():
    try:
        rag_manager.reset_table()
        with Session(engine) as db:
            for c in db.exec(select(KnowledgeChunk)).all():
                db.delete(c)
            db.commit()
        return {"status": "success", "message": "Knowledge Base svuotata."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/knowledge/search")
async def search_knowledge(query: str, limit: int = 5):
    try:
        results = rag_manager.search(query, limit=limit)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/knowledge/reembed")
async def reembed_knowledge():
    """Rigenera tutti i vettori LanceDB dai chunk salvati in SQLite."""
    async def event_stream():
        loop = asyncio.get_event_loop()
        try:
            with Session(engine) as db:
                chunks = db.exec(
                    select(KnowledgeChunk).order_by(KnowledgeChunk.filename, KnowledgeChunk.chunk_index)
                ).all()

            total = len(chunks)
            if total == 0:
                yield f"data: {json.dumps({'status': 'error', 'detail': 'Nessun chunk salvato. Ricarica i documenti prima di rigenerare i vettori.'})}\n\n"
                return

            rag_manager.reset_table()
            batch_size = rag_manager.batch_size
            done = 0

            for batch_start in range(0, total, batch_size):
                batch = chunks[batch_start:batch_start + batch_size]
                embeddings = await loop.run_in_executor(
                    None, rag_manager._get_embeddings_batch, [c.text for c in batch]
                )
                if batch_start == 0:
                    rag_manager.ensure_table_with_dim(len(embeddings[0]))
                table = rag_manager.db.open_table("knowledge")
                table.add([{
                    "vector": np.array(emb, dtype=np.float32),
                    "text": c.text,
                    "metadata": c.metadata_json,
                } for c, emb in zip(batch, embeddings)])
                done += len(batch)
                yield f"data: {json.dumps({'current': done, 'total': total})}\n\n"

            with Session(engine) as db:
                settings = db.exec(select(SystemSettings)).first()
                if settings:
                    settings.active_embedding_model = rag_manager.embedding_model
                    db.add(settings)
                    db.commit()

            yield f"data: {json.dumps({'status': 'success', 'total': total})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'detail': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")

@app.get("/knowledge/export")
async def export_knowledge():
    """Esporta tutti i chunk testuali come JSON (backup portabile)."""
    with Session(engine) as db:
        chunks = db.exec(
            select(KnowledgeChunk).order_by(KnowledgeChunk.filename, KnowledgeChunk.chunk_index)
        ).all()
        settings = db.exec(select(SystemSettings)).first()

    export_data = {
        "version": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "embedding_model": settings.rag_embedding_model if settings else "",
        "chunks": [
            {"filename": c.filename, "chunk_index": c.chunk_index,
             "text": c.text, "metadata_json": c.metadata_json}
            for c in chunks
        ],
    }
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return Response(
        content=json.dumps(export_data, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="efesto_kb_{timestamp}.json"'},
    )

@app.post("/knowledge/import")
async def import_knowledge(file: UploadFile = File(...)):
    """Importa un backup JSON, salva i chunk in SQLite e rigenera i vettori."""
    content = await file.read()
    try:
        data = json.loads(content)
    except Exception:
        raise HTTPException(status_code=400, detail="File non valido. Deve essere un JSON esportato da Efesto.")
    if "chunks" not in data:
        raise HTTPException(status_code=400, detail="Formato non valido: campo 'chunks' mancante.")

    chunks_data = data["chunks"]

    async def event_stream():
        loop = asyncio.get_event_loop()
        try:
            with Session(engine) as db:
                for c in db.exec(select(KnowledgeChunk)).all():
                    db.delete(c)
                db.commit()
                for item in chunks_data:
                    db.add(KnowledgeChunk(
                        filename=item["filename"],
                        chunk_index=item["chunk_index"],
                        text=item["text"],
                        metadata_json=item.get("metadata_json", "{}"),
                    ))
                db.commit()

            total = len(chunks_data)
            yield f"data: {json.dumps({'phase': 'saved', 'total': total})}\n\n"

            rag_manager.reset_table()
            with Session(engine) as db:
                chunks = db.exec(
                    select(KnowledgeChunk).order_by(KnowledgeChunk.filename, KnowledgeChunk.chunk_index)
                ).all()

            batch_size = rag_manager.batch_size
            done = 0
            for batch_start in range(0, total, batch_size):
                batch = chunks[batch_start:batch_start + batch_size]
                embeddings = await loop.run_in_executor(
                    None, rag_manager._get_embeddings_batch, [c.text for c in batch]
                )
                if batch_start == 0:
                    rag_manager.ensure_table_with_dim(len(embeddings[0]))
                table = rag_manager.db.open_table("knowledge")
                table.add([{
                    "vector": np.array(emb, dtype=np.float32),
                    "text": c.text,
                    "metadata": c.metadata_json,
                } for c, emb in zip(batch, embeddings)])
                done += len(batch)
                yield f"data: {json.dumps({'phase': 'embedding', 'current': done, 'total': total})}\n\n"

            with Session(engine) as db:
                settings = db.exec(select(SystemSettings)).first()
                if settings:
                    settings.active_embedding_model = rag_manager.embedding_model
                    db.add(settings)
                    db.commit()

            yield f"data: {json.dumps({'status': 'success', 'total': total})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'detail': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")

# --- Tools ---
from .tools import registry

@app.get("/tools")
def list_tools():
    return [
        {
            "name": tool.name,
            "description": tool.description,
            "parameters": tool.parameters_schema,
        }
        for tool in registry.list_tools().values()
    ]

# --- Chat ---

class ChatRequest(BaseModel):
    model: str
    message: str
    session_id: Optional[int] = None
    agent_id: Optional[int] = None
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    num_predict: Optional[int] = None
    images: Optional[List[str]] = None        # base64, per modelli vision
    file_context: Optional[str] = None        # testo estratto da file allegati

@app.post("/chat/extract")
async def extract_chat_file(file: UploadFile = File(...)):
    from .extractors import extract_text, SUPPORTED_EXTENSIONS, _ext
    ext = _ext(file.filename)
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(400, f"Formato non supportato. Usa: {', '.join(sorted(SUPPORTED_EXTENSIONS))}")
    content = await file.read()
    try:
        text = extract_text(content, file.filename)
    except Exception as e:
        raise HTTPException(400, f"Errore nell'estrazione: {e}")
    if not text.strip():
        raise HTTPException(400, "Il file non contiene testo estraibile.")
    return {"filename": file.filename, "text": text}

@app.post("/chat")
async def chat_with_tools(request: ChatRequest, db: Session = Depends(get_session)):
    settings = db.exec(select(SystemSettings)).first() or SystemSettings()
    
    if not request.session_id:
        db_session = ChatSession(title=request.message[:30] + "...")
        db.add(db_session)
        db.commit()
        db.refresh(db_session)
        session_id = db_session.id
    else:
        session_id = request.session_id

    history = db.exec(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(settings.context_length)
    ).all()
    history.reverse()

    user_msg = ChatMessage(session_id=session_id, role="user", content=request.message)
    db.add(user_msg)
    db.commit()

    async def generate():
        loop = asyncio.get_event_loop()
        cancel_ev = threading.Event()
        full_content = ""
        full_thinking = ""
        msg_agent_name = None
        msg_agent_color = None

        def _ollama_to_queue(q: asyncio.Queue, **chat_kwargs):
            """Esegue ollama.chat (sincrono) in un thread daemon e mette i chunk nella queue."""
            def _worker():
                try:
                    for chunk in ollama.chat(**chat_kwargs):
                        if cancel_ev.is_set():
                            break
                        loop.call_soon_threadsafe(q.put_nowait, ("chunk", chunk))
                except Exception as exc:
                    loop.call_soon_threadsafe(q.put_nowait, ("error", exc))
                finally:
                    loop.call_soon_threadsafe(q.put_nowait, ("done", None))
            threading.Thread(target=_worker, daemon=True).start()

        async def stream_ollama(**chat_kwargs):
            q: asyncio.Queue = asyncio.Queue()
            _ollama_to_queue(q, **chat_kwargs)
            while True:
                kind, val = await q.get()
                if kind == "done":
                    return
                if kind == "error":
                    raise val
                yield val

        try:
            # Risolvi agente (se presente)
            agent = None
            if request.agent_id:
                with Session(engine) as adb:
                    agent = adb.get(Agent, request.agent_id)

            system_prompt = (agent.system_prompt if agent and agent.system_prompt else settings.system_prompt)
            active_model  = agent.model if agent and agent.model else request.model
            msg_agent_name  = agent.name  if agent else None
            msg_agent_color = agent.color if agent else None

            # Iniezione memorie persistenti
            if settings.memory_injection_enabled:
                memories = db.exec(select(MemoryEntry).order_by(MemoryEntry.created_at)).all()
                if memories:
                    memory_block = "## Memorie sull'utente\n" + "\n".join(f"- {m.content}" for m in memories)
                    system_prompt = f"{system_prompt}\n\n{memory_block}"

            ollama_messages = [{'role': 'system', 'content': system_prompt}]
            for m in history:
                msg_dict = {'role': m.role, 'content': m.content}
                if m.tool_calls:
                    msg_dict['tool_calls'] = [
                        {'function': tc['function']}
                        for tc in m.tool_calls
                    ]
                ollama_messages.append(msg_dict)

            user_content = request.message
            if request.file_context:
                user_content = f"{request.file_context}\n\n---\n{request.message}"
            user_msg_dict: Dict[str, Any] = {'role': 'user', 'content': user_content}
            if request.images:
                user_msg_dict['images'] = request.images
            ollama_messages.append(user_msg_dict)

            tool_calls_raw = []
            first_thinking = True
            first_content = True

            # Parametri generazione: request > agent > globale
            temperature = request.temperature or (agent.temperature if agent else None) or settings.gen_temperature
            top_p       = request.top_p       or (agent.top_p       if agent else None) or settings.gen_top_p
            num_predict = request.num_predict or settings.gen_num_predict
            gen_options = {k: v for k, v in {
                "temperature": temperature,
                "top_p": top_p,
                "num_predict": num_predict,
            }.items() if v is not None}

            # Filtra tool in base all'agente
            all_native = registry.get_ollama_format()
            all_mcp    = mcp_manager.get_all_tools_ollama()
            if agent and agent.tools_enabled != "*":
                try:
                    enabled = json.loads(agent.tools_enabled)
                    all_native = [t for t in all_native if t['function']['name'] in enabled]
                    all_mcp    = [t for t in all_mcp    if t['function']['name'] in enabled]
                except Exception:
                    pass
            all_tools = all_native + all_mcp

            async for chunk in stream_ollama(
                model=active_model,
                messages=ollama_messages,
                stream=True,
                **({"tools": all_tools} if all_tools else {}),
                **({"options": gen_options} if gen_options else {}),
            ):
                msg = chunk.message
                if msg.tool_calls:
                    tool_calls_raw.extend(msg.tool_calls)
                content = msg.content or ''
                thinking = getattr(msg, 'thinking', None) or ''

                if thinking and first_thinking:
                    first_thinking = False
                    yield json.dumps({"step": "thinking"}) + "\n"
                if content and first_content:
                    first_content = False
                    yield json.dumps({"step": "generating"}) + "\n"

                if content: full_content += content
                if thinking: full_thinking += thinking
                if content or thinking:
                    yield json.dumps({"content": content, "thinking": thinking, "session_id": session_id}) + "\n"

            if tool_calls_raw:
                tool_calls_for_stream = [
                    {"function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                    for tc in tool_calls_raw
                ]
                yield json.dumps({"tool_calls": tool_calls_for_stream, "step": "tool_call"}) + "\n"

                # Formato per DB (con id tracciabile)
                tool_calls_for_db = [
                    {
                        'id': f"call_{uuid.uuid4().hex[:8]}",
                        'function': {'name': tc.function.name, 'arguments': tc.function.arguments},
                    }
                    for tc in tool_calls_raw
                ]
                # Formato nativo Ollama per i messaggi (solo function, senza id/type)
                tool_calls_for_ollama = [
                    {'function': {'name': tc.function.name, 'arguments': tc.function.arguments}}
                    for tc in tool_calls_raw
                ]

                with Session(engine) as save_db:
                    save_db.add(ChatMessage(
                        session_id=session_id,
                        role="assistant",
                        content=full_content,
                        thinking=full_thinking or None,
                        tool_calls=tool_calls_for_db,
                        agent_name=msg_agent_name,
                        agent_color=msg_agent_color,
                    ))
                    save_db.commit()

                ollama_messages.append({
                    'role': 'assistant',
                    'content': full_content,
                    'tool_calls': tool_calls_for_ollama,
                })

                for tc_db, tc_ollama in zip(tool_calls_for_db, tool_calls_for_ollama):
                    tool_name = tc_ollama['function']['name']
                    yield json.dumps({"step": "tool_executing", "tool": tool_name}) + "\n"
                    tool_output = None
                    if tool_name.startswith("mcp__"):
                        try:
                            tool_output = await mcp_manager.call_tool(tool_name, tc_ollama['function']['arguments'])
                        except Exception as e:
                            tool_output = f"[MCP Error] {e}"
                    else:
                        tool = registry.get_tool(tool_name)
                        if tool:
                            tool_output = await tool.execute(**tc_ollama['function']['arguments'])
                    if tool_output is not None:
                        with Session(engine) as save_db:
                            save_db.add(ChatMessage(
                                session_id=session_id,
                                role="tool",
                                content=str(tool_output),
                                tool_call_id=tc_db['id'],
                            ))
                            save_db.commit()
                        yield json.dumps({"step": "tool_result", "tool": tool_name}) + "\n"
                        ollama_messages.append({'role': 'tool', 'content': str(tool_output)})

                # Messaggio sintetico per ancorare il modello alla domanda originale.
                # Necessario per modelli con thinking (Qwen3, Gemma4) che tendono
                # a ignorare i risultati tool e rispondere al system prompt.
                ollama_messages.append({
                    'role': 'user',
                    'content': f'Usa i risultati degli strumenti per rispondere alla domanda: {request.message}',
                })

                # Seconda chiamata: reset content e thinking
                full_content = ""
                full_thinking = ""
                first_thinking = True

                yield json.dumps({"step": "generating"}) + "\n"

                async for chunk in stream_ollama(
                    model=active_model,
                    messages=ollama_messages,
                    stream=True,
                    **({"options": gen_options} if gen_options else {}),
                ):
                    msg = chunk.message
                    content = msg.content or ''
                    thinking = getattr(msg, 'thinking', None) or ''
                    if thinking and first_thinking:
                        first_thinking = False
                        yield json.dumps({"step": "thinking"}) + "\n"
                    if content: full_content += content
                    if thinking: full_thinking += thinking
                    if content or thinking:
                        yield json.dumps({"content": content, "thinking": thinking, "session_id": session_id}) + "\n"

            with Session(engine) as save_db:
                save_db.add(ChatMessage(
                    session_id=session_id,
                    role="assistant",
                    content=full_content,
                    thinking=full_thinking or None,
                    agent_name=msg_agent_name,
                    agent_color=msg_agent_color,
                ))
                save_db.commit()

            yield json.dumps({"step": "done"}) + "\n"

        except (GeneratorExit, asyncio.CancelledError):
            # Il client ha chiuso la connessione: ferma il thread ollama e salva il parziale
            cancel_ev.set()
            if full_content:
                with Session(engine) as save_db:
                    save_db.add(ChatMessage(
                        session_id=session_id,
                        role="assistant",
                        content=full_content,
                        thinking=full_thinking or None,
                        agent_name=msg_agent_name,
                        agent_color=msg_agent_color,
                    ))
                    save_db.commit()

        except Exception as e:
            yield json.dumps({"error": str(e)}) + "\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ── Workflow ────────────────────────────────────────────────────────────────

@app.get("/workflows/")
def list_workflows(session: Session = Depends(get_session)):
    return session.exec(select(Workflow).order_by(Workflow.updated_at.desc())).all()

@app.post("/workflows/")
def create_workflow(session: Session = Depends(get_session)):
    wf = Workflow()
    session.add(wf); session.commit(); session.refresh(wf)
    return wf

@app.get("/workflows/{wf_id}")
def get_workflow(wf_id: int, session: Session = Depends(get_session)):
    wf = session.get(Workflow, wf_id)
    if not wf: raise HTTPException(404, "Workflow non trovato")
    return wf

@app.patch("/workflows/{wf_id}")
def update_workflow(wf_id: int, data: dict, session: Session = Depends(get_session)):
    wf = session.get(Workflow, wf_id)
    if not wf: raise HTTPException(404, "Workflow non trovato")
    if "name" in data: wf.name = data["name"].strip() or wf.name
    if "definition" in data: wf.definition = json.dumps(data["definition"])
    wf.updated_at = datetime.now(timezone.utc)
    session.commit(); session.refresh(wf)
    return wf

@app.delete("/workflows/{wf_id}")
def delete_workflow(wf_id: int, session: Session = Depends(get_session)):
    wf = session.get(Workflow, wf_id)
    if not wf: raise HTTPException(404, "Workflow non trovato")
    session.delete(wf); session.commit()
    return {"ok": True}

# ── Execution engine ─────────────────────────────────────────────────────────

def _topo_sort(nodes: list, edges: list) -> list:
    """Ordine topologico del DAG (Kahn's algorithm)."""
    ids = {n["id"] for n in nodes}
    in_edges = {n["id"]: [] for n in nodes}
    out_edges = {n["id"]: [] for n in nodes}
    for e in edges:
        if e["source"] in ids and e["target"] in ids:
            in_edges[e["target"]].append(e["source"])
            out_edges[e["source"]].append(e["target"])
    queue = [n["id"] for n in nodes if not in_edges[n["id"]]]
    order = []
    while queue:
        nid = queue.pop(0)
        order.append(nid)
        for child in out_edges[nid]:
            in_edges[child].remove(nid)
            if not in_edges[child]:
                queue.append(child)
    return order

def _resolve(text: str, outputs: dict, quote: bool = False) -> str:
    """Sostituisce {{node_id.field}} con i valori reali. Supporta .output e i campi del form."""
    import re
    def replace(m):
        node_id, field = m.group(1), m.group(2)
        node_out = outputs.get(node_id, {})
        if field == "output":
            val = str(node_out.get("output", ""))
        else:
            val = str(node_out.get("fields", {}).get(field, ""))
        return json.dumps(val) if quote else val
    return re.sub(r"\{\{(\w+)\.([\w]+)\}\}", replace, text)

def _should_skip(nid: str, edges: list, outputs: dict) -> bool:
    """Ritorna True se il nodo è su un branch condition non attivato."""
    incoming = [e for e in edges if e.get("target") == nid]
    if not incoming:
        return False
    for edge in incoming:
        src = edge.get("source")
        src_out = outputs.get(src, {})
        if src_out.get("skipped"):
            continue
        src_handle = edge.get("sourceHandle")
        if src_handle in ("true", "false"):
            cond_bool = src_out.get("condition_bool")
            if cond_bool is not None and cond_bool != (src_handle == "true"):
                continue
        return False
    return True

@app.post("/workflows/{wf_id}/run")
async def run_workflow(wf_id: int, body: dict, session: Session = Depends(get_session)):
    wf = session.get(Workflow, wf_id)
    if not wf: raise HTTPException(404, "Workflow non trovato")

    definition = json.loads(wf.definition)
    nodes = definition.get("nodes", [])
    edges = definition.get("edges", [])
    user_input = body.get("input", "")
    input_fields = body.get("input_fields", {})
    model = body.get("model", "")
    settings = session.exec(select(SystemSettings)).first()

    node_map = {n["id"]: n for n in nodes}
    order = _topo_sort(nodes, edges)

    async def generate():
        outputs: dict = {}
        for nid in order:
            node = node_map.get(nid)
            if not node: continue
            ntype = node.get("type", "")
            data  = node.get("data", {})

            # Le note non vengono eseguite
            if ntype == "note":
                continue

            # Salta i nodi sui branch condition non attivati
            if _should_skip(nid, edges, outputs):
                outputs[nid] = {"output": "", "skipped": True}
                yield json.dumps({"event": "node_skipped", "node_id": nid}) + "\n"
                continue

            yield json.dumps({"event": "node_start", "node_id": nid}) + "\n"

            try:
                if ntype == "input":
                    node_input_fields = input_fields.get(nid)
                    if node_input_fields and data.get("fields"):
                        result = json.dumps(node_input_fields, ensure_ascii=False)
                        outputs[nid] = {"output": result, "fields": node_input_fields}
                        yield json.dumps({"event": "node_done", "node_id": nid, "output": result}) + "\n"
                        continue
                    result = user_input

                elif ntype == "ai_prompt":
                    prompt = _resolve(data.get("prompt", ""), outputs)
                    system = data.get("system", "") or (settings.system_prompt if settings else "")
                    schema_str = data.get("schema", "").strip() if data.get("structured") else ""
                    fmt = None
                    if data.get("structured"):
                        if schema_str:
                            try:
                                fmt = json.loads(schema_str)
                            except Exception:
                                fmt = "json"
                        else:
                            fmt = "json"
                    full = ""
                    chat_kwargs = dict(
                        model=data.get("model") or model or "",
                        messages=[{"role": "system", "content": system},
                                  {"role": "user",   "content": prompt}],
                        stream=True,
                    )
                    if fmt is not None:
                        chat_kwargs["format"] = fmt
                    for chunk in ollama.chat(**chat_kwargs):
                        token = chunk.message.content or ""
                        full += token
                        if token:
                            yield json.dumps({"event": "node_token", "node_id": nid, "token": token}) + "\n"
                    result = full

                elif ntype == "python":
                    code_template = data.get("code", "")
                    code = _resolve(code_template, outputs, quote=True)
                    injections = "\n".join(
                        f'__{k} = {json.dumps(v.get("output",""))}' for k, v in outputs.items()
                    )
                    final_code = injections + "\n" + code if injections else code
                    from .tools.python_executor import PythonExecutorTool
                    result = await PythonExecutorTool().execute(final_code)

                elif ntype == "output":
                    result = _resolve(data.get("template", "{{" + (edges[-1]["source"] if edges else "") + ".output}}"), outputs)

                elif ntype == "condition":
                    import re as _re
                    condition_expr = _resolve(data.get("condition", "False"), outputs)
                    # Ricava l'output del predecessore diretto
                    incoming = [e for e in edges if e.get("target") == nid]
                    prev_output = ""
                    if incoming:
                        prev_output = str(outputs.get(incoming[0].get("source"), {}).get("output", ""))
                    safe_globals = {"__builtins__": {}}
                    safe_locals = {
                        "output": prev_output,
                        "len": len, "str": str, "int": int, "float": float,
                        "bool": bool, "any": any, "all": all, "abs": abs,
                        "re": _re,
                    }
                    condition_bool = bool(eval(condition_expr, safe_globals, safe_locals))
                    result = "true" if condition_bool else "false"
                    outputs[nid] = {"output": result, "condition_bool": condition_bool}
                    yield json.dumps({"event": "node_done", "node_id": nid, "output": result}) + "\n"
                    continue

                elif ntype == "rag_search":
                    from .rag import rag_manager
                    query = _resolve(data.get("query", ""), outputs)
                    limit = int(data.get("limit") or 3)
                    results = rag_manager.search(query, limit=limit)
                    if results:
                        parts = []
                        for r in results:
                            meta = r.get("metadata", {})
                            fname = meta.get("filename", "documento") if isinstance(meta, dict) else "documento"
                            parts.append(f"[{fname}]\n{r.get('text', '')}")
                        result = "\n\n---\n\n".join(parts)
                    else:
                        result = "Nessun risultato trovato nella knowledge base."

                else:
                    result = ""

                outputs[nid] = {"output": result}
                yield json.dumps({"event": "node_done", "node_id": nid, "output": result}) + "\n"

            except Exception as e:
                outputs[nid] = {"output": "", "error": str(e)}
                yield json.dumps({"event": "node_error", "node_id": nid, "error": str(e)}) + "\n"

        yield json.dumps({"event": "workflow_done", "outputs": outputs}) + "\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ── MCP ───────────────────────────────────────────────────────────────────────

class McpServerPayload(BaseModel):
    name: str
    command: str
    args: List[str] = []
    env: Dict[str, str] = {}
    enabled: bool = True


@app.get("/mcp/servers")
def list_mcp_servers():
    return mcp_manager.list_servers()


@app.post("/mcp/servers")
async def add_mcp_server(payload: McpServerPayload):
    config = load_config()
    servers = config.setdefault("mcpServers", {})
    if payload.name in servers:
        raise HTTPException(400, f"Server '{payload.name}' già esistente")
    srv_cfg = {
        "command": payload.command,
        "args": payload.args,
        "env": payload.env,
        "enabled": payload.enabled,
    }
    servers[payload.name] = srv_cfg
    save_config(config)
    if payload.enabled:
        await mcp_manager.start_server(payload.name, srv_cfg)
    return {"ok": True}


@app.patch("/mcp/servers/{name}")
async def update_mcp_server(name: str, payload: dict):
    config = load_config()
    servers = config.get("mcpServers", {})
    if name not in servers:
        raise HTTPException(404, f"Server '{name}' non trovato")
    srv = servers[name]
    for key in ("command", "args", "env", "enabled"):
        if key in payload:
            srv[key] = payload[key]
    save_config(config)
    if srv.get("enabled", True):
        await mcp_manager.start_server(name, srv)
    else:
        await mcp_manager.stop_server(name)
    return {"ok": True}


@app.delete("/mcp/servers/{name}")
async def delete_mcp_server(name: str):
    config = load_config()
    servers = config.get("mcpServers", {})
    if name not in servers:
        raise HTTPException(404, f"Server '{name}' non trovato")
    del servers[name]
    save_config(config)
    await mcp_manager.stop_server(name)
    return {"ok": True}


@app.post("/mcp/servers/{name}/restart")
async def restart_mcp_server(name: str):
    try:
        await mcp_manager.restart_server(name)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(404, str(e))


# ── Agents ────────────────────────────────────────────────────────────────────

class AgentPayload(BaseModel):
    name: str
    description: str = ""
    model: Optional[str] = None
    system_prompt: str = ""
    tools_enabled: str = "*"
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    color: str = "orange"


@app.get("/agents/")
def list_agents(session: Session = Depends(get_session)):
    return session.exec(select(Agent).order_by(Agent.created_at)).all()


@app.post("/agents/")
def create_agent(payload: AgentPayload, session: Session = Depends(get_session)):
    agent = Agent(**payload.dict())
    session.add(agent)
    session.commit()
    session.refresh(agent)
    return agent


@app.get("/agents/{agent_id}")
def get_agent(agent_id: int, session: Session = Depends(get_session)):
    agent = session.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agente non trovato")
    return agent


@app.patch("/agents/{agent_id}")
def update_agent(agent_id: int, payload: dict, session: Session = Depends(get_session)):
    agent = session.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agente non trovato")
    for key, val in payload.items():
        if hasattr(agent, key):
            setattr(agent, key, val)
    agent.updated_at = datetime.now(timezone.utc)
    session.add(agent)
    session.commit()
    session.refresh(agent)
    return agent


@app.delete("/agents/{agent_id}")
def delete_agent(agent_id: int, session: Session = Depends(get_session)):
    agent = session.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agente non trovato")
    session.delete(agent)
    session.commit()
    return {"ok": True}


# ── Prompt Library ─────────────────────────────────────────────────────────────

class PromptPayload(BaseModel):
    title: str
    content: str
    tags: str = ""

@app.get("/prompts/")
def list_prompts(session: Session = Depends(get_session)):
    return session.exec(select(Prompt).order_by(Prompt.created_at.desc())).all()

@app.post("/prompts/")
def create_prompt(payload: PromptPayload, session: Session = Depends(get_session)):
    prompt = Prompt(**payload.dict())
    session.add(prompt)
    session.commit()
    session.refresh(prompt)
    return prompt

@app.patch("/prompts/{prompt_id}")
def update_prompt(prompt_id: int, payload: dict, session: Session = Depends(get_session)):
    prompt = session.get(Prompt, prompt_id)
    if not prompt:
        raise HTTPException(404, "Prompt non trovato")
    for key, val in payload.items():
        if hasattr(prompt, key):
            setattr(prompt, key, val)
    prompt.updated_at = datetime.now(timezone.utc)
    session.add(prompt)
    session.commit()
    session.refresh(prompt)
    return prompt

@app.delete("/prompts/{prompt_id}")
def delete_prompt(prompt_id: int, session: Session = Depends(get_session)):
    prompt = session.get(Prompt, prompt_id)
    if not prompt:
        raise HTTPException(404, "Prompt non trovato")
    session.delete(prompt)
    session.commit()
    return {"ok": True}

# ── Simulazioni ──────────────────────────────────────────────────────────────

class SimulationCreate(BaseModel):
    name: str = "Nuova Simulazione"
    world_prompt: str = ""
    trigger_event: str = ""
    max_rounds: int = 3
    model: Optional[str] = None

class SimulationUpdate(BaseModel):
    name: Optional[str] = None
    world_prompt: Optional[str] = None
    trigger_event: Optional[str] = None
    max_rounds: Optional[int] = None
    model: Optional[str] = None
    status: Optional[str] = None
    analysis: Optional[str] = None

class SimAgentCreate(BaseModel):
    name: str
    role: str = ""
    system_prompt: str = ""
    model: Optional[str] = None
    order: int = 0

class SimAgentUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    system_prompt: Optional[str] = None
    model: Optional[str] = None
    order: Optional[int] = None

@app.get("/simulations/")
def list_simulations(session: Session = Depends(get_session)):
    sims = session.exec(select(Simulation).order_by(Simulation.created_at.desc())).all()
    result = []
    for s in sims:
        agents = session.exec(select(SimulationAgent).where(SimulationAgent.simulation_id == s.id)).all()
        d = s.dict()
        d["agent_count"] = len(agents)
        result.append(d)
    return result

@app.post("/simulations/")
def create_simulation(payload: SimulationCreate, session: Session = Depends(get_session)):
    sim = Simulation(**payload.dict())
    session.add(sim)
    session.commit()
    session.refresh(sim)
    return sim

@app.get("/simulations/{sim_id}")
def get_simulation(sim_id: int, session: Session = Depends(get_session)):
    sim = session.get(Simulation, sim_id)
    if not sim:
        raise HTTPException(404, "Simulazione non trovata")
    return sim

@app.patch("/simulations/{sim_id}")
def update_simulation(sim_id: int, payload: SimulationUpdate, session: Session = Depends(get_session)):
    sim = session.get(Simulation, sim_id)
    if not sim:
        raise HTTPException(404, "Simulazione non trovata")
    for k, v in payload.dict(exclude_none=True).items():
        setattr(sim, k, v)
    sim.updated_at = datetime.now(timezone.utc)
    session.add(sim)
    session.commit()
    session.refresh(sim)
    return sim

@app.delete("/simulations/{sim_id}")
def delete_simulation(sim_id: int, session: Session = Depends(get_session)):
    sim = session.get(Simulation, sim_id)
    if not sim:
        raise HTTPException(404, "Simulazione non trovata")
    for turn in session.exec(select(SimulationTurn).where(SimulationTurn.simulation_id == sim_id)).all():
        session.delete(turn)
    for agent in session.exec(select(SimulationAgent).where(SimulationAgent.simulation_id == sim_id)).all():
        session.delete(agent)
    session.delete(sim)
    session.commit()
    return {"ok": True}

@app.post("/simulations/{sim_id}/duplicate")
def duplicate_simulation(sim_id: int, session: Session = Depends(get_session)):
    sim = session.get(Simulation, sim_id)
    if not sim:
        raise HTTPException(404, "Simulazione non trovata")
    new_sim = Simulation(
        name=f"{sim.name} (copia)",
        world_prompt=sim.world_prompt,
        trigger_event=sim.trigger_event,
        max_rounds=sim.max_rounds,
        model=sim.model,
    )
    session.add(new_sim)
    session.commit()
    session.refresh(new_sim)
    agents = session.exec(select(SimulationAgent).where(SimulationAgent.simulation_id == sim_id).order_by(SimulationAgent.order)).all()
    for a in agents:
        session.add(SimulationAgent(
            simulation_id=new_sim.id,
            name=a.name, role=a.role,
            system_prompt=a.system_prompt,
            model=a.model, order=a.order,
        ))
    session.commit()
    return new_sim

# — Agenti della simulazione —

@app.get("/simulations/{sim_id}/agents")
def list_sim_agents(sim_id: int, session: Session = Depends(get_session)):
    return session.exec(
        select(SimulationAgent)
        .where(SimulationAgent.simulation_id == sim_id)
        .order_by(SimulationAgent.order)
    ).all()

@app.post("/simulations/{sim_id}/agents")
def create_sim_agent(sim_id: int, payload: SimAgentCreate, session: Session = Depends(get_session)):
    if not session.get(Simulation, sim_id):
        raise HTTPException(404, "Simulazione non trovata")
    agent = SimulationAgent(simulation_id=sim_id, **payload.dict())
    session.add(agent)
    session.commit()
    session.refresh(agent)
    return agent

@app.patch("/simulations/{sim_id}/agents/{agent_id}")
def update_sim_agent(sim_id: int, agent_id: int, payload: SimAgentUpdate, session: Session = Depends(get_session)):
    agent = session.get(SimulationAgent, agent_id)
    if not agent or agent.simulation_id != sim_id:
        raise HTTPException(404, "Agente non trovato")
    for k, v in payload.dict(exclude_none=True).items():
        setattr(agent, k, v)
    session.add(agent)
    session.commit()
    session.refresh(agent)
    return agent

@app.delete("/simulations/{sim_id}/agents/{agent_id}")
def delete_sim_agent(sim_id: int, agent_id: int, session: Session = Depends(get_session)):
    agent = session.get(SimulationAgent, agent_id)
    if not agent or agent.simulation_id != sim_id:
        raise HTTPException(404, "Agente non trovato")
    session.delete(agent)
    session.commit()
    return {"ok": True}

@app.put("/simulations/{sim_id}/agents/reorder")
def reorder_sim_agents(sim_id: int, agent_ids: List[int], session: Session = Depends(get_session)):
    for i, aid in enumerate(agent_ids):
        agent = session.get(SimulationAgent, aid)
        if agent and agent.simulation_id == sim_id:
            agent.order = i
            session.add(agent)
    session.commit()
    return {"ok": True}

# — Turni —

@app.get("/simulations/{sim_id}/turns")
def list_sim_turns(sim_id: int, session: Session = Depends(get_session)):
    return session.exec(
        select(SimulationTurn)
        .where(SimulationTurn.simulation_id == sim_id)
        .order_by(SimulationTurn.round_number, SimulationTurn.id)
    ).all()

# — Esecuzione simulazione (SSE streaming) —

async def _run_simulation(sim_id: int):
    with Session(engine) as session:
        sim = session.get(Simulation, sim_id)
        if not sim:
            yield f"data: {json.dumps({'type':'error','message':'Simulazione non trovata'})}\n\n"
            return

        agents = session.exec(
            select(SimulationAgent)
            .where(SimulationAgent.simulation_id == sim_id)
            .order_by(SimulationAgent.order)
        ).all()

        if not agents:
            yield f"data: {json.dumps({'type':'error','message':'Nessun agente configurato'})}\n\n"
            return

        # Pulisci turni precedenti
        for t in session.exec(select(SimulationTurn).where(SimulationTurn.simulation_id == sim_id)).all():
            session.delete(t)
        sim.status = "running"
        sim.analysis = None
        session.commit()

        yield f"data: {json.dumps({'type':'start','total_rounds':sim.max_rounds,'agents':[{'id':a.id,'name':a.name,'role':a.role} for a in agents]})}\n\n"

        history: list[dict] = []
        default_model = sim.model or "llama3.2:3b"

        try:
            for round_num in range(1, sim.max_rounds + 1):
                yield f"data: {json.dumps({'type':'round_start','round':round_num})}\n\n"

                for agent in agents:
                    yield f"data: {json.dumps({'type':'agent_start','agent_id':agent.id,'agent_name':agent.name,'role':agent.role,'round':round_num})}\n\n"

                    history_text = ""
                    if history:
                        history_text = "\n\n--- Storico turni precedenti ---\n"
                        cur_round = 0
                        for h in history:
                            if h["round"] != cur_round:
                                cur_round = h["round"]
                                history_text += f"\n[Round {cur_round}]\n"
                            history_text += f"{h['agent_name']} ({h['role']}): {h['content']}\n"

                    user_msg = (
                        f"CONTESTO DEL MONDO:\n{sim.world_prompt}\n\n"
                        f"EVENTO SCATENANTE:\n{sim.trigger_event}\n"
                        f"{history_text}\n"
                        f"Round {round_num}: Qual è la tua reazione? Cosa fai, dici o decidi?"
                    )

                    model = agent.model or default_model
                    full_content = ""

                    stream = await asyncio.to_thread(
                        lambda m=model, sp=agent.system_prompt, um=user_msg: ollama.chat(
                            model=m,
                            messages=[
                                {"role": "system", "content": sp},
                                {"role": "user", "content": um},
                            ],
                            stream=True,
                        )
                    )

                    async for chunk in _iter_ollama_stream(stream):
                        token = chunk.message.content or ""
                        full_content += token
                        yield f"data: {json.dumps({'type':'token','content':token})}\n\n"

                    turn = SimulationTurn(
                        simulation_id=sim_id,
                        round_number=round_num,
                        agent_id=agent.id,
                        agent_name=agent.name,
                        content=full_content,
                    )
                    with Session(engine) as s2:
                        s2.add(turn)
                        s2.commit()

                    history.append({"round": round_num, "agent_id": agent.id, "agent_name": agent.name, "role": agent.role, "content": full_content})
                    yield f"data: {json.dumps({'type':'agent_end','agent_id':agent.id,'agent_name':agent.name,'round':round_num})}\n\n"

                yield f"data: {json.dumps({'type':'round_end','round':round_num})}\n\n"

            with Session(engine) as s2:
                s2_sim = s2.get(Simulation, sim_id)
                s2_sim.status = "completed"
                s2_sim.updated_at = datetime.now(timezone.utc)
                s2.add(s2_sim)
                s2.commit()

            yield f"data: {json.dumps({'type':'complete','simulation_id':sim_id})}\n\n"

        except Exception as e:
            with Session(engine) as s2:
                s2_sim = s2.get(Simulation, sim_id)
                if s2_sim:
                    s2_sim.status = "draft"
                    s2.add(s2_sim)
                    s2.commit()
            yield f"data: {json.dumps({'type':'error','message':str(e)})}\n\n"

async def _iter_ollama_stream(stream):
    for chunk in stream:
        yield chunk

@app.post("/simulations/{sim_id}/run")
async def run_simulation(sim_id: int, session: Session = Depends(get_session)):
    sim = session.get(Simulation, sim_id)
    if not sim:
        raise HTTPException(404, "Simulazione non trovata")
    if sim.status == "running":
        raise HTTPException(400, "Simulazione già in corso")
    return StreamingResponse(
        _run_simulation(sim_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

# — Analisi simulazione (SSE streaming) —

async def _analyze_simulation(sim_id: int, model: Optional[str]):
    with Session(engine) as session:
        sim = session.get(Simulation, sim_id)
        if not sim:
            yield f"data: {json.dumps({'type':'error','message':'Simulazione non trovata'})}\n\n"
            return
        turns = session.exec(
            select(SimulationTurn)
            .where(SimulationTurn.simulation_id == sim_id)
            .order_by(SimulationTurn.round_number, SimulationTurn.id)
        ).all()
        agents = {a.id: a for a in session.exec(select(SimulationAgent).where(SimulationAgent.simulation_id == sim_id)).all()}

    transcript = ""
    cur_round = 0
    for t in turns:
        if t.round_number != cur_round:
            cur_round = t.round_number
            transcript += f"\n[Round {cur_round}]\n"
        role = agents[t.agent_id].role if t.agent_id in agents else ""
        transcript += f"{t.agent_name} ({role}): {t.content}\n"

    user_msg = (
        f"CONTESTO DEL MONDO:\n{sim.world_prompt}\n\n"
        f"EVENTO SCATENANTE:\n{sim.trigger_event}\n\n"
        f"TRASCRIZIONE COMPLETA:\n{transcript}\n\n"
        "Fornisci un'analisi strutturata della simulazione con:\n"
        "1. Dinamiche emerse\n2. Posizioni chiave degli agenti\n"
        "3. Punti di svolta\n4. Implicazioni strategiche\n5. Fattori critici"
    )

    chosen_model = model or sim.model or "llama3.2:3b"
    yield f"data: {json.dumps({'type':'start'})}\n\n"
    full = ""

    try:
        stream = await asyncio.to_thread(
            lambda: ollama.chat(
                model=chosen_model,
                messages=[
                    {"role": "system", "content": "Sei un analista esperto di dinamiche organizzative e comportamento collettivo. Analizza simulazioni multi-agente con rigore analitico."},
                    {"role": "user", "content": user_msg},
                ],
                stream=True,
            )
        )
        async for chunk in _iter_ollama_stream(stream):
            token = chunk.message.content or ""
            full += token
            yield f"data: {json.dumps({'type':'token','content':token})}\n\n"

        with Session(engine) as s2:
            s2_sim = s2.get(Simulation, sim_id)
            s2_sim.analysis = full
            s2_sim.updated_at = datetime.now(timezone.utc)
            s2.add(s2_sim)
            s2.commit()

        yield f"data: {json.dumps({'type':'complete','content':full})}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'type':'error','message':str(e)})}\n\n"

@app.post("/simulations/{sim_id}/analyze")
async def analyze_simulation(sim_id: int, model: Optional[str] = None, session: Session = Depends(get_session)):
    sim = session.get(Simulation, sim_id)
    if not sim:
        raise HTTPException(404, "Simulazione non trovata")
    return StreamingResponse(
        _analyze_simulation(sim_id, model),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
