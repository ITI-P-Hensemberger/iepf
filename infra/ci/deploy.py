#!/usr/bin/env python3
"""Send one release bundle per component to the VPS and apply it, stopping at the first failure."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
from changes import classify, changed_paths  # noqa: E402

DEPLOY = Path(__file__).resolve().parents[1] / 'deploy'
BUNDLE_MEMBERS = ['compose.yaml', 'apply.sh', 'job.sh', 'backup.sh', 'restore-test.sh', 'alert.sh', 'install-timers.sh', 'systemd', 'request.json', 'release-id']
# Part of the release ID, so components deployed by one run never share a directory.
SLOTS = {'backend': 1, 'frontend': 2, 'infra': 3, 'rollback': 4}
REGISTRY = 'ghcr.io/iti-p-hensemberger'


def image(app, digest):
    return f'{REGISTRY}/iepf-{app}@{digest}'


def requests_from_dispatch(env):
    component = env.get('INPUT_COMPONENT') or 'infra'
    if component in ('backend', 'frontend') and not env.get('INPUT_IMAGE'):
        return requests_from_builds(env)
    request = {'component': component}
    if component == 'rollback':
        request['release'] = env.get('INPUT_RELEASE', '')
    elif component != 'infra':
        request['image'] = env['INPUT_IMAGE']
        request['tools_image'] = env.get('INPUT_TOOLS_IMAGE', '')
    return [request]


def requests_from_builds(env):
    requests = []
    # Backend first: its migrations must exist before a frontend that relies on them.
    if env.get('BACKEND_DIGEST'):
        requests.append({'component': 'backend', 'image': image('backend', env['BACKEND_DIGEST']),
                         'tools_image': image('backend', env['TOOLS_DIGEST']), 'sha': env['SOURCE_SHA']})
    if env.get('FRONTEND_DIGEST'):
        requests.append({'component': 'frontend', 'image': image('frontend', env['FRONTEND_DIGEST']),
                         'tools_image': '', 'sha': env['SOURCE_SHA']})
    return requests


def requests_from_push(env):
    requests = requests_from_builds(env)
    # Every bundle carries the deploy files, so an application release already applies them.
    if env.get('INFRA_RELEASE') == 'true' and not requests:
        requests.append({'component': 'infra'})
    return requests


def drop_superseded(requests, source, head, cwd=None):
    """Keep a release unless a newer main commit changes that component and will deploy it itself."""
    if source == head:
        return requests, []
    newer = classify(changed_paths(source, head, cwd))
    keep = [r for r in requests if not newer[f'{r["component"]}_release']]
    return keep, [r for r in requests if r not in keep]


def release_id(run_id, attempt, component):
    return f'{run_id}-{int(attempt) * 10 + SLOTS[component]}'


def build_bundle(request, release, target):
    with tempfile.TemporaryDirectory() as temp:
        stage = Path(temp)
        for name in ('compose.yaml', 'apply.sh', 'job.sh', 'backup.sh', 'restore-test.sh', 'alert.sh', 'install-timers.sh'):
            shutil.copy2(DEPLOY / name, stage / name)
        shutil.copytree(DEPLOY / 'systemd', stage / 'systemd')
        (stage / 'request.json').write_text(json.dumps(request))
        (stage / 'release-id').write_text(release + '\n')
        with tarfile.open(target, 'w:gz') as archive:
            for member in BUNDLE_MEMBERS:
                archive.add(stage / member, arcname=member)


def apply_remote(bundle_file, release, host, user, port):
    ssh = ['ssh', '-o', 'BatchMode=yes', '-p', port, f'{user}@{host}']
    remote = f'/tmp/iepf-{release}'
    subprocess.run([*ssh, f"umask 077; mkdir '{remote}'"], check=True)
    try:
        subprocess.run(['scp', '-o', 'BatchMode=yes', '-P', port, str(bundle_file), f'{user}@{host}:{remote}/release.tar.gz'], check=True)
        subprocess.run([*ssh, f"tar -xzf '{remote}/release.tar.gz' -C '{remote}' && bash '{remote}/apply.sh'"], check=True)
    finally:
        subprocess.run([*ssh, f"rm -rf -- '{remote}'"], check=False)


def summary(env, text):
    print(text, flush=True)
    if env.get('GITHUB_STEP_SUMMARY'):
        with open(env['GITHUB_STEP_SUMMARY'], 'a') as file:
            file.write(text + '\n')


def main(env=os.environ):
    host, user, port = env['VPS_HOST'], env['VPS_USER'], env.get('VPS_PORT') or '22'
    if not (re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9.-]*', host) and re.fullmatch(r'[a-z_][a-z0-9_-]*', user) and re.fullmatch(r'[0-9]+', port)):
        raise RuntimeError('Invalid VPS_HOST, VPS_USER or VPS_PORT')
    if env['EVENT_NAME'] == 'workflow_dispatch':
        requests = requests_from_dispatch(env)
    else:
        # The checkout is the tip of main, so the newest deploy files always go out.
        head = subprocess.run(['git', 'rev-parse', 'HEAD'], check=True, capture_output=True, text=True).stdout.strip()
        requests, skipped = drop_superseded(requests_from_push(env), env['SOURCE_SHA'], head)
        for request in skipped:
            summary(env, f'Skipped {request["component"]}: a newer commit on main will deploy it.')
    if not requests:
        summary(env, 'Nothing to deploy.')
        return
    with tempfile.TemporaryDirectory() as temp:
        for request in requests:
            component = request['component']
            release = release_id(env['RUN_ID'], env['RUN_ATTEMPT'], component)
            bundle = Path(temp) / f'{release}.tar.gz'
            build_bundle(request, release, bundle)
            apply_remote(bundle, release, host, user, port)
            summary(env, f'Deployed {component} as release {release}.')


if __name__ == '__main__':
    try:
        main()
    except (KeyError, RuntimeError, subprocess.CalledProcessError, tarfile.TarError) as error:
        print(f'ERROR: {error}', file=sys.stderr)
        sys.exit(1)
