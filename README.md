# CallFlowWeaver

CallFlowWeaver is a lightweight, static web UI for working with **telecom protocol messages and call flows** on top of a structured “truth” data model.

It is designed for large 5GC / 3GPP datasets first, with a long-term goal of supporting **all kinds of communication messages** — both **3GPP and non-3GPP**.

---

## What it is

* A static web viewer for **large telecom message sets** (5GC, EPC, etc.).
* A way to **browse, group, and review** individual messages and local “cases”.
* A GUI where you can open the **exact standards clause (3GPP / ETSI / RFC) directly from a message**.
* A front-end–only tool that runs entirely in your browser and works well on GitHub Pages.

### Live demo

* [https://chengqian1129.github.io/CallFlowWeaver.github.io/](https://chengqian1129.github.io/CallFlowWeaver.github.io/)

---

## What it achieves

* Turns raw, large **JSON/JSONL dumps** into a navigable, reviewable view.
* Aligns each message with the right **standards chapter**, cutting context-switching time.
* Produces shareable **“cases”** for reviews and discussions, without any backend.
* Keeps everything local in the browser, making it **safe to try** and **easy to deploy**.

---

## Why this exists

* 3GPP call flows typically live in static diagrams or PDFs and are hard to explore.
* Keeping the flow and the spec in separate windows is slow and error-prone.
* This tool keeps **flow, message details, and spec references in one place**, so verification is faster and more accurate.

---

## Key features

* **Ladder diagram for 3GPP flows**
  Messages between network functions are shown in time order.

* **Per-message details**
  Click a message to see direction, endpoints, procedure, IEs, notes, and metadata.

* **Built-in standards viewer**
  Each message carries TS / Version / Section metadata, and the GUI can open the **exact 3GPP/ETSI/RFC clause directly**.
  You jump straight to the relevant chapter; page/section alignment is handled for you.

* **Data-driven flows**
  Flows and messages are described as structured data (JSON / JSONL).
  Example dataset: `non5gc_rel18.final.rich.jsonl`.

* **Pure front-end**
  Static HTML + JavaScript, no backend.
  Runs locally or on GitHub Pages (or any static web server).

---

## Data model & “truth”

The project is built around a **truth model** for protocol messages.

### Messages

Each message is a rich, versioned object, for example (simplified):

```json
{
  "schema_version": "2.0",
  "id": "EPC.GTPv1-C.CreatePDPContextRequest.SGSN->GGSN@Rel-17",
  "family": "EPC",
  "protocol": "GTPv1-C",
  "message": "CreatePDPContextRequest",
  "type": "Request",
  "from": "SGSN",
  "to": "GGSN",
  "release": "Rel-17",
  "primary_ref": {
    "ts": "TS 29.060",
    "section": "§7.3.1",
    "version": "V17.8.0",
    "release": "Rel-17"
  },
  "doc": {
    "summary_en": "High-level purpose of the message",
    "steps": "Numbered procedure steps referencing other TSes",
    "comment_md": "Longer markdown explanation, key IEs, error handling, etc."
  },
  "ie_tree": [
    { "name": "IMSI", "presence": "M", "occurs": "1", "$ref": "imsi" },
    { "name": "NSAPI", "presence": "M", "occurs": "1", "$ref": "nsapi" }
  ],
  "ie_dict": {
    "imsi": {
      "name": "IMSI",
      "doc": "International Mobile Subscriber Identity...",
      "format": "TLV",
      "len": "2-8",
      "default": "234150999999999",
      "example": "234150123456789",
      "editable": true
    }
  }
}
```

Key ideas:

* **Identity & scope**
  `family`, `protocol`, `message`, `type`, `from` / `to`, `release`, `schema_version`.

* **Standards references**
  `primary_ref` points to the **exact spec clause** (TS, section, version, release).

* **Documentation**
  `doc.summary_en`, `doc.steps`, `doc.comment_md` provide human-readable context.

* **Information Elements**
  `ie_tree` describes the IE layout and presence;
  `ie_dict` holds detailed IE docs, formats, enums, examples, and editability flags.

Protocol-specific sections (e.g. GTP headers, HTTP method/URI, ProblemDetails schemas) can be added on top.

### Cases

A **case** is a local, shareable view built from these messages:

* A subset of messages (for example, one incident, one UE session, one scenario).
* Optional ladder / flow structure.
* Local filters and focus for a particular review.

Cases live in the browser and can be **exported/imported as JSON**, so teams can look at the same view without any backend.

### Long-term direction

The truth model is designed to be **protocol-agnostic**:

* Start with 3GPP (EPC / 5GC, etc.).
* Expand to more 3GPP families and releases.
* Extend to **non-3GPP protocols** (HTTP APIs, vendor interfaces, legacy protocols), and allow mixed flows.

---

## Goals

* **Fast browsing at scale**
  Handle thousands of records with pagination, grouping, and lightweight search/filter.

* **Standards-first workflow**
  Make verification against 3GPP/ETSI/RFC immediate and routine:

  * TS / Version / Section are first-class metadata.
  * Opening the exact clause from the GUI should be a normal habit, not a chore.

* **Universal message coverage**
  Progressively extend the truth model to cover:

  * more protocol families and releases,
  * both **3GPP and non-3GPP** messages.

* **Shareability without backend**
  Export/import local cases so teams can review exactly the same view, without any shared server.

* **Zero-backend, frictionless publishing**
  Run locally, or publish as a GitHub Pages site with just static files.

* **Progressive truth coverage & review**
  Grow coverage over time and add periodic human review to bring the truth data closer to the real specs.

* **Safety by design**
  No automatic data upload, and no secrets baked in. Keys are only ever provided at runtime.

---

## Quick start

### Run locally

```bash
git clone https://github.com/ChengQian1129/CallFlowWeaver.github.io.git
cd CallFlowWeaver.github.io

# Python 3
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

### Load data

* Use the file picker in the page to load a JSON/JSONL dataset, **or**
* Use URL parameters, for example:

  * `?dataset=<relative-path>` to load a dataset from the repo
  * `?autoload=<URL>` to load from a remote URL

### GitHub Pages example

```text
https://<username>.github.io/<repo>/
  ?dataset=non5gc_rel18.final.rich.jsonl
  &v=<timestamp>
```

* `dataset` points at a dataset in the repo.
* `v` is any value (timestamp, git hash, etc.) to force a cache refresh.

### File protocol note

Opening via `file://` cannot auto-read sibling data files due to browser restrictions.
Use a local HTTP server (like `python -m http.server`) or manually select files in the page.

---

## How to use

* **Browse**

  * Use the paginated view (e.g. 50 items per page) to move through large datasets.
  * Group or filter by interface, protocol, family, etc.
  * Use simple search/filter to narrow down messages.

* **Standards**

  * Messages carry TS / Version / Section metadata.
  * Use the UI to open the **exact chapter** in 3GPP/ETSI/RFC; alignment is handled for you.

* **Ladder view (flows)**

  * For datasets that include flow information, open the ladder diagram.
  * Click a message in the ladder to see details, IEs, and spec references.

* **StyleA preview**

  * Open a clearer, shareable view of the current node/message for reviews and screenshots.

* **Cases**

  * Create local cases by selecting and grouping messages.
  * Export/import cases to continue work later or share with teammates.

---

## AI status and truth notes

* AI features are **experimental** and currently unreliable.
  They remain visible, but are optional; for normal use, you can safely ignore them.

* “Truth” data (message definitions, docs, IE descriptions, etc.) may be produced by **AI and automated parsing**.
  It can be incomplete or inaccurate.

> The official standards (3GPP/ETSI/RFC) are always the **single source of truth**.
> This tool is meant to help you navigate them faster, not replace them.

* Scope will grow over time:

  * more protocols, versions, and sections,
  * more human review on top of automation to improve quality and consistency.

---

## Privacy & safety

* Data stays in the browser (`indexedDB` / `localStorage`) by default; nothing is uploaded.
* Do **not** commit any API keys to the repository.
* If a feature needs keys, provide them only at runtime and keep them local to your environment.
* Because it runs on static hosting, you can deploy internal viewers without standing up any backend services.
