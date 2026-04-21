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
import uuid
import numpy as np
from datetime import datetime, timezone
from .models import ModelConfig, ToolDefinition, ChatSession, ChatMessage, SystemSettings, KnowledgeChunk, Workflow

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
def on_startup():
    create_db_and_tables()
    with Session(engine) as session:
        settings = session.exec(select(SystemSettings)).first()
        if settings:
            apply_rag_config(settings)

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
    db_settings.last_updated = datetime.now(timezone.utc)
    session.add(db_settings)
    session.commit()
    session.refresh(db_settings)
    apply_rag_config(db_settings)
    return db_settings

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
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    num_predict: Optional[int] = None

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
        try:
            ollama_messages = [{'role': 'system', 'content': settings.system_prompt}]
            for m in history:
                msg_dict = {'role': m.role, 'content': m.content}
                if m.tool_calls:
                    # Ricostruisce nel formato nativo Ollama (solo function)
                    msg_dict['tool_calls'] = [
                        {'function': tc['function']}
                        for tc in m.tool_calls
                    ]
                ollama_messages.append(msg_dict)
            ollama_messages.append({'role': 'user', 'content': request.message})

            full_content = ""
            full_thinking = ""
            tool_calls_raw = []
            first_thinking = True
            first_content = True

            gen_options = {k: v for k, v in {
                "temperature": request.temperature,
                "top_p": request.top_p,
                "num_predict": request.num_predict,
            }.items() if v is not None}

            for chunk in ollama.chat(
                model=request.model,
                messages=ollama_messages,
                tools=registry.get_ollama_format(),
                stream=True,
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
                    tool = registry.get_tool(tool_name)
                    if tool:
                        tool_output = await tool.execute(**tc_ollama['function']['arguments'])
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

                for chunk in ollama.chat(
                    model=request.model,
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
                ))
                save_db.commit()

            yield json.dumps({"step": "done"}) + "\n"

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
