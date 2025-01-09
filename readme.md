# Doc-Helper

Un assistente intelligente per la documentazione che risponde alle tue domande analizzando la documentazione online tramite AI.

## Panoramica del Progetto

Doc-Helper è un'applicazione web intelligente che permette agli utenti di:
- Porre domande in linguaggio naturale
- Ottenere risposte accurate basate sulla documentazione online
- Ricevere risposte contestuali ben formattate

## Architettura

### Frontend

L'interfaccia utente è composta da:
- Un'interfaccia web moderna e pulita
- Un campo di input per le domande
- Un pulsante di invio per elaborare le richieste
- Un'area di risposta con testo formattato e blocchi di codice

### Backend

Il server gestisce:
1. **Elaborazione delle Query**
   - Riceve le domande degli utenti tramite API REST
   - Elabora le query in linguaggio naturale
   - Restituisce risposte formattate

2. **Accesso alla Documentazione**
   Il sistema può accedere alla documentazione attraverso diversi metodi:
   - Web scraping per documentazione online
   - API ufficiali di documentazione quando disponibili
   - Database locale indicizzato per la documentazione

3. **Elaborazione AI**
   - Utilizza Large Language Models (LLM) per:
     - Comprendere le domande degli utenti
     - Analizzare il contenuto della documentazione
     - Generare risposte contestuali
     - Riassumere le informazioni rilevanti

## Stack Tecnologico

- **Frontend**: React.js
- **Backend**: Node.js
- **Containerizzazione**: Docker
- **Integrazione AI**: OpenAI/Azure OpenAI
- **Archiviazione Documentazione**: Database vettoriale (opzionale)

## Per Iniziare

1. Clona il repository
2. Configura le variabili d'ambiente:
   ```bash
   cp .env.example .env
   # Modifica .env con la tua configurazione
   ```
3. Avvia l'applicazione:
   ```bash
   docker-compose up
   ```

L'applicazione sarà disponibile all'indirizzo `http://localhost:3000`

## Variabili d'Ambiente

Variabili d'ambiente necessarie:
- `OPENAI_API_KEY`: La tua chiave API OpenAI
- Altre variabili di configurazione secondo necessità

## Sviluppo

Per eseguire l'applicazione in modalità sviluppo:

1. Avvia il backend:
   ```bash
   cd backend
   npm install
   npm run dev
   ```

2. Avvia il frontend:
   ```bash
   cd frontend
   npm install
   npm start
   ```

## Contribuire

I contributi sono benvenuti! Sentiti libero di inviare una Pull Request.

## Licenza

Questo progetto è open source e disponibile sotto licenza MIT.