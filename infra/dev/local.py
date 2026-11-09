#!/usr/bin/env python3
"""Local IEPF orchestration. No production configuration or credentials are loaded."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import subprocess
import sys
import time
from urllib.parse import urlparse

INFRA = Path(__file__).resolve().parents[1]
ROOT = INFRA.parent
BACKEND = ROOT / 'apps' / 'backend'
FRONTEND = ROOT / 'apps' / 'frontend'
HOME = Path(os.environ.get('IEPF_DEV_HOME', ROOT / '.local')).resolve()
PNPM = ['npx', '--yes', 'pnpm@10.28.2']


def read_env(path):
    values = {}
    for line in path.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        key, sep, value = line.partition('=')
        if not sep or not re.fullmatch(r'[A-Z][A-Z0-9_]*', key):
            raise RuntimeError(f'Invalid environment line in {path}')
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("\"", "\'"):
            value = value[1:-1]
        values[key] = value
    return values


def write_env(path, values):
    if path.exists():
        return
    # Exclusive creation: setup never replaces developer configuration.
    with path.open('x') as file:
        file.write(''.join(f'{k}={v}\n' for k, v in values.items()))
    path.chmod(0o600)


# NIST P-256 (FIPS 186-4, SEC 2): enough to derive a public key, so setup needs no Node.
P256_P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff
P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551
P256_G = (0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296,
          0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5)


def p256_add(a, b):
    if a is None:
        return b
    if b is None:
        return a
    if a[0] == b[0] and (a[1] + b[1]) % P256_P == 0:
        return None
    if a == b:
        slope = (3 * a[0] * a[0] - 3) * pow(2 * a[1], -1, P256_P)
    else:
        slope = (b[1] - a[1]) * pow(b[0] - a[0], -1, P256_P)
    x = (slope * slope - a[0] - b[0]) % P256_P
    return x, (slope * (a[0] - x) - a[1]) % P256_P


def vapid_keys():
    """A Web Push key pair as base64url: uncompressed public point and private scalar."""
    import base64
    secret = secrets.randbelow(P256_N - 1) + 1
    point, addend, k = None, P256_G, secret
    while k:
        if k & 1:
            point = p256_add(point, addend)
        addend = p256_add(addend, addend)
        k >>= 1
    encode = lambda raw: base64.urlsafe_b64encode(raw).rstrip(b'=').decode()
    public = b'\x04' + point[0].to_bytes(32, 'big') + point[1].to_bytes(32, 'big')
    return {'VAPID_PUBLIC_KEY': encode(public), 'VAPID_PRIVATE_KEY': encode(secret.to_bytes(32, 'big')),
            # Apple rejects reserved domains such as example.test: use the project's contact.
            'VAPID_SUBJECT': 'mailto:iepf@hensemberger.it'}


def add_missing_env(path, values):
    # Older local environments predate these keys: append them, never rewrite what is there.
    present = read_env(path)
    missing = {k: v for k, v in values.items() if k not in present}
    if missing:
        with path.open('a') as file:
            file.write(''.join(f'{k}={v}\n' for k, v in missing.items()))


def node_environment():
    env = dict(os.environ)
    candidates = []
    if shutil.which('node'):
        candidates.append(Path(shutil.which('node')))
    # The major version CI and the images use: .nvmrc at the repository root.
    major = (ROOT / '.nvmrc').read_text().strip()
    nvm = Path(os.environ.get('NVM_DIR', Path.home() / '.nvm')) / 'versions/node'
    candidates.extend(sorted(nvm.glob(f'v{major}.*/bin/node'), key=lambda p: tuple(map(int, p.parts[-3][1:].split('.'))), reverse=True))
    for node in candidates:
        version = subprocess.check_output([str(node), '--version'], text=True).strip()
        if version.startswith(f'v{major}.'):
            env['PATH'] = str(node.parent) + os.pathsep + env['PATH']
            return env
    raise RuntimeError(f'Node {major} is required. Run: nvm install {major} && nvm use {major}')


def run(args, cwd=INFRA, env=None, **kwargs):
    return subprocess.run(args, cwd=cwd, env=env, check=True, **kwargs)


def prepare():
    HOME.mkdir(parents=True, exist_ok=True)
    HOME.chmod(0o700)
    defaults = {'COMPOSE_PROJECT_NAME': os.environ.get('IEPF_DEV_PROJECT', 'iepf-dev')}
    defaults.update({key: os.environ.get(key, str(value)) for key, value in {
        'DEV_DB_PORT': 5432, 'TEST_DB_PORT': 5433, 'BACKEND_PORT': 9999,
        'FRONTEND_PORT': 3000, 'SMTP_PORT': 1025, 'MAILPIT_PORT': 8025,
    }.items()})
    write_env(HOME / 'compose.env', defaults)
    cfg = read_env(HOME / 'compose.env')
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]*', cfg['COMPOSE_PROJECT_NAME']):
        raise RuntimeError('Invalid Compose project name')
    try:
        ports = [int(cfg[k]) for k in defaults if k.endswith('_PORT')]
    except ValueError as error:
        raise RuntimeError('Local ports must be integer values') from error
    if len(set(ports)) != len(ports) or any(p < 1024 or p > 65535 for p in ports):
        raise RuntimeError('Local ports must be distinct and between 1024 and 65535')
    common = {
        'NODE_ENV': 'development', 'TZ': 'Europe/Rome', 'PORT': cfg['BACKEND_PORT'],
        'LOG_LEVEL': 'info',
        'DATABASE_URL': f'postgresql://iepf:iepf_local_password@127.0.0.1:{cfg["DEV_DB_PORT"]}/iepf_dev',
        'PASSWORD_SALT': secrets.token_hex(24), 'JWT_SECRET': secrets.token_hex(32),
        'SITE_URL': f'http://localhost:{cfg["FRONTEND_PORT"]}',
        'SMTP_HOST': '127.0.0.1', 'SMTP_PORT': cfg['SMTP_PORT'],
        'SMTP_FROM': 'IEPF-local <no-reply@example.test>',
    }
    write_env(HOME / 'backend.env', {**common, **vapid_keys()})
    add_missing_env(HOME / 'backend.env', vapid_keys())
    write_env(HOME / 'frontend.env', {
        'NODE_ENV': 'development', 'PORT': cfg['FRONTEND_PORT'],
        'API_BASE_URL': f'http://127.0.0.1:{cfg["BACKEND_PORT"]}',
        'NEXT_PUBLIC_SITE_URL': f'http://localhost:{cfg["FRONTEND_PORT"]}',
        'NEXT_PUBLIC_TIMEZONE': 'Europe/Rome',
    })
    common.update({
        'NODE_ENV': 'test', 'LOG_LEVEL': 'silent',
        'DATABASE_URL': f'postgresql://iepf:iepf_local_password@127.0.0.1:{cfg["TEST_DB_PORT"]}/iepf_test',
        'MAILPIT_URL': f'http://127.0.0.1:{cfg["MAILPIT_PORT"]}',
    })
    write_env(HOME / 'test.env', common)
    return cfg


def compose(*args):
    endpoint = os.environ.get('DOCKER_HOST')
    if not endpoint:
        endpoint = subprocess.check_output(['docker', 'context', 'inspect', '--format', '{{(index .Endpoints "docker").Host}}'], text=True).strip()
    if not endpoint.startswith('unix://'):
        raise RuntimeError('Local commands require a local Unix Docker socket; remote Docker contexts are refused')
    # Do not inherit a production Docker context or arbitrary Compose overrides.
    cfg = read_env(HOME / 'compose.env')
    env = dict(os.environ)
    for key in list(env):
        if key.startswith('COMPOSE_'):
            del env[key]
    env.update(cfg)
    return run(['docker', 'compose', '--project-name', cfg['COMPOSE_PROJECT_NAME'],
                '--env-file', str(HOME / 'compose.env'), '-f', str(INFRA / 'docker-compose-dev.yml'), *args], env=env)


def app_env(test=False, frontend=False):
    path = HOME / ('test.env' if test else 'frontend.env' if frontend else 'backend.env')
    env = node_environment()
    # Explicitly blank SMTP auth: inherited shell/old repo env must not leak in.
    env.update(SMTP_USER='', SMTP_PASS='', SMTP_DEBUG='false')
    env.update(read_env(path))
    env['ENV_FILE'] = str(path)
    return env


def local_database(test=False):
    env = app_env(test=test)
    url = urlparse(env['DATABASE_URL'])
    expected = 'iepf_test' if test else 'iepf_dev'
    if env['NODE_ENV'] not in ('development', 'test') or url.hostname not in ('127.0.0.1', 'localhost') or url.path != '/' + expected:
        raise RuntimeError('Refusing to migrate/seed/reset a database outside the managed local environment')
    if env.get('SMTP_HOST') not in ('localhost', '127.0.0.1'):
        raise RuntimeError('Local commands require local SMTP (Mailpit)')
    return env


def pnpm(script, test=False):
    run([*PNPM, 'run', script], cwd=BACKEND, env=local_database(test))


def start_infra(test=False):
    compose('up', '-d', '--wait', '--wait-timeout', '120', 'db-test' if test else 'db-dev', 'mailpit')


def process_start(pid):
    # lstart follows locale and timezone: fix both so any shell reads the same value.
    return subprocess.check_output(['ps', '-p', str(pid), '-o', 'lstart='], text=True,
                                   env=dict(os.environ, LC_ALL='C', TZ='UTC')).strip()


def stop_apps():
    pidfile = HOME / 'processes.json'
    if not pidfile.exists():
        return
    # Only signal process groups still owned by the recorded supervisor.
    state = json.loads(pidfile.read_text())
    try:
        command = subprocess.check_output(['ps', '-p', str(state['supervisor']), '-o', 'command='], text=True).strip()
        started = process_start(state['supervisor'])
        if str(Path(__file__).resolve()) not in command or started != state['started']:
            pidfile.unlink(missing_ok=True)
            return
        os.kill(state['supervisor'], signal.SIGTERM)
        for _ in range(60):
            if not pidfile.exists():
                return
            time.sleep(0.25)
        raise RuntimeError('Dev supervisor did not stop; database remains running')
    except (ProcessLookupError, subprocess.CalledProcessError):
        pidfile.unlink(missing_ok=True)


def dev():
    pidfile = HOME / 'processes.json'
    if pidfile.exists():
        try:
            os.kill(json.loads(pidfile.read_text())['supervisor'], 0)
        except ProcessLookupError:
            pidfile.unlink()
        else:
            raise RuntimeError('A dev supervisor is already running. Use make stop first.')
    start_infra()
    pnpm('db:migrate')
    children = []
    def interrupted(signum, frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        for repo, env in [(BACKEND, local_database()), (FRONTEND, app_env(frontend=True))]:
            children.append(subprocess.Popen([*PNPM, 'run', 'dev'], cwd=repo, env=env, start_new_session=True))
        started = process_start(os.getpid())
        pidfile.write_text(json.dumps({'supervisor': os.getpid(), 'started': started, 'children': [p.pid for p in children]}))
        print('Dev started. Ctrl+C stops both apps; database and Mailpit remain available.', flush=True)
        while all(p.poll() is None for p in children):
            time.sleep(0.25)
        raise RuntimeError('One application exited; stopping both. See the log above.')
    except KeyboardInterrupt:
        pass
    finally:
        for child in children:
            if child.poll() is None:
                os.killpg(child.pid, signal.SIGTERM)
        for child in children:
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait()
        pidfile.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['help','setup','dev','up','stop','down','logs','doctor','db-migrate','db-generate','seed','seed-full','db-reset','db-clear','test','e2e','check'])
    parser.add_argument('--confirm', action='store_true')
    args = parser.parse_args()
    if args.command == 'help':
        print('make setup  Install pinned dependencies and create local env files\nmake dev    Start infra, migrate, run both apps\nmake stop   Stop both apps and local infra, keep data\nmake up / down / logs / doctor\nmake db-migrate / db-generate / seed / seed-full\nmake db-reset CONFIRM=yes  Delete ONLY managed dev data and seed it again\nmake db-clear CONFIRM=yes  Empty the managed local DB, keep schema, no seed\nmake test   Fresh isolated DB, migrations, backend and frontend tests\nmake e2e    Fresh isolated DB, dev seed, Playwright on both apps (stop make dev first: same ports)\nmake check  Typecheck, lint and build both apps')
        return
    cfg = prepare()
    command = args.command
    if command == 'setup':
        # One workspace install from the root covers both applications.
        run([*PNPM, 'install', '--frozen-lockfile'], cwd=ROOT, env=dict(node_environment(), CI='true'))
        print(f'Environment ready in {HOME}. Next: make dev (and optionally make seed).')
    elif command == 'doctor':
        env = node_environment()
        run(['node', '--version'], env=env)
        run([*PNPM, '--version'], cwd=ROOT, env=env)
        run(['docker', 'info', '--format', '{{.ServerVersion}}'])
        compose('config', '--quiet')
        print(f'Local environment: {HOME}; project: {cfg["COMPOSE_PROJECT_NAME"]}')
    elif command == 'dev':
        dev()
    elif command == 'up':
        start_infra()
    elif command in ('stop','down'):
        stop_apps()
        compose('--profile', 'test', 'down')
    elif command == 'logs':
        compose('logs', '--follow', '--tail', '100')
    elif command in ('db-migrate','db-generate','seed','seed-full'):
        start_infra()
        if command in ('seed','seed-full'):
            pnpm('db:migrate')
        pnpm({'db-migrate':'db:migrate','db-generate':'db:generate','seed':'seed:dev','seed-full':'seed:all-mock-data'}[command])
    elif command in ('db-reset', 'db-clear'):
        if not args.confirm:
            raise RuntimeError(f'No data deleted. To reset the managed local DB: make {command} CONFIRM=yes')
        stop_apps()
        local_database()
        start_infra()
        # Fixed database name and credentials in this Compose project; never read a repo .env.
        compose('exec', '-T', 'db-dev', 'psql', '-U', 'iepf', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'DROP DATABASE iepf_dev WITH (FORCE)', '-c', 'CREATE DATABASE iepf_dev OWNER iepf')
        pnpm('db:migrate')
        if command == 'db-reset':
            pnpm('seed:dev')
    elif command in ('test', 'e2e'):
        local_database(test=True)
        # Refuse dev/production DBs, then recreate only the ephemeral test service.
        with (HOME / 'test.lock').open('w') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise RuntimeError('Another test run is using this local environment') from error
            compose('rm', '--stop', '--force', 'db-test')
            try:
                start_infra(test=True)
                pnpm('db:migrate', test=True)
                if command == 'e2e':
                    # Playwright starts both apps on the test database; the ports come from compose.env.
                    env = dict(local_database(test=True), BACKEND_PORT=cfg['BACKEND_PORT'], FRONTEND_PORT=cfg['FRONTEND_PORT'])
                    run([*PNPM, 'exec', 'playwright', 'install', 'chromium'], cwd=FRONTEND, env=env)
                    run([*PNPM, 'exec', 'playwright', 'test'], cwd=FRONTEND, env=env)
                else:
                    pnpm('test', test=True)
                    run([*PNPM, 'run', 'test'], cwd=FRONTEND, env=node_environment())
            finally:
                compose('rm', '--stop', '--force', 'db-test')
    elif command == 'check':
        for repo in (BACKEND, FRONTEND):
            for script in ('typecheck','lint','build'):
                run([*PNPM, 'run', script], cwd=repo, env=node_environment())


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError, FileNotFoundError) as error:
        print(f'ERROR: {error}', file=sys.stderr)
        sys.exit(1)
