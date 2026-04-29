# Efesto — Local AI Workbench

![Infografica](./assets/infografica.png)

Efesto è un'applicazione **local-first** per interagire con modelli AI locali (via Ollama). Chat con streaming, RAG, tool calling, agenti specializzati, prompt library, workflow visivi e integrazione MCP — tutto gira sulla tua macchina, senza dipendenze da cloud esterni.

---

## Funzionalità

### Home
- **Dashboard di benvenuto** — schermata iniziale con statistiche rapide (conversazioni, agenti, prompt, workflow) e accesso diretto a tutte le funzionalità
- **Sessioni recenti** — ultime 6 conversazioni accessibili con un clic dalla home
- **Stato backend** — indicatore visivo online/offline sempre in vista

### Chat
- **Streaming in tempo reale** — risposte token per token con supporto al _thinking_ (chain-of-thought) per modelli come Qwen3 e Gemma4
- **Velocità token/s** — contatore in tempo reale nella sidebar di destra
- **Stop generazione** — interrompi il modello in qualsiasi momento
- **Sidebar processo** — visualizzazione dei passi del modello: ragionamento, tool call, esecuzione, risposta; mostra l'agente attivo quando presente
- **Artifacts** — blocchi HTML/SVG renderizzati in un iframe interattivo con tab Anteprima/Codice e apertura in nuova scheda
- **Rendering Markdown + LaTeX** — GFM, syntax highlighting e formule matematiche (KaTeX)
- **Sessioni persistenti** — conversazioni salvate in SQLite, ricaricabili dal tab Conversazioni
- **Parametri di generazione** — temperature, top-p e max token configurabili per sessione
- **Strumenti chat** — pulsante `+` nella textarea apre un pannello con accesso rapido ad agenti e prompt library; scalabile per future aggiunte
- **Allegati in chat** — allega immagini (PNG, JPG, WebP, GIF) e documenti (PDF, DOCX, TXT, MD, CSV, JSON, HTML, XLSX) direttamente nella textarea; le immagini vengono inviate ai modelli vision, i documenti vengono estratti e iniettati nel contesto del messaggio

### Conversazioni
- **Pagina dedicata** — storico completo delle sessioni in un tab separato, con card che mostrano titolo, snippet e data
- **Ricerca full-text** — filtra per titolo e contenuto dei messaggi con evidenziazione dei match
- **Rinomina sessioni** — inline, direttamente dalla lista

### Modelli
- **Selettore modello** — dropdown personalizzato con tutti i modelli Ollama disponibili
- **Modelli in memoria** — indicatore in tempo reale dei modelli attivi (via SSE)

### Agenti
- **Profili specializzati** — ogni agente ha il proprio system prompt, modello, parametri di generazione e set di tool abilitati
- **Colore personalizzato** — 8 colori preset; le bolle della chat e l'avatar riflettono il colore dell'agente che ha risposto
- **Tracciamento per messaggio** — il colore e il nome dell'agente vengono salvati su ogni messaggio in SQLite, così ogni bolla mostra sempre l'agente corretto anche dopo aver cambiato selezione
- **Pill agente attivo** — indicatore colorato nella textarea con pulsante per deselezionare senza aprire il menu
- **Filtro tool** — configura quali tool (nativi e MCP) sono accessibili all'agente

### Prompt Library
- **Salvataggio prompt** — titolo, contenuto e tag (separati da virgola) persistiti in SQLite
- **Ricerca** — filtra per titolo, contenuto e tag nel pannello dedicato e nel selettore inline
- **Inserimento rapido** — dal pannello `+` nella chat, seleziona un prompt e viene inserito direttamente nella textarea

### Tool Calling
I modelli compatibili possono invocare autonomamente gli strumenti durante la conversazione:

| Tool | Descrizione |
|---|---|
| `search_knowledge` | Ricerca semantica nella Knowledge Base RAG |
| `read_file` | Legge file di testo dal filesystem locale |
| `execute_python` | Esegue codice Python in un subprocess isolato (timeout 10s) |
| `web_search` | Cerca informazioni aggiornate su internet via DuckDuckGo (no API key) |
| `manage_memory` | Salva, elimina ed elenca memorie persistenti sull'utente |

### MCP (Model Context Protocol)
- **Server MCP locali** — connetti qualsiasi server MCP tramite trasporto stdio (processi locali Python, Node.js, ecc.)
- **Gestione visiva** — interfaccia dedicata per aggiungere, abilitare/disabilitare, riavviare e rimuovere server
- **Integrazione automatica** — i tool MCP vengono iniettati nelle chat insieme ai tool nativi
- **Config locale** — `mcp_config.json` è ignorato da git; `mcp_config.example.json` documenta la struttura senza esporre dati sensibili
- **MCP incluso** — `mcp_servers/efesto_tools.py` è un server di esempio con tool `get_time`, `calculator` ed `echo`

### RAG (Retrieval-Augmented Generation)
- **Formati supportati** — PDF, DOCX, TXT, MD, CSV, JSON, HTML, XLSX
- **Pipeline locale** — chunking, embedding con `ollama.embed()` e ricerca semantica via LanceDB
- **Knowledge Base resiliente** — i chunk testuali sono salvati in SQLite separatamente dai vettori: cambiare modello di embedding non richiede di ricaricare i file
- **Esporta / Importa KB** — backup portabile in JSON con re-embedding automatico all'importazione
- **Re-embedding automatico** — warning visivo quando il modello di embedding cambia, con bottone per rigenerare i vettori dai chunk salvati

### Memoria Persistente
- **Memorie sull'utente** — fatti persistenti (preferenze, contesto, obiettivi) salvati in SQLite e ricaricabili tra sessioni
- **Gestione manuale** — pannello dedicato per aggiungere, modificare ed eliminare memorie direttamente dall'interfaccia
- **Gestione autonoma** — il modello può aggiornare le memorie via tool `manage_memory` durante la chat
- **Iniezione opzionale** — impostazione per iniettare automaticamente tutte le memorie nel system prompt ad ogni risposta

### Simulazioni
- **Scenari multi-agente** — simula situazioni organizzative complesse prima di prendere decisioni reali
- **Agenti configurabili** — ogni agente ha nome, ruolo, system prompt e modello opzionale; l'ordine di risposta è personalizzabile
- **Streaming token per token** — i turni di ogni agente vengono generati in tempo reale con cursore animato
- **Round multipli** — configura da 1 a 10 round; ogni agente vede il contesto completo dei turni precedenti
- **Analisi AI** — al termine della simulazione, genera un'analisi strutturata con dinamiche emerse, posizioni chiave, punti di svolta e implicazioni strategiche
- **Rendering Markdown** — le risposte degli agenti e l'analisi supportano Markdown completo
- **Duplicazione** — clona una simulazione con tutti i suoi agenti per varianti rapide
- **Persistenza SQLite** — simulazioni, agenti e turni salvati nel database locale

### Workflow
- **Editor visivo a blocchi** — canvas drag-and-drop basato su React Flow
- **Nodi disponibili**: Input, AI Prompt, Python, Output, Condition, RAG Search, Note
- **Esecuzione streaming** — i nodi girano in sequenza topologica con aggiornamento visivo in tempo reale
- **Template variables** — riferimento agli output dei nodi precedenti con `{{node_id.output}}`
- **Suggerimenti inline** — pill cliccabili nel pannello configurazione per inserire riferimenti ai nodi collegati
- **Modal risultato** — al termine del workflow il risultato finale appare in un popup leggibile e copiabile
- **Rinomina workflow** — inline nell'editor e nella lista
- **Salvataggio** — i workflow sono persistiti in SQLite e ricaricabili

---

## Stack

| Layer | Tecnologie |
|---|---|
| Backend | Python 3.9+, FastAPI, SQLModel, Ollama SDK, LanceDB, PyArrow, httpx, openpyxl |
| Frontend | React 19, Vite, Tailwind CSS, React Flow, Axios, react-markdown, KaTeX, Lucide React |
| Database | SQLite (chat, sessioni, agenti, prompt, workflow, config), LanceDB (vettori embedding) |
| AI | Ollama (modelli locali), embedding con `ollama.embed()` batch API |

---

## Struttura del progetto

```
Efesto/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app, endpoints, chat streaming
│   │   ├── models.py         # Schema SQLite: settings, sessioni, agenti, prompt, workflow, simulazioni, memorie
│   │   ├── rag.py            # RagManager: chunking, embedding, ricerca LanceDB
│   │   ├── extractors.py     # Estrazione testo da PDF, DOCX, CSV, JSON, HTML
│   │   ├── mcp_manager.py    # Client MCP JSON-RPC 2.0 over stdio
│   │   └── tools/
│   │       ├── base.py       # Classe astratta BaseTool
│   │       ├── registry.py   # ToolRegistry globale
│   │       ├── rag_search.py
│   │       ├── file_reader.py
│   │       ├── python_executor.py
│   │       └── memory_tool.py
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
    │   ├── home/              # Homepage / dashboard
    │   ├── agents/            # Pannello agenti + colori
    │   ├── prompts/           # Prompt Library
    │   ├── workflow/          # Editor workflow (WorkflowEditor, nodes, ConfigPanel)
    │   ├── simulation/        # Pannello simulazioni multi-agente
    │   ├── memory/            # Pannello memoria persistente
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

## Agenti: guida rapida

1. Vai nel tab **Agenti** → **Nuovo agente**
2. Assegna nome, system prompt, modello (opzionale), colore e tool abilitati
3. In chat, clicca il pulsante **`+`** nella textarea → **Agente** per selezionarlo
4. L'agente attivo appare come pill colorata; clicca `×` per deselezionarlo

---

## Prompt Library: guida rapida

1. Vai nel tab **Prompt Library** → **Nuovo prompt**
2. Inserisci titolo, contenuto e tag opzionali
3. In chat, clicca **`+`** → **Prompt Library**, cerca e seleziona: il testo viene inserito nella textarea

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

**RAG** → **Esporta**: scarica `efesto_kb_YYYYMMDD_HHMMSS.json` con tutti i chunk testuali.

### Importare su una nuova macchina

1. Avvia Efesto sulla nuova macchina
2. **RAG** → **Importa** → seleziona il file JSON
3. I chunk vengono salvati e i vettori rigenerati automaticamente con il modello configurato

### Cambiare modello di embedding

1. **Impostazioni** → cambia _Modello di Embedding_ → Salva
2. **RAG**: compare un warning con il pulsante **Rigenera Vettori**
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
| `GET` | `/agents/` | Lista agenti |
| `POST` | `/agents/` | Crea agente |
| `PATCH` | `/agents/{id}` | Aggiorna agente |
| `DELETE` | `/agents/{id}` | Elimina agente |
| `GET` | `/prompts/` | Lista prompt |
| `POST` | `/prompts/` | Crea prompt |
| `PATCH` | `/prompts/{id}` | Aggiorna prompt |
| `DELETE` | `/prompts/{id}` | Elimina prompt |
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
| `GET` | `/simulations/` | Lista simulazioni |
| `POST` | `/simulations/` | Crea simulazione |
| `PATCH` | `/simulations/{id}` | Aggiorna simulazione |
| `DELETE` | `/simulations/{id}` | Elimina simulazione |
| `POST` | `/simulations/{id}/duplicate` | Duplica simulazione con agenti |
| `GET` | `/simulations/{id}/agents` | Lista agenti della simulazione |
| `POST` | `/simulations/{id}/agents` | Crea agente |
| `PATCH` | `/simulations/{id}/agents/{aid}` | Aggiorna agente |
| `DELETE` | `/simulations/{id}/agents/{aid}` | Elimina agente |
| `PUT` | `/simulations/{id}/agents/reorder` | Riordina agenti |
| `GET` | `/simulations/{id}/turns` | Lista turni della simulazione |
| `POST` | `/simulations/{id}/run` | Esegui simulazione (SSE streaming) |
| `POST` | `/simulations/{id}/analyze` | Genera analisi (SSE streaming) |
| `GET` | `/memory/` | Lista memorie persistenti |
| `POST` | `/memory/` | Aggiunge una memoria |
| `PATCH` | `/memory/{id}` | Modifica una memoria |
| `DELETE` | `/memory/{id}` | Elimina una memoria |
| `GET` | `/ollama/list` | Lista modelli disponibili |
| `GET` | `/ollama/ps/stream` | Stream SSE modelli in memoria |

---

## TODO

- [ ] **macOS Quick Actions** — Integrazione nativa con l'app Shortcuts di macOS per interagire con Efesto senza aprire il frontend. Casi d'uso prioritari:
  - Aggiungere una memoria dal tasto destro o da una scorciatoia globale
  - Embeddizzare un file direttamente dal Finder (Quick Action sul menu contestuale)
  - Avviare un workflow per nome senza conoscere l'ID numerico (richiede endpoint `POST /workflows/run-by-name`)
  - Chat rapida con risposta in notifica

- [ ] **Efesto Observer — Assistente contestuale di sistema** — Processo daemon in background che osserva passivamente la macchina (clipboard, app attiva, file recenti, URL del browser via AppleScript) e costruisce un "contesto implicito" aggiornato in tempo reale. Quando si apre la chat, Efesto inietta silenziosamente il contesto rilevato nel system prompt della sessione, senza bisogno di descrivere su cosa si sta lavorando. Architettura prevista:
  - Daemon Python separato che polling-a le fonti di sistema configurabili
  - Canale SSE dedicato verso il backend per aggiornare il contesto attivo
  - Inject automatico nel system prompt della prossima sessione chat
  - Pannello "Osservazione attiva" nell'interfaccia con privacy controls granulari per tipo di fonte (clipboard, app, file, browser)

- [ ] **RAG Attivo — Knowledge Base con aggiornamento automatico** — Invece di aspettare il caricamento manuale, Efesto monitora fonti configurabili (cartelle locali, feed RSS, endpoint REST, pagine web) e aggiorna la Knowledge Base in background. Ogni chunk ha un livello di "freschezza" e ogni fonte ha una policy di refresh e un filtro di rilevanza basato su embedding similarity rispetto a un "topic anchor" configurabile. Architettura prevista:
  - Scheduler backend (APScheduler o thread) per il refresh periodico delle sorgenti
  - Supporto a: cartelle locali (watchdog), feed RSS (feedparser), URL web (httpx + BeautifulSoup)
  - Metadati `last_updated` e `source_url` per ogni chunk in SQLite
  - Interfaccia "Sorgenti attive" nel pannello RAG con stato ultimo aggiornamento, frequenza di refresh e log chunk aggiunti/rimossi

- [ ] **Multi-provider LLM — Supporto a LM Studio, OpenAI e Anthropic** — Attualmente Efesto usa esclusivamente Ollama. L'obiettivo è astrarre il layer LLM in un sistema a provider intercambiabili, selezionabile dalle impostazioni. Architettura prevista:
  - `OllamaProvider` (attuale), `OpenAIProvider` (copre anche LM Studio via base URL custom), `AnthropicProvider`
  - Campo `provider` e `api_key` nelle impostazioni globali; `base_url` configurabile per LM Studio
  - LM Studio e OpenAI API: refactor relativamente semplice (stesso SDK, formato tool già compatibile)
  - Anthropic: streaming e tool calling con formato diverso; embeddings richiedono un provider separato (Ollama o OpenAI) come fallback per il RAG

---

*Efesto — Costruisci il tuo Olimpo Digitale*
