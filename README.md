# CallFlowWeaver

CallFlowWeaver is a small web app for visualizing **call flows / message sequences** in the browser.

Use it for things like:

* Telecom signalling flows
* Service-to-service interactions
* Any "who talks to whom, in what order" kind of process

Live demo:
[https://chengqian1129.github.io/CallFlowWeaver.github.io/](https://chengqian1129.github.io/CallFlowWeaver.github.io/)

---

## Why this exists

Call flows usually live in static diagrams, PDFs, or spec documents.
They get outdated quickly, they are hard to share, and even harder to explore.

CallFlowWeaver is an attempt to make call flows:

* **Data-driven** – flows are described as structured data (for example JSON / JSONL)
* **Interactive** – rendered dynamically in the browser
* **Easy to tweak** – update the data, refresh the page, done

---

## What it does (currently)

* Renders a sequence-style view of a flow with multiple participants
* Shows who sends what to whom, and in which order
* Uses structured data as the single source of truth
* Runs as a static site (just HTML + JavaScript) – no backend required

You can host it anywhere you can serve static files (GitHub Pages, Nginx, S3, etc.).

---

## Getting started

### 1. Clone the repo

```bash
git clone https://github.com/ChengQian1129/CallFlowWeaver.github.io.git
cd CallFlowWeaver.github.io
```

### 2. Run it locally

Because this is a static site, any simple HTTP server works.

For example, with Python 3:

```bash
python -m http.server 8000
```

Then open this in your browser:

```text
http://localhost:8000
```

You can also try opening `index.html` directly, but some browsers restrict local file access for scripts, so using a small HTTP server is usually more reliable.

---

## Using your own flows

CallFlowWeaver expects a list of "messages" or "steps" that describe the flow.

A simplified example might look like this:

```json
{
  "from": "NodeA",
  "to": "NodeB",
  "time": "T0",
  "message": "SomeMessageName",
  "details": "Optional description or notes"
}
```

The exact schema can be adapted to your needs, but in general you will want:

* `from` – sender / source
* `to` – receiver / destination
* `message` – what is being sent (for example message name, API, procedure)
* `time` or `order` – how to place this message in the sequence
* optional extra fields – for example procedure name, annotations, information elements (IEs), error flags, and so on

Typical workflow:

1. Define your flow in a JSON or JSONL file.
2. Load that file in the front-end.
3. Pass the parsed data to the rendering logic.

---

## Project structure (high level)

This is the rough layout (it may change over time):

```text
CallFlowWeaver.github.io/
├─ index.html        # Entry point for the web UI
├─ *.js              # Front-end logic / rendering code
├─ *.json / *.jsonl  # Example flow data
└─ assets/           # (Optional) images, styles, etc.
```

---

## Roadmap / future ideas

The long-term direction for this project includes:

* **AI-assisted case creation**
  Use AI to generate example call flows (cases) from specs or from a few high-level parameters.
  This should make it easier to quickly create realistic flows for testing, demos, or documentation.

* **IE rationalization (Information Element rationalization)**
  Help analyze and clean up Information Elements across messages:

  * detect inconsistencies and missing IEs
  * spot redundant or duplicated fields
  * provide a more consistent view of IEs across a whole procedure

Other ideas:

* Filtering and search (by participant, message type, procedure, keywords)
* Highlighting a specific scenario or path inside a large flow
* Export to image or PDF for documents and slide decks
* Loading custom data files directly from the UI
* Basic theming (for example dark mode and compact mode)

---

## Contributing

This started as a personal tool, but suggestions and contributions are welcome.

1. Fork the repository

2. Create a feature branch:

   ```bash
   git checkout -b feature/your-idea
   ```

3. Commit your changes:

   ```bash
   git commit -m "Add your feature"
   ```

4. Open a Pull Request

Bug reports and feature requests via GitHub Issues are also appreciated.

---

## License

This project is licensed under the **MIT License**.
See the `LICENSE` file for details.
