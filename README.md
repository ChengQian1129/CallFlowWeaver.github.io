````markdown
# CallFlowWeaver

CallFlowWeaver is a small web app for visualising **call flows / message sequences** in the browser.

Use it for things like:

- Telecom signalling flows  
- Service-to-service interactions  
- Any “who talks to whom, in what order” kind of process  

👉 Live demo:  
https://chengqian1129.github.io/CallFlowWeaver.github.io/

---

## Why this exists

Call flows usually live in static diagrams, PDFs, or spec documents.  
They get outdated quickly, they’re hard to share, and even harder to explore.

CallFlowWeaver is an attempt to make call flows:

- **Data-driven** – flows are described as structured data (e.g. JSON / JSONL)  
- **Interactive** – rendered dynamically in the browser  
- **Easy to tweak** – update the data, refresh the page, done

---

## What it does (currently)

- Renders a sequence-style view of a flow with multiple participants
- Shows who sends what to whom, and in which order
- Uses structured data as the single source of truth
- Runs as a static site (just HTML + JS) – no backend required

You can host it anywhere you can serve static files (GitHub Pages, Nginx, S3, etc.).

---

## Getting started

### 1. Clone the repo

```bash
git clone https://github.com/ChengQian1129/CallFlowWeaver.github.io.git
cd CallFlowWeaver.github.io
````

### 2. Run it locally

Because this is a purely static site, any simple HTTP server works.

For example, with Python:

```bash
# Python 3
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

in your browser.

You can also try double-clicking `index.html` directly, but some browsers restrict local file access for scripts, so a tiny HTTP server is usually more reliable.

---

## Using your own flows

CallFlowWeaver expects a list of “messages” / “steps” that describe the flow.

A simplified example might look like this:

```json
{
  "from": "NodeA",
  "to": "NodeB",
  "time": "T0",
  "message": "SomeMessageName",
  "details": "Optional human-readable description or notes"
}
```

The exact schema can be adapted to your needs, but in general you’ll want:

* `from` – sender / source
* `to` – receiver / destination
* `message` – what is being sent (e.g. message name, API, procedure)
* `time` or `order` – how to place this message in the sequence
* Optional extra fields – e.g. group/procedure name, annotations, IE details, etc.

Typical workflow:

1. Define your flow in a JSON/JSONL file.
2. Load that file in the front-end (hard-coded path, simple fetch, etc.).
3. Pass the parsed data to the rendering logic.

---

## Project structure (high-level)

Rough layout (may change as the project evolves):

```text
CallFlowWeaver.github.io/
├─ index.html        # Entry point for the web UI
├─ *.js              # Front-end logic / rendering code
├─ *.json / *.jsonl  # Example flow data
└─ assets/           # (Optional) images, styles, etc.
```

---

## Roadmap / future ideas

Some directions this project is intended to go:

* **AI-assisted case creation**

  * Use AI to generate example call flows (“cases”) from specs or a few high-level parameters.
  * Quickly spin up realistic flows for testing, demos, or documentation.

* **IE rationalization (Information Element rationalization)**

  * Help align and “clean up” Information Elements across messages.
  * Detect inconsistencies, missing IEs, or redundant fields.
  * Provide a more coherent view of IEs across a whole procedure.

* Better filtering and navigation

  * Filter by participant, message type, procedure, keywords, etc.
  * Highlight a specific path or scenario within a larger flow.

* Export / sharing

  * Export to image / PDF for documents and slide decks.
  * Easy sharing links for particular flows or views.

If you’re looking at this later and something is implemented, feel free to turn the bullets into a checklist and tick them off. ✅

---

## Contributing

This started as a personal tool, but ideas and contributions are welcome.

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/your-idea`
3. Commit your changes: `git commit -m "Add your feature"`
4. Open a Pull Request

Bug reports and feature suggestions via Issues are also appreciated.

---

## License

This project is licensed under the **MIT License**.
See the `LICENSE` file for details.

```
::contentReference[oaicite:0]{index=0}
```
