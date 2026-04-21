# Efesto — Local AI Workbench

Efesto è un'applicazione **local-first** per interagire con modelli AI locali (via Ollama) dotata di RAG, tool calling, streaming delle risposte e un'interfaccia web moderna. Tutto gira sulla tua macchina, senza dipendenze da cloud esterni.

---

## Funzionalità

- **Chat con streaming** — risposte in tempo reale con supporto al _thinking_ (chain-of-thought) dei modelli che lo supportano
- **Stop generazione** — interrompi la risposta del modello in qualsiasi momento con un click
- **Sidebar processo** — visualizzazione grafica in tempo reale dei passi del modello (ragionamento, tool call, esecuzione, risposta)
- **Artifacts** — blocchi HTML/SVG generati dal modello vengono renderizzati in un iframe interattivo, con tab Anteprima/Codice e apertura in nuova scheda
- **Tool calling** — il modello può invocare strumenti autonomamente durante la conversazione
- **RAG locale** — carica documenti (PDF, DOCX, TXT, MD, CSV, JSON, HTML) nella Knowledge Base; vengono suddivisi in chunk, embeddati con un modello Ollama e cercati semanticamente via LanceDB
- **Knowledge Base resiliente** — i chunk testuali sono salvati in SQLite separatamente dai vettori LanceDB: cambiare modello di embedding non richiede di ricaricare i file originali
- **Esporta / Importa KB** — backup portabile della Knowledge Base in JSON; importazione con re-embedding automatico su qualsiasi macchina
- **Re-embedding automatico** — warning visivo quando il modello di embedding cambia, con bottone per rigenerare tutti i vettori dai chunk salvati
- **Sessioni persistenti** — le conversazioni sono salvate in SQLite e ricaricabili dalla sidebar
- **Rendering Markdown + LaTeX** — le risposte supportano GFM, syntax highlighting e formule matematiche (KaTeX)
- **Impostazioni configurabili** — system prompt, lunghezza contesto, modello di embedding, max chunk length, embedding batch size, top-k retrieval

---

## Stack

| Layer | Tecnologie |
|---|---|
| Backend | Python 3.9+, FastAPI, SQLModel, Ollama SDK, LanceDB, PyArrow |
| Frontend | React 19, Vite, Tailwind CSS, Axios, react-markdown, KaTeX, Lucide React |
| Database | SQLite (chat, config, chunk KB), LanceDB (vettori embedding) |
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
│   │   ├── models.py        # Schema SQLite: settings, sessioni, chunk KB
│   │   ├── rag.py           # RagManager: chunking, embedding, ricerca LanceDB
│   │   ├── extractors.py    # Estrazione testo da PDF, DOCX, CSV, JSON, HTML
│   │   └── tools/
│   │       ├── base.py      # Classe astratta BaseTool
│   │       ├── registry.py  # ToolRegistry globale
│   │       ├── rag_search.py
│   │       ├── file_reader.py
│   │       └── python_executor.py
│   ├── storage/vectors/     # Database vettoriale LanceDB (gitignored)
│   ├── efesto.db            # SQLite: chat, settings, chunk KB (gitignored)
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

# Kill dei processi nella porta 8006
lsof -ti :8006 | xargs kill -9
```

---

## Knowledge Base: backup e migrazione

### Esportare

Dal tab **Database** → **Esporta**: scarica `efesto_kb_YYYYMMDD_HHMMSS.json` con tutti i chunk testuali, indipendente dal modello di embedding.

### Importare su una nuova macchina

1. Avvia Efesto sulla nuova macchina
2. **Database** → **Importa** → seleziona il file JSON
3. I chunk vengono salvati e i vettori rigenerati automaticamente

### Cambiare modello di embedding

1. **Impostazioni** → cambia _Modello di Embedding_ → Salva
2. Torna in **Database**: compare un warning giallo con il pulsante **Rigenera Vettori**
3. Clicca — Efesto rilegge i chunk da SQLite e rigenera i vettori, senza ricaricare i file originali

---

## Aggiungere un nuovo strumento

1. Crea un file in `backend/app/tools/`, estendi `BaseTool` e implementa `name`, `description`, `parameters_schema` e `execute()`
2. Registralo in `backend/app/tools/__init__.py` con `registry.register_tool(MyTool())`

---

## API principali

| Metodo | Endpoint | Descrizione |
|---|---|---|
| `POST` | `/chat` | Chat streaming con tool calling |
| `GET` | `/knowledge/export` | Esporta KB come JSON |
| `POST` | `/knowledge/import` | Importa JSON + re-embedding automatico |
| `POST` | `/knowledge/reembed` | Rigenera vettori dai chunk salvati |
| `POST` | `/knowledge/upload` | Carica e indicizza un documento |
| `DELETE` | `/knowledge/{filename}` | Rimuove un documento |
| `GET` | `/settings` | Legge la configurazione |
| `POST` | `/settings` | Aggiorna la configurazione |

---

*Efesto — Costruisci il tuo Olimpo Digitale.*
