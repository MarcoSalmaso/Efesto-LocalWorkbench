# Efesto — Local AI Workbench

Efesto è un'applicazione **local-first** per interagire con modelli AI locali (via Ollama). Chat con streaming, RAG, tool calling, workflow visivi a blocchi e integrazione MCP — tutto gira sulla tua macchina, senza dipendenze da cloud esterni.

---

## Funzionalità

### Chat
- **Streaming in tempo reale** — risposte token per token con supporto al _thinking_ (chain-of-thought) per modelli come Qwen3 e Gemma4
- **Velocità token/s** — contatore in tempo reale nella sidebar
- **Stop generazione** — interrompi il modello in qualsiasi momento
- **Sidebar processo** — visualizzazione grafica dei passi del modello: ragionamento, tool call, esecuzione, risposta
- **Artifacts** — blocchi HTML/SVG renderizzati in un iframe interattivo con tab Anteprima/Codice e apertura in nuova scheda
- **Rendering Markdown + LaTeX** — GFM, syntax highlighting e formule matematiche (KaTeX)
- **Sessioni persistenti** — conversazioni salvate in SQLite, ricaricabili dalla sidebar
- **Ricerca nelle sessioni** — cerca per titolo e contenuto dei messaggi
- **Rinomina sessioni** — inline, direttamente dalla sidebar
- **Parametri di generazione** — temperature, top-p e max token configurabili per sessione

### Modelli
- **Selettore modello** — dropdown personalizzato con tutti i modelli Ollama disponibili
- **Modelli in memoria** — indicatore in tempo reale dei modelli attivi (via SSE)

### Tool Calling
I modelli compatibili possono invocare autonomamente gli strumenti durante la conversazione:

| Tool | Descrizione |
|---|---|
| `search_knowledge` | Ricerca semantica nella Knowledge Base RAG |
| `read_file` | Legge file di testo dal filesystem locale |
| `execute_python` | Esegue codice Python in un subprocess isolato (timeout 10s) |

### MCP (Model Context Protocol)
- **Server MCP locali** — connetti qualsiasi server MCP tramite trasporto stdio (processi locali Python, Node.js, ecc.)
- **Gestione visiva** — interfaccia dedicata per aggiungere, abilitare/disabilitare, riavviare e rimuovere server
- **Integrazione automatica** — i tool MCP vengono iniettati nelle chat insieme ai tool nativi
- **Config locale** — `mcp_config.json` è ignorato da git; `mcp_config.example.json` documenta la struttura senza esporre dati sensibili
- **MCP incluso** — `mcp_servers/efesto_tools.py` è un server di esempio con tool `get_time`, `calculator` ed `echo`

### RAG (Retrieval-Augmented Generation)
- **Formati supportati** — PDF, DOCX, TXT, MD, CSV, JSON, HTML
- **Pipeline locale** — chunking, embedding con `ollama.embed()` e ricerca semantica via LanceDB
- **Knowledge Base resiliente** — i chunk testuali sono salvati in SQLite separatamente dai vettori: cambiare modello di embedding non richiede di ricaricare i file
- **Esporta / Importa KB** — backup portabile in JSON con re-embedding automatico all'importazione
- **Re-embedding automatico** — warning visivo quando il modello di embedding cambia, con bottone per rigenerare i vettori dai chunk salvati

### Workflow
- **Editor visivo a blocchi** — canvas drag-and-drop basato su React Flow
- **Nodi disponibili**: Input, AI Prompt, Python, Output, Condition, RAG Search, Note
- **Esecuzione streaming** — i nodi girano in sequenza topologica con aggiornamento visivo in tempo reale
- **Template variables** — riferimento agli output dei nodi precedenti con `{{node_id.output}}`
- **Suggerimenti inline** — pill cliccabili nel pannello configurazione per inserire riferimenti ai nodi collegati
- **Modal risultato** — al termine del workflow il risultato finale appare in un popup leggibile e copiabile
- **Salvataggio** — i workflow sono persistiti in SQLite e ricaricabili

---

## Stack

| Layer | Tecnologie |
|---|---|
| Backend | Python 3.9+, FastAPI, SQLModel, Ollama SDK, LanceDB, PyArrow, httpx |
| Frontend | React 19, Vite, Tailwind CSS, React Flow, Axios, react-markdown, KaTeX, Lucide React |
| Database | SQLite (chat, config, chunk KB, workflow), LanceDB (vettori embedding) |
| AI | Ollama (modelli locali), embedding con `ollama.embed()` batch API |

---

## Struttura del progetto

```
Efesto/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app, endpoints, chat streaming
│   │   ├── models.py         # Schema SQLite: settings, sessioni, chunk KB, workflow
│   │   ├── rag.py            # RagManager: chunking, embedding, ricerca LanceDB
│   │   ├── extractors.py     # Estrazione testo da PDF, DOCX, CSV, JSON, HTML
│   │   ├── mcp_manager.py    # Client MCP JSON-RPC 2.0 over stdio
│   │   └── tools/
│   │       ├── base.py       # Classe astratta BaseTool
│   │       ├── registry.py   # ToolRegistry globale
│   │       ├── rag_search.py
│   │       ├── file_reader.py
│   │       └── python_executor.py
│   ├── mcp_servers/
│   │   └── efesto_tools.py   # Server MCP di esempio (get_time, calculator, echo)
│   ├── mcp_config.json           # Config MCP locale (gitignored)
│   ├── mcp_config.example.json   # Template di configurazione MCP
│   ├── storage/vectors/      # Database vettoriale LanceDB (gitignored)
│   ├── efesto.db             # SQLite (gitignored)
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── App.jsx            # Componente React principale
    │   ├── workflow/          # Editor workflow (WorkflowEditor, nodes, ConfigPanel)
    │   ├── mcp/               # Pannello gestione MCP
    │   ├── main.jsx
    │   └── index.css
    ├── package.json
    └── tailwind.config.js
```

---

## Installazione

### Prerequisiti

- [Ollama](https://ollama.com) — runtime per i modelli locali
- **Python 3.9+** — `python3 --version`
- **Node.js 18+** — `node --version`

### 1. Clona il repository

```bash
git clone https://github.com/MarcoSalmaso/Efesto.git
cd Efesto
```

### 2. Scarica i modelli Ollama

```bash
ollama pull qwen3:8b               # modello chat con tool calling (consigliato)
ollama pull qwen3-embedding:4b     # modello di embedding per il RAG (default)
```

### 3. Avvia il backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8006
```

### 4. Avvia il frontend

```bash
cd frontend
npm install
npm run dev
```

Apri **`http://localhost:5173`**.

### Avvii successivi

```bash
# Terminale 1 — backend
cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8006

# Terminale 2 — frontend
cd frontend && npm run dev
```

---

## MCP: aggiungere un server locale

1. Crea uno script Python in `backend/mcp_servers/` seguendo il protocollo JSON-RPC 2.0 over stdio (vedi `efesto_tools.py` come riferimento)
2. Vai nel tab **MCP** dell'interfaccia → **Aggiungi server**
3. Inserisci nome, comando e argomenti
4. Il server viene avviato automaticamente e i suoi tool diventano disponibili in chat

La configurazione viene salvata in `mcp_config.json` (ignorato da git). Copia `mcp_config.example.json` come punto di partenza su nuove macchine.

---

## RAG: backup e migrazione

### Esportare

**Database** → **Esporta**: scarica `efesto_kb_YYYYMMDD_HHMMSS.json` con tutti i chunk testuali.

### Importare su una nuova macchina

1. Avvia Efesto sulla nuova macchina
2. **Database** → **Importa** → seleziona il file JSON
3. I chunk vengono salvati e i vettori rigenerati automaticamente con il modello configurato

### Cambiare modello di embedding

1. **Impostazioni** → cambia _Modello di Embedding_ → Salva
2. **Database**: compare un warning con il pulsante **Rigenera Vettori**
3. Efesto rilegge i chunk da SQLite e rigenera i vettori senza ricaricare i file originali

---

## Aggiungere un tool nativo

1. Crea un file in `backend/app/tools/`, estendi `BaseTool` e implementa `name`, `description`, `parameters_schema` e `execute()`
2. Registralo in `backend/app/tools/__init__.py` con `registry.register_tool(MyTool())`

---

## API principali

| Metodo | Endpoint | Descrizione |
|---|---|---|
| `POST` | `/chat` | Chat streaming con tool calling |
| `GET` | `/sessions` | Lista sessioni |
| `PATCH` | `/sessions/{id}` | Rinomina sessione |
| `GET` | `/sessions/search?q=` | Ricerca full-text nelle sessioni |
| `GET` | `/workflows/` | Lista workflow |
| `POST` | `/workflows/` | Crea workflow |
| `PATCH` | `/workflows/{id}` | Aggiorna workflow |
| `POST` | `/workflows/{id}/run` | Esegui workflow (streaming) |
| `GET` | `/mcp/servers` | Lista server MCP con status e tool |
| `POST` | `/mcp/servers` | Aggiungi server MCP |
| `PATCH` | `/mcp/servers/{name}` | Modifica / toggle server MCP |
| `DELETE` | `/mcp/servers/{name}` | Rimuovi server MCP |
| `POST` | `/mcp/servers/{name}/restart` | Riavvia connessione MCP |
| `GET` | `/knowledge/export` | Esporta KB come JSON |
| `POST` | `/knowledge/import` | Importa JSON + re-embedding |
| `POST` | `/knowledge/reembed` | Rigenera vettori dai chunk |
| `POST` | `/knowledge/upload` | Carica e indicizza un documento |
| `GET` | `/settings` | Legge la configurazione |
| `POST` | `/settings` | Aggiorna la configurazione |
| `GET` | `/ollama/list` | Lista modelli disponibili |
| `GET` | `/ollama/ps/stream` | Stream SSE modelli in memoria |

---

*Efesto — Costruisci il tuo Olimpo Digitale.*