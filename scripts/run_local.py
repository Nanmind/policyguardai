#!/usr/bin/env python3
"""Portable local setup/start/stop. Never copies cloud credentials or databases."""
import argparse
import ctypes
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
import venv

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / '.local'
STATE = LOCAL / 'services.json'
VENV = ROOT / 'apps/api/.venv'
PYTHON = VENV / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
COMPOSE = ['docker', 'compose', '-f', str(ROOT / 'infra/docker-compose.yml')]


def run(args, cwd=ROOT):
    executable = shutil.which(str(args[0])) or str(args[0])
    command = [executable, *map(str, args[1:])]
    subprocess.run(command, cwd=cwd, check=True,
                   shell=os.name == 'nt' and Path(executable).suffix.lower() in {'.cmd', '.bat'})


def birth(pid):
    """Protect stop from accidentally targeting a reused process identifier."""
    if os.name == 'nt':
        from ctypes import wintypes
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        kernel.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
        kernel.GetProcessTimes.argtypes = [wintypes.HANDLE, *([ctypes.POINTER(wintypes.FILETIME)] * 4)]
        handle = kernel.OpenProcess(0x1000, False, pid)
        if not handle: return None
        created, exited, system, user = [wintypes.FILETIME() for _ in range(4)]
        try:
            exit_code = wintypes.DWORD()
            if not kernel.GetExitCodeProcess(handle, ctypes.byref(exit_code)) or exit_code.value != 259:
                return None
            if kernel.GetProcessTimes(handle, ctypes.byref(created), ctypes.byref(exited), ctypes.byref(system), ctypes.byref(user)):
                return str((created.dwHighDateTime << 32) + created.dwLowDateTime)
        finally: kernel.CloseHandle(handle)
    else:
        try:
            # comm may contain spaces; fields following its final ')' start at field 3.
            fields = Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()
            return None if fields[0] == 'Z' else fields[19]
        except (OSError, IndexError): return None
    return None


def fetch(url):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(url, timeout=3) as response: return response.read()


def ready(url, marker):
    end = time.monotonic() + 60
    while time.monotonic() < end:
        try:
            body = fetch(url)
            if marker.encode() in body: return
        except (OSError, urllib.error.URLError): pass
        time.sleep(.3)
    raise RuntimeError(f'Readiness failed for {url}. Inspect .local/logs; services remain recorded for safe stopping.')


def node_checks():
    for name in ['node', 'npm']:
        if not shutil.which(name): raise RuntimeError(f'{name} is missing. Install Node.js 24 LTS first.')
    version = subprocess.check_output(['node','--version'], text=True).strip()
    if int(version.lstrip('v').split('.')[0]) < 24: raise RuntimeError('Use Node.js 24 LTS for this dependency set.')


def setup(args):
    if sys.version_info < (3, 12): raise RuntimeError('Use Python 3.12 or newer (3.12 recommended).')
    if STATE.exists():
        records = json.loads(STATE.read_text())
        if any(v.get('birth') and birth(v['pid']) == v['birth'] for v in records.values()):
            raise RuntimeError('Stop managed services before setup rebuilds their dependencies and frontend.')
    node_checks()
    LOCAL.mkdir(exist_ok=True)
    os.environ.setdefault('PIP_CACHE_DIR', str(LOCAL / 'pip-cache'))
    os.environ.setdefault('npm_config_cache', str(LOCAL / 'npm-cache'))
    if not PYTHON.exists(): venv.EnvBuilder(with_pip=True).create(VENV)
    run([PYTHON, '-m', 'pip', 'install', '-r', 'apps/api/requirements.txt'])
    run([PYTHON, '-m', 'pip', 'check'])
    run(['npm', 'ci', '--no-audit', '--no-fund'], ROOT / 'apps/web')
    config = ROOT / 'apps/api/.env'
    if not config.exists():
        model = args.model or 'qwen3:8b'
        if '\n' in model or '\r' in model: raise RuntimeError('Model name cannot contain newlines.')
        config.write_text('JWT_SECRET=' + secrets.token_hex(32) + '\nOLLAMA_MODEL=' + model + '\nOLLAMA_THINK=false\n')
        config.chmod(0o600)
        print('Created private local configuration; no existing configuration was replaced.')
    if not args.existing_db: run([*COMPOSE, 'up', '-d', '--wait', '--wait-timeout', '60'])
    for module in ['migrate_v3', 'migrate_v4', 'seed_data']: run([PYTHON, '-m', 'apps.api.' + module])
    run([PYTHON, '-m', 'unittest', 'discover', '-s', 'tests', '-v'])
    run(['npm', 'run', 'lint'], ROOT / 'apps/web')
    run(['npm', 'run', 'build'], ROOT / 'apps/web')
    print('Setup checks passed. Run this script with start next.')


def start(args):
    if not PYTHON.exists(): raise RuntimeError('Run setup first.')
    node_checks()
    if not (ROOT / 'apps/web/.next/BUILD_ID').exists(): raise RuntimeError('No production build. Stop services, then run setup.')
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    owned = {k:v for k,v in state.items() if v.get('birth') and birth(v['pid']) == v['birth']}
    if set(owned) == {'api', 'web'}:
        ready('http://127.0.0.1:8000/health', 'policyguard-ai-api')
        ready('http://127.0.0.1:3000/login', 'PolicyGuard')
        print('Managed services already running:', ', '.join(owned)); return
    if owned:
        raise RuntimeError('Only some managed services are running. Run stop, then start to recover.')
    for port in [8000, 3000]:
        import socket
        with socket.socket() as sock:
            if sock.connect_ex(('127.0.0.1',port)) == 0:
                raise RuntimeError(f'Port {port} is occupied by another process. Stop it yourself or use the original working copy; no process was killed.')
    if not args.existing_db: run([*COMPOSE, 'up', '-d', '--wait', '--wait-timeout', '60'])
    logs = LOCAL / 'logs'; logs.mkdir(parents=True, exist_ok=True)
    child_env = dict(os.environ)
    if args.model: child_env['OLLAMA_MODEL'] = args.model
    definitions = [('api', [str(PYTHON), '-m', 'uvicorn', 'apps.api.main:app', '--host', '127.0.0.1', '--port', '8000'], ROOT),
                   ('web', [shutil.which('node'), 'node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3000'], ROOT / 'apps/web')]
    state = {}
    try:
        for name, command, cwd in definitions:
            with (logs / (name+'.log')).open('ab') as log:
                process = subprocess.Popen(command, cwd=cwd, stdout=log, stderr=subprocess.STDOUT, env=child_env,
                                           start_new_session=os.name != 'nt', creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0)
            identity = birth(process.pid)
            if not identity: raise RuntimeError(f'Cannot establish process identity for {name}; process may have exited. Inspect logs.')
            state[name] = {'pid': process.pid, 'birth': identity}
            STATE.write_text(json.dumps(state, indent=2))
            ready('http://127.0.0.1:8000/health' if name == 'api' else 'http://127.0.0.1:3000/login', 'policyguard-ai-api' if name == 'api' else 'PolicyGuard')
    except Exception:
        stop(argparse.Namespace(stop_db=False)); raise
    print('API health and production login page passed. Open the local app at port 3000; sign up to create your own account.')
    try:
        models = json.loads(fetch('http://127.0.0.1:11434/api/tags'))
        print('Available Ollama models:', ', '.join(m.get('name', '') for m in models.get('models', [])) or 'none')
    except (OSError, ValueError):
        print('Ollama is unavailable: start Ollama and install the selected model before using agent chat. Policy Studio and Attack Lab remain usable.')


def stop(args):
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    retained = {}
    for name, record in state.items():
        pid, expected = record['pid'], record.get('birth')
        if expected and birth(pid) == expected:
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                continue
            end = time.monotonic() + 10
            while birth(pid) == expected and time.monotonic() < end: time.sleep(.1)
            if birth(pid) == expected: retained[name] = record
        print('Stopped or no longer running:', name)
    if retained: STATE.write_text(json.dumps(retained, indent=2))
    elif STATE.exists(): STATE.unlink()
    if args.stop_db: run([*COMPOSE, 'stop'])
    print('Database data and shared Ollama installation preserved.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['setup','start','stop'])
    parser.add_argument('--existing-db', action='store_true', help='Use the database already configured in apps/api/.env; skip Docker Compose')
    parser.add_argument('--model', help='Ollama tag; start overrides the model for this launch, setup sets it only for a new .env')
    parser.add_argument('--stop-db', action='store_true', help='Also stop this Compose database, preserving its volume')
    args = parser.parse_args()
    try: {'setup':setup,'start':start,'stop':stop}[args.action](args)
    except (OSError, RuntimeError, subprocess.CalledProcessError, ValueError) as e:
        print('ERROR:', e, file=sys.stderr); return 1
    return 0

if __name__ == '__main__': sys.exit(main())
