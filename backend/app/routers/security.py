"""
Security Vulnerability Scanner
- Source-code scanner: walks a local project directory and applies regex patterns
- Website scanner:     probes a live URL for header, cookie, TLS, and path issues
"""
import os
import re
import ssl
import socket
import time
import uuid
import concurrent.futures
from pathlib import Path
from datetime import datetime, timezone
from typing import List
from urllib.parse import urlparse, urljoin

import httpx

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.user import User

router = APIRouter(prefix="/api/v1/security", tags=["security"])

# ── Config ─────────────────────────────────────────────────────────────────────
EXCLUDED_DIRS = {
    'node_modules', '.git', '__pycache__', '.venv', 'venv', 'env',
    'dist', 'build', '.next', 'packages', 'vendor', 'bower_components',
    '.mypy_cache', 'coverage', '.pytest_cache', 'target', 'bin', 'obj',
    '.idea', '.vscode', 'out', '.yarn', '.npm', 'site-packages',
    '.cache', '.turbo', '.svelte-kit', 'public', 'static',
    'migrations', '__generated__', 'generated', '.terraform',
}

SCANNABLE_EXT = {
    'py', 'js', 'jsx', 'ts', 'tsx', 'php', 'java', 'go',
    'rb', 'cs', 'cpp', 'c', 'h', 'env', 'sh', 'bash',
    'yaml', 'yml', 'xml', 'html', 'htm', 'json',
    'config', 'conf', 'ini', 'properties', 'toml',
}

MAX_FILE_BYTES = 512 * 1024   # 512 KB per file
MAX_SCAN_SECS  = 120          # total budget
MAX_PER_PATTERN_PER_FILE = 3  # avoid flooding

# Files that are always skipped regardless of extension.
# The scanner itself must be excluded — its fix_example strings contain
# intentionally vulnerable "WRONG" code that would trigger every pattern.
EXCLUDED_FILES = {
    'security.py',   # this scanner file
}

SEVERITY_ORDER = {'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3, 'INFO': 4}

# ── Context-aware validators (false positive suppression) ──────────────────────
#
# Each validator receives the full list of source lines and the 1-based line
# number of the regex match.  Return True to keep the finding, False to drop it.

def _validate_cookie(lines: list, line_num: int) -> bool:
    """Report only when the cookie call is missing httponly AND/OR secure."""
    window = '\n'.join(lines[max(0, line_num - 1):min(len(lines), line_num + 20)])
    has_httponly = bool(re.search(r'httponly\s*=\s*True', window, re.IGNORECASE))
    has_secure   = bool(re.search(
        r'secure\s*=\s*(True|settings\.|os\.environ|getenv)',
        window, re.IGNORECASE,
    ))
    return not (has_httponly and has_secure)


def _validate_dangerous_html(lines: list, line_num: int) -> bool:
    """Suppress dangerouslySetInnerHTML that is provably safe."""
    window   = '\n'.join(lines[max(0, line_num - 1):min(len(lines), line_num + 6)])
    # Look back up to 8 lines to detect <script ...> context.
    # Inside a <script> block JSON.stringify is NOT safe — a value like
    # `</script><script>...` breaks out of the script tag before the JS engine
    # sees it.  Always report these.
    pre_win  = '\n'.join(lines[max(0, line_num - 8):line_num + 1])
    if re.search(r'<script\b', pre_win, re.IGNORECASE):
        return True  # script-context: report regardless of JSON.stringify

    # Wrapped in explicit sanitizer call
    if re.search(r'(DOMPurify\.sanitize|sanitizeHTML|sanitize)\s*\(', window):
        return False
    # Server-controlled value serialised with JSON.stringify (non-script context)
    if re.search(r'JSON\.stringify\s*\(', window):
        return False
    # Static string literal — guaranteed no dynamic content
    if re.search(r'__html:\s*["\'][^"\'<>&]*["\']', window):
        return False
    # Passed through a markdown renderer that sanitizes internally
    if re.search(r'renderMarkdown\s*\(', window):
        return False
    return True


def _validate_debug(lines: list, line_num: int) -> bool:
    """Suppress DEBUG=True when the value comes from an env var / settings object."""
    line = lines[line_num - 1] if line_num <= len(lines) else ''
    if re.search(
        r'(os\.environ|environ\.get|os\.getenv|getenv\s*\(|settings\.|config\.)',
        line, re.IGNORECASE,
    ):
        return False
    return True


def _validate_http_url(lines: list, line_num: int) -> bool:
    """Suppress http:// for Docker-internal service names, env-var templates, and comments."""
    line = lines[line_num - 1] if line_num <= len(lines) else ''
    stripped = line.lstrip()
    # Pure comment lines
    if stripped.startswith(('#', '//', '*')):
        return False
    # Docker-compose internal service names
    _DOCKER = (
        r'http://(?:backend|frontend|db|redis|postgres|mysql|mongodb|nginx|app|api|'
        r'web|worker|celery|rabbitmq|minio|mailhog|smtp|database|cache|queue|broker|mail)'
        r'(?:[:/\s"\'\`\}]|$)'
    )
    if re.search(_DOCKER, line):
        return False
    # Environment-variable templates like ${NEXTAUTH_URL:-http://localhost} or http://host}
    if re.search(r'http://[^/\s]*[}\$]', line):
        return False
    return True


def _validate_hardcoded_creds(lines: list, line_num: int) -> bool:
    """Suppress credential findings whose value is clearly a placeholder or env-read."""
    line = lines[line_num - 1] if line_num <= len(lines) else ''
    # Value is dynamically read from the environment
    if re.search(
        r'(os\.environ|os\.getenv|environ\.get|getenv\s*\(|settings\.|config\.)',
        line, re.IGNORECASE,
    ):
        return False
    # Pure template WITHOUT hardcoded fallback: ${VAR} — safe
    # NOTE: ${VAR:-fallback} IS NOT suppressed because the fallback is a real secret
    if re.search(r'\$\{[\w_]+\}', line):          # ${VAR} — no :- fallback
        return False
    if re.search(r'%[\w_]+%', line):              # %VAR% Windows / batch style
        return False
    # Common placeholder / example values that should never be treated as real secrets
    if re.search(
        r'(your[_\-]|example|changeme|placeholder|dummy|test_secret|<[^>]+>'
        r'|xxx+|n\/?a\b|todo\b|replace[_\-]me|insert[_\-]here)',
        line, re.IGNORECASE,
    ):
        return False
    return True


def _validate_weak_random(lines: list, line_num: int) -> bool:
    """Only report Math.random() / random.random() when used near a security context.
    Using these for UI colours, animations, or layout jitter is fine — using them
    to generate tokens, session IDs, OTPs, or password-reset links is not."""
    window = '\n'.join(lines[max(0, line_num - 4):min(len(lines), line_num + 4)])
    _SEC = r'(token|session|secret|password|passwd|auth|csrf|nonce|otp|salt\b|key\b|credential|reset|signup|register)'
    return bool(re.search(_SEC, window, re.IGNORECASE))


def _validate_missing_auth(lines: list, line_num: int) -> bool:
    """Suppress MISSING_AUTH_CHECK when FastAPI Depends(get_current_user) is present
    in the route's function parameters (within the next 15 lines)."""
    window = '\n'.join(lines[max(0, line_num - 1):min(len(lines), line_num + 15)])
    if re.search(r'Depends\s*\(\s*get_current_user', window):
        return False
    if re.search(r'current_user\s*:', window):
        return False
    if re.search(r'(login_required|@requires_auth|@auth_required|require_auth)', window):
        return False
    return True


# DATABASE_URL_CREDS re-uses the same suppression logic as HARDCODED_CREDS.
_validate_database_url = _validate_hardcoded_creds

# Pattern-ID → validator.  Missing entry = no extra suppression (regex alone decides).
VALIDATORS: dict = {
    'INSECURE_COOKIE':     _validate_cookie,
    'XSS_DANGEROUS_HTML':  _validate_dangerous_html,
    'DEBUG_MODE':          _validate_debug,
    'HTTP_NOT_HTTPS':      _validate_http_url,
    'HARDCODED_CREDS':     _validate_hardcoded_creds,
    'DATABASE_URL_CREDS':  _validate_database_url,
    'WEAK_RANDOM':         _validate_weak_random,
    'MISSING_AUTH_CHECK':  _validate_missing_auth,
}

# ── Vulnerability Pattern Library ──────────────────────────────────────────────
PATTERNS = [

    # ═══════════ CRITICAL ═══════════════════════════════════════════════════

    {
        'id': 'SQL_FSTRING',
        'severity': 'CRITICAL',
        'category': 'SQL Injection',
        'title': 'SQL query built with f-string / format string',
        'description': (
            'Constructing SQL queries using Python f-strings or %-formatting '
            'allows attackers to inject arbitrary SQL, potentially exposing, '
            'modifying, or deleting your entire database.'
        ),
        'pattern': r'(execute|executemany|raw|query)\s*\(\s*(f"|f\'|"[^"]*%[sd]|\'[^\']*%[sd])',
        'languages': {'py', 'php', 'rb'},
        'fix_description': 'Use parameterized queries with placeholders. Never interpolate variables into SQL strings.',
        'fix_example': (
            '# WRONG:\n'
            'cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")\n\n'
            '# RIGHT:\n'
            'cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))\n'
            '# SQLAlchemy:\n'
            'db.execute(text("SELECT * FROM users WHERE id = :uid"), {"uid": user_id})'
        ),
        'owasp': 'A03:2021 – Injection',
        'references': 'https://owasp.org/Top10/A03_2021-Injection/',
    },
    {
        'id': 'SQL_CONCAT_JS',
        'severity': 'CRITICAL',
        'category': 'SQL Injection',
        'title': 'SQL query built with string concatenation',
        'description': (
            'Concatenating user-controlled input directly into SQL strings lets '
            'attackers inject SQL. Common targets: req.body, req.query, req.params.'
        ),
        'pattern': r'(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)[^\n]+\+\s*(req\.|request\.|params\.|query\.|body\.|args\.|input\b)',
        'languages': {'js', 'ts', 'jsx', 'tsx', 'php', 'java'},
        'fix_description': 'Use an ORM or parameterized/prepared statements.',
        'fix_example': (
            '// WRONG:\n'
            'db.query("SELECT * FROM users WHERE id = " + req.params.id)\n\n'
            '// RIGHT (node-postgres):\n'
            'db.query("SELECT * FROM users WHERE id = $1", [req.params.id])'
        ),
        'owasp': 'A03:2021 – Injection',
        'references': 'https://owasp.org/Top10/A03_2021-Injection/',
    },
    {
        'id': 'SQL_ORM_RAW',
        'severity': 'HIGH',
        'category': 'SQL Injection',
        'title': 'Raw SQL inside ORM with string interpolation',
        'description': (
            'Using .raw() or text() in an ORM with f-strings or concatenation '
            'bypasses the ORM\'s parameterization protection.'
        ),
        'pattern': r'(\.raw\(|\.execute\(|text\s*\()\s*f["\']',
        'languages': {'py', 'js', 'ts', 'jsx', 'tsx'},
        'fix_description': 'Always pass parameters separately, never embed them in the SQL string.',
        'fix_example': (
            '# WRONG:\n'
            'db.execute(text(f"SELECT * FROM users WHERE id = {uid}"))\n\n'
            '# RIGHT:\n'
            'db.execute(text("SELECT * FROM users WHERE id = :uid"), {"uid": uid})'
        ),
        'owasp': 'A03:2021 – Injection',
        'references': 'https://owasp.org/Top10/A03_2021-Injection/',
    },
    {
        'id': 'CMD_INJECTION_PY',
        'severity': 'CRITICAL',
        'category': 'Command Injection',
        'title': 'Shell command with dynamic / f-string argument',
        'description': (
            'os.system() or subprocess functions with f-strings let attackers '
            'inject shell commands and take full control of the server.'
        ),
        'pattern': r'(os\.system|os\.popen|subprocess\.(call|run|Popen|check_output|check_call))\s*\(\s*(f"|f\')',
        'languages': {'py'},
        'fix_description': 'Use subprocess with a list (never shell=True with user data). Validate all inputs.',
        'fix_example': (
            '# WRONG:\n'
            'os.system(f"convert {filename} output.png")\n\n'
            '# RIGHT:\n'
            'subprocess.run(["convert", safe_filename, "output.png"], capture_output=True)'
        ),
        'owasp': 'A03:2021 – Injection',
        'references': 'https://owasp.org/Top10/A03_2021-Injection/',
    },
    {
        'id': 'CMD_INJECTION_JS',
        'severity': 'CRITICAL',
        'category': 'Command Injection',
        'title': 'exec/spawn with template literal or concatenation',
        'description': (
            'Passing template literals or concatenated strings to exec/execSync/spawn '
            'allows command injection if any part is user-controlled.'
        ),
        'pattern': r'\b(exec|execSync|execFile)\s*\(\s*(`[^`]*\$\{|["\'][^"\']*["\'\s]*\+)',
        'languages': {'js', 'ts', 'jsx', 'tsx'},
        'fix_description': 'Use spawn/spawnSync with argument arrays, never string commands.',
        'fix_example': (
            '// WRONG:\n'
            'exec(`convert ${req.body.file} output.png`)\n\n'
            '// RIGHT:\n'
            'spawnSync("convert", [safeFile, "output.png"])'
        ),
        'owasp': 'A03:2021 – Injection',
        'references': 'https://owasp.org/Top10/A03_2021-Injection/',
    },
    {
        'id': 'EVAL_EXEC',
        'severity': 'CRITICAL',
        'category': 'Code Injection',
        'title': 'eval() / exec() with non-literal argument',
        'description': (
            'eval() and exec() that receive dynamic data execute arbitrary code. '
            'This is almost never legitimate and should be removed entirely.'
        ),
        'pattern': r'\beval\s*\(\s*(?!["\'\`]\s*["\'\`])[^)]{1,200}\)',
        'languages': {'py', 'js', 'ts', 'jsx', 'tsx', 'php', 'rb'},
        'fix_description': 'Remove eval/exec. Use JSON.parse for data, explicit switch statements for logic.',
        'fix_example': (
            '// WRONG:\n'
            'eval(userInput)\n\n'
            '// RIGHT:\n'
            'const data = JSON.parse(userInput)  // for data\n'
            '// or explicit handlers for control flow'
        ),
        'owasp': 'A03:2021 – Injection',
        'references': 'https://owasp.org/Top10/A03_2021-Injection/',
    },
    {
        'id': 'PICKLE',
        'severity': 'CRITICAL',
        'category': 'Insecure Deserialization',
        'title': 'pickle.loads / pickle.load on untrusted data',
        'description': (
            'Deserializing pickle data from untrusted sources allows arbitrary code '
            'execution. An attacker can craft a payload that runs any command on your server.'
        ),
        'pattern': r'pickle\.(loads?)\s*\(',
        'languages': {'py'},
        'fix_description': 'Use JSON or msgpack for data exchange. Never unpickle from external sources.',
        'fix_example': (
            '# WRONG:\n'
            'data = pickle.loads(request.body)\n\n'
            '# RIGHT:\n'
            'data = json.loads(request.body)  # use a safe format'
        ),
        'owasp': 'A08:2021 – Software and Data Integrity Failures',
        'references': 'https://owasp.org/Top10/A08_2021-Software_and_Data_Integrity_Failures/',
    },
    {
        'id': 'HARDCODED_KEY_PATTERN',
        'severity': 'CRITICAL',
        'category': 'Exposed Secrets',
        'title': 'Real API key / token detected in source',
        'description': (
            'A known secret pattern (OpenAI, AWS, GitHub, GitLab, Slack, Google) '
            'was detected. These credentials must be revoked and rotated immediately.'
        ),
        'pattern': r'(sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36,}|ghs_[a-zA-Z0-9]{36,}|glpat-[a-zA-Z0-9_\-]{20,}|xox[bpoa]-[0-9A-Za-z\-]{10,}|AIza[0-9A-Za-z\-_]{35})',
        'languages': {'py', 'js', 'ts', 'jsx', 'tsx', 'java', 'php', 'go', 'rb', 'cs', 'env', 'yaml', 'yml', 'json', 'toml', 'conf', 'config'},
        'fix_description': '1. Revoke the key immediately via the provider dashboard. 2. Store in env vars. 3. Add .env to .gitignore.',
        'fix_example': (
            '# WRONG:\n'
            'OPENAI_API_KEY = "sk-abc123..."\n\n'
            '# RIGHT (.env file, never committed):\n'
            'OPENAI_API_KEY=sk-abc123...\n\n'
            '# In code:\n'
            'api_key = os.environ["OPENAI_API_KEY"]'
        ),
        'owasp': 'A07:2021 – Identification and Authentication Failures',
        'references': 'https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/',
    },
    {
        'id': 'JWT_NONE',
        'severity': 'CRITICAL',
        'category': 'Authentication Bypass',
        'title': 'JWT algorithm "none" — signature verification disabled',
        'description': (
            'The JWT "none" algorithm completely disables signature verification. '
            'Any attacker can forge valid-looking tokens and impersonate any user.'
        ),
        'pattern': r'algorithm[s]?\s*=\s*[\[\(]?\s*["\']none["\']',
        'languages': {'py', 'js', 'ts', 'jsx', 'tsx', 'java', 'go', 'rb'},
        'fix_description': 'Always specify a strong algorithm (HS256, RS256) and reject "none".',
        'fix_example': (
            '# WRONG:\n'
            'jwt.decode(token, SECRET, algorithms=["none"])\n\n'
            '# RIGHT:\n'
            'jwt.decode(token, SECRET, algorithms=["HS256"])'
        ),
        'owasp': 'A07:2021 – Identification and Authentication Failures',
        'references': 'https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/',
    },

    # ═══════════ HIGH ═══════════════════════════════════════════════════════

    {
        'id': 'HARDCODED_CREDS',
        'severity': 'HIGH',
        'category': 'Exposed Secrets',
        'title': 'Hardcoded password, secret, or API key in source',
        'description': (
            'Credentials embedded directly in source code are exposed to anyone '
            'with repository access and cannot be rotated without a new deployment.'
        ),
        # Matches plain `KEY = "value"` AND Pydantic model `KEY: SomeType = "value"`
        'pattern': r'(?i)(password|passwd|pwd|db_pass|secret_key|api_key|apikey|auth_token|access_token|private_key|client_secret)\s*(?::\s*[\w\[\], |]+\s*)?=\s*["\'][^"\']{4,}["\']',
        'languages': {'py', 'js', 'ts', 'jsx', 'tsx', 'java', 'php', 'go', 'rb', 'cs', 'config', 'conf', 'ini', 'properties', 'toml'},
        'fix_description': 'Move all secrets to environment variables. Use a .env file (gitignored) locally, and proper secrets management in production.',
        'fix_example': (
            '# WRONG:\n'
            'DB_PASSWORD = "supersecret123"\n\n'
            '# RIGHT:\n'
            'DB_PASSWORD = os.environ.get("DB_PASSWORD")\n'
            '# Or use python-dotenv:\n'
            'from dotenv import load_dotenv; load_dotenv()'
        ),
        'owasp': 'A07:2021 – Identification and Authentication Failures',
        'references': 'https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/',
    },
    {
        'id': 'DATABASE_URL_CREDS',
        'severity': 'HIGH',
        'category': 'Exposed Secrets',
        'title': 'Database connection URL with hardcoded credentials',
        'description': (
            'A database connection string has credentials embedded directly in the URL. '
            'Anyone with source or config access can read the database password.'
        ),
        'pattern': r'(?i)(database_url|db_url|connection_string|connection_uri)\s*(?::\s*[\w\[\], |]+\s*)?[=:]\s*["\']?\w[\w+]*://[^:\s]{1,60}:[^@\s]{3,}@',
        'languages': {'py', 'js', 'ts', 'env', 'yaml', 'yml', 'toml', 'conf', 'config'},
        'fix_description': 'Extract the password into an environment variable and build the URL at runtime.',
        'fix_example': (
            '# WRONG:\n'
            'DATABASE_URL = "postgresql://user:secret@db:5432/mydb"\n\n'
            '# RIGHT:\n'
            'DATABASE_URL = os.environ["DATABASE_URL"]  # full URL from env\n'
            '# Or build it:\n'
            'DATABASE_URL = f"postgresql://{os.environ[\'DB_USER\']}:{os.environ[\'DB_PASS\']}@db:5432/mydb"'
        ),
        'owasp': 'A07:2021 – Identification and Authentication Failures',
        'references': 'https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/',
    },
    {
        'id': 'XSS_INNERHTML',
        'severity': 'HIGH',
        'category': 'Cross-Site Scripting (XSS)',
        'title': 'innerHTML assigned with dynamic data',
        'description': (
            'Assigning unvalidated data to innerHTML renders it as HTML, '
            'allowing script injection in victim browsers (stored or reflected XSS).'
        ),
        'pattern': r'\.innerHTML\s*[+]?=\s*(?![\'"]\s*[\'"]\s*;)',
        'languages': {'js', 'ts', 'jsx', 'tsx', 'html', 'htm', 'php'},
        'fix_description': 'Use textContent for plain text, or sanitize with DOMPurify before innerHTML.',
        'fix_example': (
            '// WRONG:\n'
            'el.innerHTML = userInput\n\n'
            '// RIGHT:\n'
            'el.textContent = userInput              // plain text\n'
            'el.innerHTML = DOMPurify.sanitize(html) // rich HTML'
        ),
        'owasp': 'A03:2021 – Injection',
        'references': 'https://owasp.org/Top10/A03_2021-Injection/',
    },
    {
        'id': 'XSS_DANGEROUS_HTML',
        'severity': 'HIGH',
        'category': 'Cross-Site Scripting (XSS)',
        'title': 'dangerouslySetInnerHTML with unsanitized data',
        'description': (
            'React\'s dangerouslySetInnerHTML bypasses its built-in XSS protection. '
            'Dynamic content must be sanitized before passing here.'
        ),
        'pattern': r'dangerouslySetInnerHTML\s*=\s*\{',
        'languages': {'js', 'jsx', 'ts', 'tsx'},
        'fix_description': 'Sanitize with DOMPurify before setting dangerouslySetInnerHTML.',
        'fix_example': (
            '// WRONG:\n'
            'dangerouslySetInnerHTML={{ __html: userContent }}\n\n'
            '// RIGHT:\n'
            'import DOMPurify from "dompurify"\n'
            'dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userContent) }}'
        ),
        'owasp': 'A03:2021 – Injection',
        'references': 'https://owasp.org/Top10/A03_2021-Injection/',
    },
    {
        'id': 'PATH_TRAVERSAL',
        'severity': 'HIGH',
        'category': 'Path Traversal',
        'title': 'File operation with user-supplied path',
        'description': (
            'Reading or writing files using paths derived from user input allows '
            'directory traversal (../../../etc/passwd). Attackers can read any file '
            'on the server the process has access to.'
        ),
        'pattern': r'\bopen\s*\(\s*(request\.|req\.|args\.|params\.|body\.|f["\'].*\{)',
        'languages': {'py', 'php', 'rb'},
        'fix_description': 'Resolve to absolute path and assert it starts with your allowed base directory.',
        'fix_example': (
            '# WRONG:\n'
            'with open(request.args["file"]) as f: ...\n\n'
            '# RIGHT:\n'
            'BASE = "/app/uploads"\n'
            'safe = os.path.abspath(os.path.join(BASE, filename))\n'
            'if not safe.startswith(BASE):\n'
            '    raise HTTPException(400, "Invalid path")\n'
            'with open(safe) as f: ...'
        ),
        'owasp': 'A01:2021 – Broken Access Control',
        'references': 'https://owasp.org/Top10/A01_2021-Broken_Access_Control/',
    },
    {
        'id': 'SSRF',
        'severity': 'HIGH',
        'category': 'Server-Side Request Forgery (SSRF)',
        'title': 'Outbound HTTP request with user-supplied URL',
        'description': (
            'Making HTTP requests to URLs derived from user input allows SSRF — '
            'attackers can probe internal services, cloud metadata endpoints '
            '(169.254.169.254), and internal databases.'
        ),
        'pattern': r'(requests\.(get|post|put|delete)|httpx\.(get|post)|fetch|axios\.(get|post))\s*\(\s*(req\.|request\.|params\.|query\.|body\.|args\.|f["\'].*\{)',
        'languages': {'py', 'js', 'ts', 'jsx', 'tsx'},
        'fix_description': 'Validate URLs against an allowlist of permitted external domains. Block private IP ranges.',
        'fix_example': (
            '# WRONG:\n'
            'requests.get(request.args["url"])\n\n'
            '# RIGHT:\n'
            'from urllib.parse import urlparse\n'
            'ALLOWED = {"api.example.com", "cdn.example.com"}\n'
            'parsed = urlparse(user_url)\n'
            'if parsed.hostname not in ALLOWED:\n'
            '    raise ValueError("URL not allowed")\n'
            'requests.get(user_url)'
        ),
        'owasp': 'A10:2021 – Server-Side Request Forgery',
        'references': 'https://owasp.org/Top10/A10_2021-Server-Side_Request_Forgery_%28SSRF%29/',
    },
    {
        'id': 'WEAK_HASH',
        'severity': 'HIGH',
        'category': 'Weak Cryptography',
        'title': 'MD5 or SHA-1 used for hashing',
        'description': (
            'MD5 and SHA-1 are cryptographically broken. They should never be used '
            'for password hashing, and their use for data integrity is also questionable.'
        ),
        'pattern': r'\b(hashlib\.(md5|sha1)\s*\(|md5\s*\(|sha1\s*\()',
        'languages': {'py', 'php', 'java', 'js', 'ts', 'jsx', 'tsx', 'rb'},
        'fix_description': 'For passwords: use bcrypt/argon2/scrypt. For data integrity: use SHA-256 or SHA-3.',
        'fix_example': (
            '# WRONG:\n'
            'hashlib.md5(password.encode()).hexdigest()\n\n'
            '# RIGHT (passwords):\n'
            'import bcrypt\n'
            'bcrypt.hashpw(password.encode(), bcrypt.gensalt())\n\n'
            '# RIGHT (integrity):\n'
            'hashlib.sha256(data).hexdigest()'
        ),
        'owasp': 'A02:2021 – Cryptographic Failures',
        'references': 'https://owasp.org/Top10/A02_2021-Cryptographic_Failures/',
    },
    {
        'id': 'OPEN_REDIRECT',
        'severity': 'HIGH',
        'category': 'Open Redirect',
        'title': 'Redirect to user-supplied URL',
        'description': (
            'Redirecting to user-controlled URLs enables phishing: attackers craft '
            'links like yoursite.com/login?next=evil.com that appear legitimate.'
        ),
        'pattern': r'(redirect\s*\(|location\.href\s*=|response\.redirect\s*\()\s*(req\.|request\.|params\.|query\.|body\.|args\.)',
        'languages': {'py', 'js', 'ts', 'jsx', 'tsx', 'php', 'rb', 'java'},
        'fix_description': 'Validate redirect targets against an allowlist of safe paths.',
        'fix_example': (
            '# WRONG:\n'
            'return redirect(request.args.get("next"))\n\n'
            '# RIGHT:\n'
            'SAFE_PATHS = {"/dashboard", "/profile", "/home"}\n'
            'next_url = request.args.get("next", "/dashboard")\n'
            'if next_url not in SAFE_PATHS:\n'
            '    next_url = "/dashboard"\n'
            'return redirect(next_url)'
        ),
        'owasp': 'A01:2021 – Broken Access Control',
        'references': 'https://owasp.org/Top10/A01_2021-Broken_Access_Control/',
    },

    # ═══════════ MEDIUM ═════════════════════════════════════════════════════

    {
        'id': 'DEBUG_MODE',
        'severity': 'MEDIUM',
        'category': 'Security Misconfiguration',
        'title': 'Debug mode appears to be enabled',
        'description': (
            'Debug mode exposes detailed stack traces, internal variable values, '
            'and may enable interactive debuggers accessible over HTTP.'
        ),
        'pattern': r'(?i)\bDEBUG\s*=\s*(True|1|true|yes)\b',
        'languages': {'py', 'js', 'ts', 'jsx', 'tsx', 'config', 'conf', 'ini', 'yaml', 'yml', 'env', 'toml'},
        'fix_description': 'Read DEBUG from environment variables and default to False in production.',
        'fix_example': (
            '# WRONG:\n'
            'DEBUG = True\n\n'
            '# RIGHT:\n'
            'import os\n'
            'DEBUG = os.environ.get("DEBUG", "false").lower() == "true"'
        ),
        'owasp': 'A05:2021 – Security Misconfiguration',
        'references': 'https://owasp.org/Top10/A05_2021-Security_Misconfiguration/',
    },
    {
        'id': 'HTTP_NOT_HTTPS',
        'severity': 'MEDIUM',
        'category': 'Insecure Transport',
        'title': 'Non-localhost HTTP URL (should be HTTPS)',
        'description': (
            'Unencrypted HTTP connections expose data to man-in-the-middle attacks. '
            'All external communication must use HTTPS.'
        ),
        'pattern': r'http://(?!(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?:[:/\s"\'\`\}]|$)|example\.com|test\.)',
        'languages': {'py', 'js', 'ts', 'jsx', 'tsx', 'java', 'php', 'go', 'yaml', 'yml', 'json', 'html', 'xml', 'toml'},
        'fix_description': 'Replace all external http:// with https://.',
        'fix_example': (
            '// WRONG:\n'
            'fetch("http://api.example.com/data")\n\n'
            '// RIGHT:\n'
            'fetch("https://api.example.com/data")'
        ),
        'owasp': 'A02:2021 – Cryptographic Failures',
        'references': 'https://owasp.org/Top10/A02_2021-Cryptographic_Failures/',
    },
    {
        'id': 'WEAK_RANDOM',
        'severity': 'MEDIUM',
        'category': 'Insecure Randomness',
        'title': 'Non-cryptographic random for security context',
        'description': (
            'Math.random() and random.random() are predictable PRNGs. '
            'They must not be used for tokens, session IDs, OTPs, or password reset links.'
        ),
        'pattern': r'\b(Math\.random\(\)|random\.random\(\)|random\.randint\b)',
        'languages': {'js', 'ts', 'jsx', 'tsx', 'py'},
        'fix_description': 'Use crypto.getRandomValues() / crypto.randomBytes() in JS, or the secrets module in Python.',
        'fix_example': (
            '// WRONG (JS):\n'
            'const token = Math.random().toString(36).slice(2)\n\n'
            '// RIGHT (JS):\n'
            'const token = crypto.randomBytes(32).toString("hex")\n\n'
            '# WRONG (Python):\n'
            'token = str(random.random())\n\n'
            '# RIGHT (Python):\n'
            'import secrets\n'
            'token = secrets.token_urlsafe(32)'
        ),
        'owasp': 'A02:2021 – Cryptographic Failures',
        'references': 'https://owasp.org/Top10/A02_2021-Cryptographic_Failures/',
    },
    {
        'id': 'CORS_WILDCARD',
        'severity': 'MEDIUM',
        'category': 'Security Misconfiguration',
        'title': 'CORS wildcard (*) origin — all sites allowed',
        'description': (
            'Allow-Origin: * permits any website to read responses from your API, '
            'including with credentials if misconfigured.'
        ),
        'pattern': r'(allow_origins\s*=\s*\[\s*["\*"]\s*\]|Access-Control-Allow-Origin[:\s]+\*|cors\s*\(\s*\{[^}]*origin[^}]*\*)',
        'languages': {'py', 'js', 'ts', 'jsx', 'tsx', 'java', 'php', 'yaml', 'yml', 'conf', 'config'},
        'fix_description': 'Restrict CORS to specific trusted origins.',
        'fix_example': (
            '# WRONG:\n'
            'allow_origins=["*"]\n\n'
            '# RIGHT:\n'
            'allow_origins=[\n'
            '    "https://app.yourdomain.com",\n'
            '    "https://yourdomain.com",\n'
            ']'
        ),
        'owasp': 'A05:2021 – Security Misconfiguration',
        'references': 'https://owasp.org/Top10/A05_2021-Security_Misconfiguration/',
    },
    {
        'id': 'SENSITIVE_LOG',
        'severity': 'MEDIUM',
        'category': 'Information Exposure',
        'title': 'Sensitive data may be written to logs',
        'description': (
            'Logging passwords, tokens, or PII creates an audit trail readable by '
            'anyone with log access and may violate regulations (GDPR, PCI-DSS).'
        ),
        'pattern': r'(?i)(print|console\.(log|warn|error)|logger\.(info|debug|warning|error)|logging\.(info|debug|warning|error))\s*\([^)]*?(password|passwd|token|secret|credit_card|ssn|api_key)',
        'languages': {'py', 'js', 'ts', 'jsx', 'tsx', 'java', 'php', 'go', 'rb'},
        'fix_description': 'Never log sensitive data. Redact or omit passwords, tokens, and PII from all log statements.',
        'fix_example': (
            '# WRONG:\n'
            'logger.info(f"User login: {username}, password={password}")\n\n'
            '# RIGHT:\n'
            'logger.info(f"User login: {username}")  # never log password'
        ),
        'owasp': 'A09:2021 – Security Logging and Monitoring Failures',
        'references': 'https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/',
    },
    {
        'id': 'INSECURE_COOKIE',
        'severity': 'MEDIUM',
        'category': 'Insecure Cookie',
        'title': 'Cookie set without Secure / HttpOnly flags',
        'description': (
            'Cookies without Secure are sent over HTTP (MITM risk). '
            'Cookies without HttpOnly can be read by JavaScript (XSS risk).'
        ),
        'pattern': r'set_cookie\s*\(',
        'languages': {'py', 'php', 'java', 'rb'},
        'fix_description': 'Always set httponly=True, secure=True, and samesite="Lax" on session cookies.',
        'fix_example': (
            '# WRONG:\n'
            'response.set_cookie("session", token)\n\n'
            '# RIGHT:\n'
            'response.set_cookie(\n'
            '    "session", token,\n'
            '    httponly=True,\n'
            '    secure=True,\n'
            '    samesite="Lax",\n'
            '    max_age=3600,\n'
            ')'
        ),
        'owasp': 'A02:2021 – Cryptographic Failures',
        'references': 'https://owasp.org/Top10/A02_2021-Cryptographic_Failures/',
    },
    {
        'id': 'LOCALSTORAGE_TOKEN',
        'severity': 'MEDIUM',
        'category': 'Insecure Storage',
        'title': 'Sensitive token stored in localStorage',
        'description': (
            'localStorage is accessible to all JavaScript on the page. '
            'Storing JWTs or session tokens there makes them vulnerable to XSS theft.'
        ),
        'pattern': r'localStorage\.(setItem|getItem)\s*\([^)]*?(token|jwt|auth|session|password|secret)',
        'languages': {'js', 'ts', 'jsx', 'tsx'},
        'fix_description': 'Use HttpOnly cookies for session tokens. If localStorage is required, accept the XSS risk explicitly.',
        'fix_example': (
            '// WRONG:\n'
            'localStorage.setItem("authToken", token)\n\n'
            '// RIGHT: Use HttpOnly cookie set by the server\n'
            '// The browser sends it automatically — JS cannot read it'
        ),
        'owasp': 'A02:2021 – Cryptographic Failures',
        'references': 'https://owasp.org/Top10/A02_2021-Cryptographic_Failures/',
    },
    {
        'id': 'MISSING_AUTH_CHECK',
        'severity': 'MEDIUM',
        'category': 'Broken Access Control',
        'title': 'Route handler with no visible auth check',
        'description': (
            'API route handlers that handle sensitive operations (delete, update, admin) '
            'without an authorization check may be accessible to any user.'
        ),
        'pattern': r'@(app|router)\.(delete|put|patch)\s*\([^)]+\)\s*\n(?:async\s+)?def\s+\w+\s*\([^)]*\)\s*:(?!\s*.*\b(auth|current_user|require|login_required|permission))',
        'languages': {'py'},
        'fix_description': 'Add authentication and authorization dependencies to every sensitive route.',
        'fix_example': (
            '# WRONG:\n'
            '@router.delete("/{item_id}")\n'
            'def delete_item(item_id: int, db: Session = Depends(get_db)):\n'
            '    ...\n\n'
            '# RIGHT:\n'
            '@router.delete("/{item_id}")\n'
            'def delete_item(\n'
            '    item_id: int,\n'
            '    db: Session = Depends(get_db),\n'
            '    current_user: User = Depends(get_current_user),  # auth required\n'
            '):\n'
            '    ...'
        ),
        'owasp': 'A01:2021 – Broken Access Control',
        'references': 'https://owasp.org/Top10/A01_2021-Broken_Access_Control/',
    },

    # ═══════════ LOW ════════════════════════════════════════════════════════

    {
        'id': 'TODO_SECURITY',
        'severity': 'LOW',
        'category': 'Security Debt',
        'title': 'Security-related TODO / FIXME comment',
        'description': 'A TODO or FIXME comment references a security concern that has not been resolved.',
        'pattern': r'(?i)\b(TODO|FIXME|HACK|XXX)\b[^\n]*(security|auth|vuln|injection|xss|csrf|password|token|encrypt|sanitiz)',
        'languages': {'py', 'js', 'ts', 'jsx', 'tsx', 'java', 'php', 'go', 'rb', 'cs', 'html'},
        'fix_description': 'Address this security debt. Do not ship known security issues.',
        'fix_example': '// Implement the security fix described in the comment',
        'owasp': 'A05:2021 – Security Misconfiguration',
        'references': 'https://owasp.org/Top10/A05_2021-Security_Misconfiguration/',
    },
    {
        'id': 'COMMENTED_CREDS',
        'severity': 'LOW',
        'category': 'Exposed Secrets',
        'title': 'Commented-out credentials',
        'description': 'Credentials in comments persist in git history even after removal.',
        'pattern': r'(#|//)\s*(password|passwd|secret|api_key|token)\s*[:=]\s*\S{4,}',
        'languages': {'py', 'js', 'ts', 'jsx', 'tsx', 'java', 'php', 'go', 'rb', 'cs'},
        'fix_description': 'Remove the comment and rotate any credential that was exposed.',
        'fix_example': '// Remove this entire line — and rotate the credential',
        'owasp': 'A07:2021 – Identification and Authentication Failures',
        'references': 'https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/',
    },
    {
        'id': 'DOCUMENT_WRITE',
        'severity': 'LOW',
        'category': 'Cross-Site Scripting (XSS)',
        'title': 'document.write() usage',
        'description': 'document.write() with dynamic content is an XSS vector and blocks page rendering.',
        'pattern': r'document\.write\s*\(',
        'languages': {'js', 'ts', 'jsx', 'tsx', 'html', 'htm', 'php'},
        'fix_description': 'Replace with DOM APIs (createElement, textContent, appendChild).',
        'fix_example': (
            '// WRONG:\n'
            'document.write("<p>" + content + "</p>")\n\n'
            '// RIGHT:\n'
            'const p = document.createElement("p")\n'
            'p.textContent = content\n'
            'document.body.appendChild(p)'
        ),
        'owasp': 'A03:2021 – Injection',
        'references': 'https://owasp.org/Top10/A03_2021-Injection/',
    },
    {
        'id': 'ENV_FILE_SECRETS',
        'severity': 'INFO',
        'category': 'Configuration',
        'title': '.env file with secrets detected',
        'description': '.env files should never be committed to source control. Verify this file is in .gitignore.',
        'pattern': r'^\s*([\w_]+=.{6,})$',
        'languages': {'env'},
        'fix_description': 'Add .env to .gitignore immediately. If already committed, rotate all secrets.',
        'fix_example': '# .gitignore\n.env\n.env.local\n.env.production',
        'owasp': 'A07:2021 – Identification and Authentication Failures',
        'references': 'https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/',
    },
]

# ── Helpers ────────────────────────────────────────────────────────────────────

def _resolve_path(raw: str) -> Path:
    """Translate Windows host paths to Docker-mounted equivalents."""
    raw = raw.strip().rstrip('/\\')
    if raw.lower().startswith('c:\\') or raw.lower().startswith('c:/'):
        raw = '/hostc/' + raw[3:].replace('\\', '/')
    elif len(raw) >= 2 and raw[1] == ':':
        # Other drive letters: D:\, E:\, etc.
        raw = f'/host{raw[0].lower()}/' + raw[3:].replace('\\', '/')
    return Path(raw)


def _snippet(lines: list, line_num: int, context: int = 2) -> str:
    start = max(0, line_num - context - 1)
    end   = min(len(lines), line_num + context)
    return '\n'.join(f"{start + i + 1:4}: {lines[start + i]}" for i in range(end - start))


# ── Schemas ────────────────────────────────────────────────────────────────────

class ScanRequest(BaseModel):
    path: str
    project_name: str = ""


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/scan")
def scan_project(
    body: ScanRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scan_root = _resolve_path(body.path)
    if not scan_root.exists():
        raise HTTPException(400, f"Path not found: {scan_root}")
    if not scan_root.is_dir():
        raise HTTPException(400, "Path must be a directory, not a file")

    start = time.monotonic()
    findings: list = []
    files_scanned = 0
    files_skipped = 0

    # Pre-compile all regex patterns
    compiled = []
    for pat in PATTERNS:
        try:
            compiled.append({
                **pat,
                '_re': re.compile(pat['pattern'], re.IGNORECASE | re.MULTILINE),
            })
        except re.error:
            pass

    timed_out = False
    for dirpath, dirnames, filenames in os.walk(scan_root):
        if time.monotonic() - start > MAX_SCAN_SECS:
            timed_out = True
            break

        # Prune excluded dirs in-place so os.walk won't descend into them
        dirnames[:] = [
            d for d in dirnames
            if d not in EXCLUDED_DIRS and not d.startswith('.')
        ]

        for fname in filenames:
            if time.monotonic() - start > MAX_SCAN_SECS:
                timed_out = True
                break

            fpath   = Path(dirpath) / fname
            ext     = fpath.suffix.lower().lstrip('.')
            rel     = str(fpath.relative_to(scan_root)).replace('\\', '/')

            if ext not in SCANNABLE_EXT:
                files_skipped += 1
                continue

            # Skip files that are explicitly excluded (e.g. this scanner itself)
            if fname in EXCLUDED_FILES:
                files_skipped += 1
                continue

            try:
                size = fpath.stat().st_size
                if size > MAX_FILE_BYTES:
                    files_skipped += 1
                    continue
                content = fpath.read_text(encoding='utf-8', errors='ignore')
            except Exception:
                files_skipped += 1
                continue

            files_scanned += 1
            lines = content.splitlines()

            # Per-file hit counter per pattern (avoid flooding)
            pat_hits: dict = {}

            for pat in compiled:
                if 'languages' in pat and ext not in pat['languages']:
                    continue
                if pat_hits.get(pat['id'], 0) >= MAX_PER_PATTERN_PER_FILE:
                    continue

                for match in pat['_re'].finditer(content):
                    if pat_hits.get(pat['id'], 0) >= MAX_PER_PATTERN_PER_FILE:
                        break

                    line_num = content[:match.start()].count('\n') + 1

                    # ── String-literal heuristic ──────────────────────────────
                    # A line whose first non-whitespace char is a quote or hash is
                    # almost certainly documentation / a string value, not live code.
                    matched_line = lines[line_num - 1].lstrip()
                    if matched_line.startswith(("'", '"', 'f"', "f'", '#')):
                        continue

                    # ── Context-aware validator ────────────────────────────────
                    # Pattern-specific Python function that inspects surrounding
                    # lines to filter out false positives the regex can't see.
                    validator = VALIDATORS.get(pat['id'])
                    if validator and not validator(lines, line_num):
                        continue

                    findings.append({
                        'id':             f"{pat['id']}_{rel}_{line_num}",
                        'pattern_id':     pat['id'],
                        'severity':       pat['severity'],
                        'category':       pat['category'],
                        'title':          pat['title'],
                        'description':    pat['description'],
                        'file':           rel,
                        'line':           line_num,
                        'code_snippet':   _snippet(lines, line_num),
                        'matched_text':   match.group(0)[:300],
                        'fix_description': pat['fix_description'],
                        'fix_example':    pat['fix_example'],
                        'owasp':          pat.get('owasp', ''),
                        'references':     pat.get('references', ''),
                    })
                    pat_hits[pat['id']] = pat_hits.get(pat['id'], 0) + 1

    # Sort: severity then file then line
    findings.sort(key=lambda f: (
        SEVERITY_ORDER.get(f['severity'], 99),
        f['file'],
        f['line'],
    ))

    stats = {
        'files_scanned': files_scanned,
        'files_skipped': files_skipped,
        'total':         len(findings),
        'critical':      sum(1 for f in findings if f['severity'] == 'CRITICAL'),
        'high':          sum(1 for f in findings if f['severity'] == 'HIGH'),
        'medium':        sum(1 for f in findings if f['severity'] == 'MEDIUM'),
        'low':           sum(1 for f in findings if f['severity'] == 'LOW'),
        'info':          sum(1 for f in findings if f['severity'] == 'INFO'),
        'scan_seconds':  round(time.monotonic() - start, 2),
        'timed_out':     timed_out,
    }

    project_name = body.project_name.strip() or scan_root.name

    return {
        'project_name': project_name,
        'project_path': body.path,
        'scanned_at':   datetime.now(timezone.utc).isoformat(),
        'stats':        stats,
        'findings':     findings,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  WEBSITE / URL SCANNER
# ══════════════════════════════════════════════════════════════════════════════

_URL_TIMEOUT      = 10   # seconds per main request
_PATH_TIMEOUT     = 6    # seconds for sensitive-path probes
_MAX_PATH_WORKERS = 8    # concurrent path-probe threads

# ── Analytics / tracking cookies that legitimately need JS access ─────────────
# Flagging these for missing HttpOnly is a false positive — they are designed
# to be read by JS (Google Analytics, Meta Pixel, etc.)
_ANALYTICS_PREFIXES = (
    '_ga', '_gid', '_gat', '_fbp', '_fbc', '_gcl', '_pin_',
    '_uet', '__utm', '_pk_', 'ide', 'nid', 'dsid', 'aid', 'taid',
)

def _is_analytics_cookie(name: str) -> bool:
    nl = name.lower()
    return any(nl.startswith(p) for p in _ANALYTICS_PREFIXES)


# ── Content validators for sensitive-path probes ──────────────────────────────
# Each validator receives the first 4 KB of response text and returns True only
# when the content really is the sensitive file we're looking for.
# This defeats both soft-404 pages (servers that return HTTP 200 for every path)
# and incidental collisions (a path that happens to exist but isn't the secret).

def _is_real_env_file(content: str) -> bool:
    """Real .env files contain at least one KEY=value line."""
    lines = [l.strip() for l in content.splitlines()
             if l.strip() and not l.strip().startswith('#')]
    return any(re.match(r'^[A-Za-z_][A-Za-z0-9_]*\s*=', l) for l in lines)

def _is_real_git_head(content: str) -> bool:
    c = content.strip()
    return c.startswith('ref:') or bool(re.match(r'^[0-9a-f]{40}$', c))

def _is_real_git_config(content: str) -> bool:
    return bool(re.search(r'^\[(?:core|remote|branch)', content, re.MULTILINE))

def _is_real_phpinfo(content: str) -> bool:
    return 'PHP Version' in content or 'phpinfo()' in content

def _is_real_wpconfig(content: str) -> bool:
    return any(k in content for k in ('DB_PASSWORD', 'DB_NAME', 'table_prefix', 'AUTH_KEY'))

def _is_real_htpasswd(content: str) -> bool:
    # Apache htpasswd entries look like: username:$apr1$... or username:$2y$...
    return bool(re.search(r'^\S+:\$(?:apr1|2[ay])\$', content, re.MULTILINE))

def _is_real_sql_dump(content: str) -> bool:
    markers = ('CREATE TABLE', 'INSERT INTO', '-- MySQL', '-- PostgreSQL',
               'DROP TABLE', 'mysqldump', 'pg_dump')
    return any(m in content for m in markers)

def _is_real_actuator_env(content: str) -> bool:
    return '"propertySources"' in content or '"activeProfiles"' in content

def _is_real_server_status(content: str) -> bool:
    return 'Apache Server Status' in content or 'Server Version:' in content


# ── HTTP Security Header checks ───────────────────────────────────────────────
_HEADER_CHECKS = [
    {
        'id': 'MISSING_HSTS',
        'header': 'strict-transport-security',
        'severity': 'HIGH',
        'category': 'HTTP Security Headers',
        'title': 'Missing HTTP Strict Transport Security (HSTS)',
        'description': (
            'HSTS tells browsers to connect only over HTTPS for the next year. '
            'Without it, attackers can silently downgrade connections to HTTP '
            '(SSL-stripping attack) even on users who typed https://'
        ),
        'fix_description': 'Set the Strict-Transport-Security header with at least max-age=31536000.',
        'fix_example': (
            '# Nginx:\n'
            'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload";\n\n'
            '# Apache:\n'
            'Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"\n\n'
            '# Express (Node.js):\n'
            'app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }))'
        ),
        'owasp': 'A02:2021 – Cryptographic Failures',
        'references': 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security',
        'https_only': True,
    },
    {
        'id': 'MISSING_CSP',
        'header': 'content-security-policy',
        'severity': 'MEDIUM',
        'category': 'HTTP Security Headers',
        'title': 'Missing Content Security Policy (CSP)',
        'description': (
            'CSP prevents XSS by restricting which scripts, styles, and resources '
            'the browser is permitted to load. Without it, any injected script executes freely.'
        ),
        'fix_description': "Add a Content-Security-Policy header. Start with default-src 'self' and loosen as needed.",
        'fix_example': (
            "# Nginx:\n"
            "add_header Content-Security-Policy \"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'\";\n\n"
            '# Apache:\n'
            "Header always set Content-Security-Policy \"default-src 'self'\"\n\n"
            '# Express:\n'
            'app.use(helmet.contentSecurityPolicy())'
        ),
        'owasp': 'A03:2021 – Injection',
        'references': 'https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP',
    },
    {
        'id': 'MISSING_XFO',
        'header': 'x-frame-options',
        'severity': 'MEDIUM',
        'category': 'HTTP Security Headers',
        'title': 'Missing X-Frame-Options (Clickjacking risk)',
        'description': (
            'Without X-Frame-Options (or CSP frame-ancestors), attackers embed your page '
            'in an invisible iframe and trick users into clicking on it (clickjacking).'
        ),
        'fix_description': "Set X-Frame-Options: DENY, or use CSP frame-ancestors 'none'.",
        'fix_example': (
            '# Nginx:\nadd_header X-Frame-Options "DENY";\n\n'
            '# Apache:\nHeader always set X-Frame-Options "DENY"\n\n'
            "# CSP alternative (preferred):\nContent-Security-Policy: frame-ancestors 'none'"
        ),
        'owasp': 'A05:2021 – Security Misconfiguration',
        'references': 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options',
    },
    {
        'id': 'MISSING_XCTO',
        'header': 'x-content-type-options',
        'severity': 'LOW',
        'category': 'HTTP Security Headers',
        'title': 'Missing X-Content-Type-Options: nosniff',
        'description': (
            'Without nosniff, browsers may MIME-sniff a response and execute a non-script '
            'file as JavaScript, enabling content injection attacks.'
        ),
        'fix_description': "Add X-Content-Type-Options: nosniff to every response.",
        'fix_example': (
            '# Nginx:\nadd_header X-Content-Type-Options "nosniff";\n\n'
            '# Apache:\nHeader always set X-Content-Type-Options "nosniff"'
        ),
        'owasp': 'A05:2021 – Security Misconfiguration',
        'references': 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Content-Type-Options',
    },
    {
        'id': 'MISSING_RP',
        'header': 'referrer-policy',
        'severity': 'LOW',
        'category': 'HTTP Security Headers',
        'title': 'Missing Referrer-Policy header',
        'description': (
            'Without Referrer-Policy, the full URL (including tokens, session IDs, '
            'search queries) leaks to every third-party resource your page loads.'
        ),
        'fix_description': "Add Referrer-Policy: strict-origin-when-cross-origin.",
        'fix_example': (
            '# Nginx:\nadd_header Referrer-Policy "strict-origin-when-cross-origin";\n\n'
            '# Apache:\nHeader always set Referrer-Policy "strict-origin-when-cross-origin"'
        ),
        'owasp': 'A05:2021 – Security Misconfiguration',
        'references': 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy',
    },
    {
        'id': 'MISSING_PERMS',
        'header': 'permissions-policy',
        'severity': 'LOW',
        'category': 'HTTP Security Headers',
        'title': 'Missing Permissions-Policy header',
        'description': (
            'Without Permissions-Policy, any script on your page (including third-party '
            'or injected code) can silently access camera, microphone, geolocation, etc.'
        ),
        'fix_description': "Add Permissions-Policy to disable browser APIs you don't use.",
        'fix_example': (
            '# Nginx:\nadd_header Permissions-Policy "camera=(), microphone=(), geolocation=(), interest-cohort=()";\n\n'
            '# Apache:\nHeader always set Permissions-Policy "camera=(), microphone=(), geolocation=()"'
        ),
        'owasp': 'A05:2021 – Security Misconfiguration',
        'references': 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Permissions-Policy',
    },
]

# ── Sensitive path probes ─────────────────────────────────────────────────────
# Each dict may have a 'validate' key — a callable(content: str) -> bool that
# confirms the 200 response really is the sensitive file and not a soft-404 page.
#
# Removed intentionally to avoid false positives:
#   /robots.txt         — present on virtually every website by design, not a vuln
#   /.well-known/security.txt — this is GOOD security practice, not a problem
#   /crossdomain.xml    — Flash is dead; a 200 here is nearly always a false positive
#   /admin, /wp-admin   — 200 almost always means "redirect to login page", not open access
#   /actuator/health    — intentionally public on most Spring Boot apps
_SENSITIVE_PATHS = [
    {'path': '/.env',              'severity': 'CRITICAL', 'category': 'Exposed Secrets',       'desc': 'Environment file publicly accessible — likely contains DB credentials, API keys, and JWT secrets',           'validate': _is_real_env_file},
    {'path': '/.env.local',        'severity': 'CRITICAL', 'category': 'Exposed Secrets',       'desc': 'Local environment file publicly accessible',                                                                   'validate': _is_real_env_file},
    {'path': '/.env.production',   'severity': 'CRITICAL', 'category': 'Exposed Secrets',       'desc': 'Production environment file publicly accessible',                                                              'validate': _is_real_env_file},
    {'path': '/.git/HEAD',         'severity': 'CRITICAL', 'category': 'Source Code Exposure',  'desc': 'Git HEAD file accessible — full source code may be downloadable via /.git/',                                  'validate': _is_real_git_head},
    {'path': '/.git/config',       'severity': 'CRITICAL', 'category': 'Source Code Exposure',  'desc': 'Git config accessible — reveals remote repository URLs and may contain embedded credentials',                 'validate': _is_real_git_config},
    {'path': '/phpinfo.php',       'severity': 'HIGH',     'category': 'Information Disclosure', 'desc': 'PHP info page exposes server configuration, loaded modules, and environment variables',                       'validate': _is_real_phpinfo},
    {'path': '/wp-config.php',     'severity': 'CRITICAL', 'category': 'Exposed Secrets',       'desc': 'WordPress config file accessible — contains database credentials and secret keys',                             'validate': _is_real_wpconfig},
    {'path': '/wp-config.php.bak', 'severity': 'CRITICAL', 'category': 'Exposed Secrets',       'desc': 'WordPress config backup accessible — contains database credentials',                                          'validate': _is_real_wpconfig},
    {'path': '/.htpasswd',         'severity': 'CRITICAL', 'category': 'Exposed Secrets',       'desc': 'Apache password file accessible — contains hashed user credentials',                                          'validate': _is_real_htpasswd},
    {'path': '/backup.zip',        'severity': 'HIGH',     'category': 'Exposed Secrets',       'desc': 'Backup archive accessible — may contain source code and credentials'},
    {'path': '/backup.sql',        'severity': 'CRITICAL', 'category': 'Exposed Secrets',       'desc': 'SQL database dump accessible — full database contents exposed',                                                'validate': _is_real_sql_dump},
    {'path': '/database.sql',      'severity': 'CRITICAL', 'category': 'Exposed Secrets',       'desc': 'SQL database dump accessible',                                                                                 'validate': _is_real_sql_dump},
    {'path': '/db.sql',            'severity': 'CRITICAL', 'category': 'Exposed Secrets',       'desc': 'SQL database dump accessible',                                                                                 'validate': _is_real_sql_dump},
    {'path': '/server-status',     'severity': 'MEDIUM',   'category': 'Information Disclosure', 'desc': 'Apache mod_status page exposes server internals and active connections',                                      'validate': _is_real_server_status},
    {'path': '/actuator/env',      'severity': 'CRITICAL', 'category': 'Information Disclosure', 'desc': 'Spring Boot /actuator/env exposes all environment variables and configuration',                               'validate': _is_real_actuator_env},
    {'path': '/actuator/mappings', 'severity': 'MEDIUM',   'category': 'Information Disclosure', 'desc': 'Spring Boot /actuator/mappings exposes all API route definitions'},
    {'path': '/swagger-ui.html',   'severity': 'LOW',      'category': 'Information Disclosure', 'desc': 'Swagger UI accessible — full API schema publicly exposed'},
    {'path': '/swagger-ui',        'severity': 'LOW',      'category': 'Information Disclosure', 'desc': 'Swagger UI accessible — full API schema publicly exposed'},
    {'path': '/api/docs',          'severity': 'INFO',     'category': 'Information Disclosure', 'desc': 'API documentation is publicly accessible'},
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _check_ssl_cert(hostname: str) -> dict:
    """Return TLS certificate info: days_left, valid, issuer, error."""
    ctx = ssl.create_default_context()
    try:
        with socket.create_connection((hostname, 443), timeout=6) as raw:
            with ctx.wrap_socket(raw, server_hostname=hostname) as s:
                cert = s.getpeercert()
                not_after  = ssl.cert_time_to_seconds(cert['notAfter'])
                days_left  = int((not_after - time.time()) / 86400)
                issuer     = dict(x[0] for x in cert.get('issuer', []))
                subject    = dict(x[0] for x in cert.get('subject', []))
                return {
                    'valid': True, 'days_left': days_left,
                    'issuer': issuer.get('organizationName', 'Unknown'),
                    'subject': subject.get('commonName', hostname),
                }
    except ssl.SSLCertVerificationError as e:
        return {'valid': False, 'days_left': None, 'error': str(e)}
    except Exception as e:
        return {'valid': None, 'days_left': None, 'error': str(e)}


def _detect_soft_404(client: httpx.Client, base: str) -> bool:
    """Detect servers that return HTTP 200 for every path (custom 404 page).
    Probes a random sentinel URL that cannot possibly exist."""
    sentinel = f'/this-path-cannot-exist-{uuid.uuid4().hex[:12]}'
    try:
        r = client.get(base.rstrip('/') + sentinel, timeout=_PATH_TIMEOUT, follow_redirects=False)
        return r.status_code == 200
    except Exception:
        return False


def _probe_path(client: httpx.Client, base: str, path_info: dict, soft_404: bool):
    """Probe a single sensitive path.
    Uses GET (to capture content) when a validator is present or soft-404 detected.
    Returns (path_info, status_code | None, content_snippet_str).
    """
    path     = path_info['path']
    validate = path_info.get('validate')
    url      = base.rstrip('/') + path
    needs_content = validate is not None or soft_404
    try:
        if needs_content:
            r = client.get(url, timeout=_PATH_TIMEOUT, follow_redirects=False)
        else:
            r = client.head(url, timeout=_PATH_TIMEOUT, follow_redirects=False)
            if r.status_code in (405, 501):
                r = client.get(url, timeout=_PATH_TIMEOUT, follow_redirects=False)

        content = ''
        if r.status_code == 200 and needs_content:
            try:
                content = r.text[:4096]
            except Exception:
                content = ''
        return path_info, r.status_code, content
    except Exception:
        return path_info, None, ''


def _parse_set_cookie(header: str) -> dict:
    """Very light Set-Cookie parser — checks presence of security flags."""
    parts = [p.strip() for p in header.split(';')]
    name  = parts[0].split('=')[0].strip() if parts else 'unknown'
    attrs = {p.lower().split('=')[0].strip() for p in parts[1:]}
    return {
        'name':     name,
        'secure':   'secure'   in attrs,
        'httponly': 'httponly' in attrs,
        'samesite': any(a.startswith('samesite') for a in attrs),
    }


# ── Schema ────────────────────────────────────────────────────────────────────

class URLScanRequest(BaseModel):
    url: str


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/scan-website")
def scan_website(
    body: URLScanRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    raw_url = body.url.strip()
    if not raw_url.startswith(('http://', 'https://')):
        raw_url = 'https://' + raw_url

    parsed   = urlparse(raw_url)
    hostname = parsed.hostname or ''
    if not hostname:
        raise HTTPException(400, 'Invalid URL')

    start    = time.monotonic()
    findings: list = []

    # ── 1. Main HTTP request (ignore TLS errors so we can still scan headers) ──
    try:
        with httpx.Client(
            verify=False,
            timeout=_URL_TIMEOUT,
            headers={'User-Agent': 'Mozilla/5.0 (SecurityScanner/1.0)'},
            follow_redirects=True,
        ) as client:
            try:
                resp      = client.get(raw_url)
                status    = resp.status_code
                final_url = str(resp.url)
                hdrs      = {k.lower(): v for k, v in resp.headers.items()}
                is_https  = final_url.startswith('https://')
            except Exception as e:
                raise HTTPException(400, f'Could not reach {raw_url}: {e}')

            # ── 2. HTTP → HTTPS redirect check ────────────────────────────────
            if raw_url.startswith('http://'):
                if not is_https:
                    findings.append({
                        'id': 'NO_HTTPS_REDIRECT', 'severity': 'HIGH',
                        'category': 'Insecure Transport',
                        'title': 'Site does not redirect HTTP to HTTPS',
                        'description': 'The site accepts plain HTTP connections without upgrading to HTTPS, exposing all traffic to man-in-the-middle attacks.',
                        'evidence': f'GET {raw_url} returned HTTP {status} without redirecting to https://',
                        'fix_description': 'Redirect all HTTP traffic to HTTPS at the server/proxy level.',
                        'fix_example': '# Nginx:\nserver {\n  listen 80;\n  return 301 https://$host$request_uri;\n}',
                        'owasp': 'A02:2021 – Cryptographic Failures',
                        'references': 'https://owasp.org/www-project-web-security-testing-guide/',
                        'url': raw_url,
                    })
            elif not is_https:
                findings.append({
                    'id': 'NOT_HTTPS', 'severity': 'HIGH',
                    'category': 'Insecure Transport',
                    'title': 'Site is served over HTTP only',
                    'description': 'All data transmitted between the browser and server is unencrypted and visible to network observers.',
                    'evidence': f'Final URL after redirects: {final_url}',
                    'fix_description': "Obtain an SSL/TLS certificate (e.g. via Let's Encrypt) and serve all content over HTTPS.",
                    'fix_example': "# Let's Encrypt (certbot):\ncertbot --nginx -d yourdomain.com",
                    'owasp': 'A02:2021 – Cryptographic Failures',
                    'references': 'https://letsencrypt.org/',
                    'url': final_url,
                })

            # ── 3. Security headers ────────────────────────────────────────────
            csp_header = hdrs.get('content-security-policy', '')
            for chk in _HEADER_CHECKS:
                if chk.get('https_only') and not is_https:
                    continue
                # X-Frame-Options is redundant when CSP already sets frame-ancestors
                if chk['id'] == 'MISSING_XFO' and 'frame-ancestors' in csp_header.lower():
                    continue
                if chk['header'] not in hdrs:
                    findings.append({
                        'id': chk['id'], 'severity': chk['severity'],
                        'category': chk['category'], 'title': chk['title'],
                        'description': chk['description'],
                        'evidence': f"Header '{chk['header']}' not present in response from {final_url}",
                        'fix_description': chk['fix_description'],
                        'fix_example': chk['fix_example'],
                        'owasp': chk['owasp'], 'references': chk['references'],
                        'url': final_url,
                    })

            # ── 4. Information disclosure via response headers ─────────────────
            # Only flag when the Server header reveals a specific version number
            # for known server software (e.g. "nginx/1.25.3").
            # Generic values like "cloudflare", "nginx" (no version), or
            # "AmazonS3" don't help attackers target CVEs — skip them.
            server = hdrs.get('server', '')
            if server and re.search(
                r'(?:nginx|apache|iis|lighttpd|openresty|caddy|gunicorn|uvicorn|tornado|litespeed)/[\d.]',
                server, re.IGNORECASE,
            ):
                findings.append({
                    'id': 'SERVER_VERSION', 'severity': 'LOW',
                    'category': 'Information Disclosure',
                    'title': 'Server version number disclosed',
                    'description': 'The Server header reveals the exact web-server version, making it trivial for attackers to look up CVEs for that version.',
                    'evidence': f'Server: {server}',
                    'fix_description': 'Suppress or genericise the Server header.',
                    'fix_example': '# Nginx:  server_tokens off;\n# Apache: ServerTokens Prod\n         ServerSignature Off',
                    'owasp': 'A05:2021 – Security Misconfiguration',
                    'references': 'https://owasp.org/www-project-web-security-testing-guide/',
                    'url': final_url,
                })

            for hdr_name, finding_id, title in [
                ('x-powered-by',       'XPOWERED_BY',   'X-Powered-By header discloses technology stack'),
                ('x-aspnet-version',   'ASPNET_VER',    'X-AspNet-Version header discloses .NET version'),
                ('x-aspnetmvc-version','ASPNETMVC_VER', 'X-AspNetMvc-Version header discloses MVC version'),
            ]:
                val = hdrs.get(hdr_name, '')
                if val:
                    findings.append({
                        'id': finding_id, 'severity': 'LOW',
                        'category': 'Information Disclosure', 'title': title,
                        'description': f'The {hdr_name} header reveals implementation details that help attackers fingerprint your stack.',
                        'evidence': f'{hdr_name}: {val}',
                        'fix_description': f'Remove the {hdr_name} header from all responses.',
                        'fix_example': f'# Nginx:\nproxy_hide_header {hdr_name};\n# Apache:\nHeader unset {hdr_name}',
                        'owasp': 'A05:2021 – Security Misconfiguration',
                        'references': 'https://owasp.org/www-project-web-security-testing-guide/',
                        'url': final_url,
                    })

            # ── 5. CORS wildcard ───────────────────────────────────────────────
            acao = hdrs.get('access-control-allow-origin', '')
            if acao == '*':
                findings.append({
                    'id': 'CORS_WILDCARD', 'severity': 'MEDIUM',
                    'category': 'Security Misconfiguration',
                    'title': 'CORS wildcard (*) — any origin can read responses',
                    'description': 'Access-Control-Allow-Origin: * allows any website to make cross-origin requests and read the responses, enabling data theft.',
                    'evidence': 'Access-Control-Allow-Origin: *',
                    'fix_description': 'Restrict CORS to specific trusted origins.',
                    'fix_example': '# Nginx:\nadd_header Access-Control-Allow-Origin "https://yourdomain.com";\n\n# Only allow specific origins, never *',
                    'owasp': 'A05:2021 – Security Misconfiguration',
                    'references': 'https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS',
                    'url': final_url,
                })

            # ── 6. Cookie security flags ───────────────────────────────────────
            seen_cookies: set = set()
            for sc_header in resp.headers.get_list('set-cookie'):
                ck    = _parse_set_cookie(sc_header)
                cname = ck['name']
                if cname in seen_cookies:
                    continue
                seen_cookies.add(cname)

                # Analytics/tracking cookies are intentionally readable by JS — skip
                if _is_analytics_cookie(cname):
                    continue

                if is_https and not ck['secure']:
                    findings.append({
                        'id': f'COOKIE_NO_SECURE_{cname}', 'severity': 'MEDIUM',
                        'category': 'Insecure Cookie',
                        'title': f'Cookie "{cname}" missing Secure flag',
                        'description': 'Without Secure, the cookie is sent over plain HTTP, making it interceptable on the network.',
                        'evidence': sc_header[:200],
                        'fix_description': 'Add the Secure attribute to all session cookies.',
                        'fix_example': f'Set-Cookie: {cname}=value; Secure; HttpOnly; SameSite=Lax',
                        'owasp': 'A02:2021 – Cryptographic Failures',
                        'references': 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#security',
                        'url': final_url,
                    })
                if not ck['httponly']:
                    findings.append({
                        'id': f'COOKIE_NO_HTTPONLY_{cname}', 'severity': 'MEDIUM',
                        'category': 'Insecure Cookie',
                        'title': f'Cookie "{cname}" missing HttpOnly flag',
                        'description': 'Without HttpOnly, JavaScript (including XSS payloads) can read this cookie and send it to an attacker.',
                        'evidence': sc_header[:200],
                        'fix_description': 'Add the HttpOnly attribute to all session and auth cookies.',
                        'fix_example': f'Set-Cookie: {cname}=value; Secure; HttpOnly; SameSite=Lax',
                        'owasp': 'A02:2021 – Cryptographic Failures',
                        'references': 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#security',
                        'url': final_url,
                    })

            # ── 7. Sensitive path probes (concurrent) ─────────────────────────
            base_for_probes = f"{parsed.scheme}://{parsed.netloc}"

            # Detect soft-404: servers that return HTTP 200 for every URL.
            # If detected, we rely exclusively on content validators to decide
            # whether a 200 response is real.  Paths without a validator are
            # skipped entirely on soft-404 servers to avoid false positives.
            soft_404 = _detect_soft_404(client, base_for_probes)

            with concurrent.futures.ThreadPoolExecutor(max_workers=_MAX_PATH_WORKERS) as ex:
                futures = [
                    ex.submit(_probe_path, client, base_for_probes, pi, soft_404)
                    for pi in _SENSITIVE_PATHS
                ]
                probe_results = [f.result() for f in futures]

            for path_info, code, content in probe_results:
                if code is None:
                    continue

                path     = path_info['path']
                sev      = path_info['severity']
                cat      = path_info['category']
                desc     = path_info['desc']
                validate = path_info.get('validate')

                is_real = True
                if code == 200:
                    if validate:
                        # Content validator: confirm the response is the real sensitive file
                        is_real = validate(content)
                    elif soft_404:
                        # No validator + soft-404 server = can't distinguish real from fake
                        is_real = False

                # Flag: readable file (200 + validated) OR file exists but blocked (403)
                # Only report 403 for CRITICAL/HIGH severity — 403 on LOW paths is noise
                if (code == 200 and is_real) or (code == 403 and sev in ('CRITICAL', 'HIGH')):
                    probe_url   = base_for_probes.rstrip('/') + path
                    status_note = '200 OK — file is publicly readable' if code == 200 else '403 Forbidden — file exists but access is blocked'
                    findings.append({
                        'id': f'EXPOSED_{path.lstrip("/").replace("/","_").replace(".","_").upper()}',
                        'severity': sev, 'category': cat,
                        'title': f'Sensitive path accessible: {path}',
                        'description': desc,
                        'evidence': f'GET {probe_url} → HTTP {code} ({status_note})',
                        'fix_description': f'Remove or deny access to {path} at the web-server level.',
                        'fix_example': (
                            f'# Nginx:\nlocation ~ {re.escape(path)} {{\n    deny all;\n    return 404;\n}}\n\n'
                            f'# Apache:\n<Files "{path.lstrip("/")}">\n    Order allow,deny\n    Deny from all\n</Files>'
                        ),
                        'owasp': 'A05:2021 – Security Misconfiguration',
                        'references': 'https://owasp.org/www-project-web-security-testing-guide/',
                        'url': probe_url,
                    })

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f'Scanner error: {e}')

    # ── 8. TLS certificate check (separate connection, outside httpx client) ──
    if raw_url.startswith('https') or (findings and not any(f['id'] == 'NOT_HTTPS' for f in findings)):
        cert = _check_ssl_cert(hostname)
        if cert.get('valid') is False:
            findings.append({
                'id': 'SSL_INVALID', 'severity': 'CRITICAL',
                'category': 'TLS / Certificate',
                'title': 'SSL/TLS certificate is invalid or untrusted',
                'description': 'The certificate failed validation. Browsers will show a security warning and block the connection for most users.',
                'evidence': cert.get('error', 'Certificate validation failed'),
                'fix_description': "Obtain a valid certificate from a trusted CA (Let's Encrypt is free).",
                'fix_example': "# Let's Encrypt:\ncertbot --nginx -d yourdomain.com",
                'owasp': 'A02:2021 – Cryptographic Failures',
                'references': 'https://letsencrypt.org/',
                'url': raw_url,
            })
        elif cert.get('valid') is True and cert.get('days_left') is not None:
            days = cert['days_left']
            if days < 0:
                findings.append({
                    'id': 'SSL_EXPIRED', 'severity': 'CRITICAL',
                    'category': 'TLS / Certificate',
                    'title': f'SSL/TLS certificate has EXPIRED ({abs(days)} days ago)',
                    'description': 'An expired certificate causes browser warnings and breaks secure connections for all visitors.',
                    'evidence': f"Certificate expired {abs(days)} days ago. Issued by: {cert.get('issuer','Unknown')}",
                    'fix_description': 'Renew your certificate immediately.',
                    'fix_example': 'certbot renew',
                    'owasp': 'A02:2021 – Cryptographic Failures',
                    'references': 'https://letsencrypt.org/',
                    'url': raw_url,
                })
            elif days < 14:
                findings.append({
                    'id': 'SSL_EXPIRING_SOON', 'severity': 'HIGH',
                    'category': 'TLS / Certificate',
                    'title': f'SSL/TLS certificate expires in {days} days',
                    'description': 'The certificate will expire very soon. Once expired, all browsers will block access to your site.',
                    'evidence': f"Certificate expires in {days} days. Issued by: {cert.get('issuer','Unknown')}",
                    'fix_description': 'Renew the certificate before it expires.',
                    'fix_example': 'certbot renew --pre-hook "systemctl stop nginx" --post-hook "systemctl start nginx"',
                    'owasp': 'A02:2021 – Cryptographic Failures',
                    'references': 'https://letsencrypt.org/',
                    'url': raw_url,
                })
            elif days < 30:
                findings.append({
                    'id': 'SSL_EXPIRING', 'severity': 'MEDIUM',
                    'category': 'TLS / Certificate',
                    'title': f'SSL/TLS certificate expires in {days} days',
                    'description': 'Schedule certificate renewal soon to avoid service interruption.',
                    'evidence': f"Certificate expires in {days} days. Issued by: {cert.get('issuer','Unknown')}",
                    'fix_description': 'Renew or set up automatic certificate renewal.',
                    'fix_example': '# Auto-renew via cron:\n0 0 * * * certbot renew --quiet',
                    'owasp': 'A02:2021 – Cryptographic Failures',
                    'references': 'https://letsencrypt.org/',
                    'url': raw_url,
                })

    # ── 9. Sort and return ────────────────────────────────────────────────────
    findings.sort(key=lambda f: SEVERITY_ORDER.get(f['severity'], 99))

    stats = {
        'total':        len(findings),
        'critical':     sum(1 for f in findings if f['severity'] == 'CRITICAL'),
        'high':         sum(1 for f in findings if f['severity'] == 'HIGH'),
        'medium':       sum(1 for f in findings if f['severity'] == 'MEDIUM'),
        'low':          sum(1 for f in findings if f['severity'] == 'LOW'),
        'info':         sum(1 for f in findings if f['severity'] == 'INFO'),
        'scan_seconds': round(time.monotonic() - start, 2),
        'status_code':  status if 'status' in dir() else None,
        'timed_out':    False,
    }

    return {
        'url':        raw_url,
        'final_url':  final_url if 'final_url' in dir() else raw_url,
        'scanned_at': datetime.now(timezone.utc).isoformat(),
        'stats':      stats,
        'findings':   findings,
    }
