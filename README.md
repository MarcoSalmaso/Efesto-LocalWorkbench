# Efesto — Local AI Workbench

Efesto è un'applicazione **local-first** per interagire con modelli AI locali (via Ollama) dotata di RAG, tool calling, streaming delle risposte e un'interfaccia web moderna. Tutto gira sulla tua macchina, senza dipendenze da cloud esterni.

---

## Funzionalità

- **Chat con streaming** — risposte in tempo reale con supporto al _thinking_ (chain-of-thought) dei modelli che lo supportano
- **Tool calling** — il modello può invocare strumenti autonomamente durante la conversazione; le chiamate sono visibili in chat come tag
- **RAG locale** — carica documenti (PDF, DOCX, TXT, MD, CSV, JSON, HTML) nella Knowledge Base; vengono suddivisi in chunk, embeddati con un modello Ollama e cercati semanticamente via LanceDB
- **Knowledge Base** — gestione documenti con upload multi-formato, progress dell'embedding chunk-by-chunk, eliminazione per file e reset completo
- **Sessioni persistenti** — le conversazioni sono salvate in SQLite e ricaricabili dalla sidebar
- **Rendering Markdown + LaTeX** — le risposte supportano GFM, syntax highlighting e formule matematiche (KaTeX)
- **Impostazioni configurabili** — system prompt, lunghezza contesto, modello di embedding, max chunk length, embedding batch size, top-k retrieval

---

## Stack

| Layer | Tecnologie |
|---|---|
| Backend | Python 3.9+, FastAPI, SQLModel, Ollama SDK, LanceDB, PyArrow |
| Frontend | React 18, Vite, Tailwind CSS, Axios, react-markdown, KaTeX |
| Database | SQLite (chat e config), LanceDB (vettori embedding) |
| AI | Ollama (modelli locali), embedding con `ollama.embed()` batch API |

### Strumenti disponibili per il modello

| Tool | Descrizione |
|---|---|
| `search_knowledge` | Ricerca semantica nella Knowledge Base RAG |
| `read_file` | Legge file di testo dal filesystem locale |
| `execute_python` | Esegue codice Python in un subprocess isolato (timeout 10s) |

---

## Struttura del progetto

```
Efesto/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app, endpoints, chat streaming
│   │   ├── models.py        # Schema SQLite (SQLModel)
│   │   ├── rag.py           # RagManager: chunking, embedding, ricerca LanceDB
│   │   ├── extractors.py    # Estrazione testo da PDF, DOCX, CSV, JSON, HTML
│   │   └── tools/
│   │       ├── base.py      # Classe astratta BaseTool
│   │       ├── registry.py  # ToolRegistry globale
│   │       ├── rag_search.py
│   │       ├── file_reader.py
│   │       └── python_executor.py
│   ├── storage/vectors/     # Database vettoriale LanceDB (gitignored)
│   ├── efesto.db            # SQLite (gitignored)
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── App.jsx          # Componente React principale
    │   ├── main.jsx
    │   └── index.css
    ├── package.json
    └── tailwind.config.js
```

---

## Installazione

### Prerequisiti

Assicurati di avere installato:

- [Ollama](https://ollama.com) — runtime per i modelli locali
- **Python 3.9+** — `python3 --version`
- **Node.js 18+** — `node --version`

### 1. Clona il repository

```bash
git clone https://github.com/MarcoSalmaso/Efesto.git
cd Efesto
```

### 2. Scarica i modelli Ollama

Efesto ha bisogno di almeno un modello per la chat e uno per gli embedding:

```bash
ollama pull qwen3.5:9b          # modello chat con tool calling (consigliato)
ollama pull qwen3-embedding:4b  # modello di embedding per il RAG (default)
```

Puoi usare qualsiasi modello Ollama con supporto al tool calling (es. `llama3.1:8b`, `gemma4`). Il modello di embedding è configurabile dalle impostazioni.

### 3. Avvia il backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8006
```

Al primo avvio vengono creati automaticamente il database SQLite (`efesto.db`) e la cartella per i vettori LanceDB (`storage/vectors/`).

### 4. Avvia il frontend

In un secondo terminale:

```bash
cd frontend
npm install
npm run dev
```

Apri il browser su **`http://localhost:5173`**.

### Avvii successivi

Una volta completata l'installazione, per riavviare basta:

```bash
# Terminale 1 — backend
cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8006

# Terminale 2 — frontend
cd frontend && npm run dev
```

---

## Aggiungere un nuovo strumento

1. Crea un file in `backend/app/tools/`, estendi `BaseTool` e implementa `name`, `description`, `parameters_schema` e `execute()`
2. Registralo in `backend/app/tools/__init__.py` con `registry.register_tool(MyTool())`

Il tool sarà immediatamente visibile nella pagina **Strumenti** dell'interfaccia e disponibile al modello nelle chat.

---

*Efesto — Costruisci il tuo Olimpo Digitale.*

---

## Idee di sviluppo

- **Utilizzo di script python per analisi dati**: permettergli di utilizzare script che richiedono solamente un input per fare analisi o qualsiasi altra cosa.
- **MCP locali**: utilizzo di MCP locali.