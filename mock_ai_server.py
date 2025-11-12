import json
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def _set_headers(self, code: int = 200):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        # CORS for local viewer on different port
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers(200)

    def do_GET(self):
        path = self.path.split('?')[0]
        if path.endswith('/v1/models') or path == '/v1/models':
            self._set_headers(200)
            resp = {
                "object": "list",
                "data": [
                    {"id": "mock-consistency-analyzer", "object": "model"},
                    {"id": "mock-chat", "object": "model"},
                ],
            }
            self.wfile.write(json.dumps(resp).encode('utf-8'))
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "not_found", "path": self.path}).encode('utf-8'))

    def do_POST(self):
        path = self.path.split('?')[0]
        try:
            length = int(self.headers.get('Content-Length') or '0')
        except Exception:
            length = 0
        raw = self.rfile.read(length) if length else b''
        body = raw.decode('utf-8', errors='ignore')
        try:
            data = json.loads(body) if body else {}
        except Exception:
            data = {}

        if path.endswith('/v1/chat/completions') or path == '/v1/chat/completions':
            # OpenAI-compatible response
            case = {}
            try:
                msgs = data.get('messages') or []
                # Find last user message that looks like JSON
                for m in reversed(msgs):
                    if isinstance(m, dict) and m.get('role') == 'user':
                        content = m.get('content') or ''
                        try:
                            case = json.loads(content)
                        except Exception:
                            case = {}
                        break
            except Exception:
                case = {}

            items = case.get('items') or []
            suggestions = []
            for it in items:
                kvs = [v for v in (it.get('ie_values') or []) if v.get('key')]
                if kvs:
                    # Choose first IE key in the message and align it to a mock value
                    k = kvs[0].get('key')
                    suggestions.append({
                        "uid": it.get('uid'),
                        "message_id": it.get('message_id'),
                        "overrides": {k: "mock_aligned"},
                    })

            content_obj = {"conflicts": [], "alignments": {}, "suggestions": suggestions}
            resp = {
                "id": "mock",
                "object": "chat.completion",
                "choices": [
                    {"index": 0, "message": {"role": "assistant", "content": json.dumps(content_obj, ensure_ascii=False)}}
                ],
            }
            self._set_headers(200)
            self.wfile.write(json.dumps(resp).encode('utf-8'))
            return

        # Non-OpenAI mode fallback
        if data.get('task') == 'analyze_case_consistency':
            case = data.get('case') or {}
            items = case.get('items') or []
            suggestions = []
            for it in items:
                kvs = [v for v in (it.get('ie_values') or []) if v.get('key')]
                if kvs:
                    k = kvs[0].get('key')
                    suggestions.append({
                        "uid": it.get('uid'),
                        "message_id": it.get('message_id'),
                        "overrides": {k: "mock_aligned"},
                    })
            resp = {"conflicts": [], "alignments": {}, "suggestions": suggestions}
            self._set_headers(200)
            self.wfile.write(json.dumps(resp).encode('utf-8'))
            return

        self._set_headers(404)
        self.wfile.write(json.dumps({"error": "not_found", "path": self.path}).encode('utf-8'))


def main():
    port = 8088
    httpd = HTTPServer(('localhost', port), Handler)
    print(f"Mock AI server running on http://localhost:{port}/v1")
    httpd.serve_forever()


if __name__ == '__main__':
    main()