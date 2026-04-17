from fastapi import FastAPI, Depends, HTTPException, File, UploadFile
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
from .models import ModelConfig, ToolDefinition, ChatSession, ChatMessage, SystemSettings

sqlite_file_name = "efesto.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"

engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})

def migrate_db():
    """Aggiunge colonne mancanti senza perdere dati esistenti."""
    migrations = [
        ("rag_embedding_model", "TEXT NOT NULL DEFAULT 'qwen3-embedding:4b'"),
        ("rag_chunk_size",      "INTEGER NOT NULL DEFAULT 800"),
        ("rag_batch_size",      "INTEGER NOT NULL DEFAULT 8"),
        ("rag_search_limit",    "INTEGER NOT NULL DEFAULT 3"),
    ]
    with engine.connect() as conn:
        for col, definition in migrations:
            try:
                conn.execute(text(f"ALTER TABLE systemsettings ADD COLUMN {col} {definition}"))
                conn.commit()
            except Exception:
                pass  # Colonna già presente

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

# --- Sessioni ---
@app.get("/sessions/", response_model=List[ChatSession])
def read_sessions(session: Session = Depends(get_session)):
    return session.exec(select(ChatSession).order_by(ChatSession.created_at.desc())).all()

@app.get("/sessions/{session_id}/messages", response_model=List[ChatMessage])
def read_session_messages(session_id: int, session: Session = Depends(get_session)):
    return session.exec(select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at)).all()

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
            done = 0
            for batch_start in range(0, total, batch_size):
                batch = chunks[batch_start:batch_start + batch_size]
                embeddings = await loop.run_in_executor(None, rag_manager._get_embeddings_batch, batch)

                if batch_start == 0:
                    # Detect actual embedding dim and validate/create table
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
        return {"status": "success", "filename": filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/knowledge")
async def reset_knowledge():
    try:
        rag_manager.reset_table()
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

            for chunk in ollama.chat(
                model=request.model,
                messages=ollama_messages,
                tools=registry.get_ollama_format(),
                stream=True,
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
