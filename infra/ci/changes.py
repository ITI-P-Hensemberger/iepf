#!/usr/bin/env python3
"""Decide which IEPF components a change affects. Single source for the CI path filters."""
import os
from pathlib import Path
import subprocess
import sys

APPS = ('backend', 'frontend')
# A change here can alter what either application installs or builds.
WORKSPACE_FILES = {'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.nvmrc', '.dockerignore'}
WORKFLOWS = '.github/workflows/'
CI_SCRIPTS = 'infra/ci/'
# Exactly the files that form the production bundle.
DEPLOY_FILES = {'infra/deploy/compose.yaml', 'infra/deploy/apply.sh', 'infra/deploy/job.sh', 'infra/deploy/backup.sh', 'infra/deploy/alert.sh', 'infra/deploy/install-timers.sh'}
DEPLOY_DIRS = ('infra/deploy/systemd/',)
# Generated from the backend routes: the backend checks regenerate and compare it.
API_TYPES = 'apps/frontend/lib/api/schema.ts'
OUTPUTS = [f'{name}_{kind}' for name in (*APPS, 'infra') for kind in ('checks', 'release')]


def classify(paths):
    """Map changed paths to the checks to run and the components to release."""
    result = dict.fromkeys(OUTPUTS, False)
    for path in paths:
        if path in WORKSPACE_FILES:
            for app in APPS:
                result[f'{app}_checks'] = result[f'{app}_release'] = True
        elif path.startswith(WORKFLOWS) or path.startswith(CI_SCRIPTS):
            # The pipeline changed: verify everything, but only re-apply the bundle.
            for app in APPS:
                result[f'{app}_checks'] = True
            result['infra_checks'] = result['infra_release'] = True
        elif path == 'Makefile' or path.startswith('infra/') or path.startswith('.github/'):
            result['infra_checks'] = True
            if path in DEPLOY_FILES or path.startswith(DEPLOY_DIRS):
                result['infra_release'] = True
        else:
            if path == API_TYPES:
                result['backend_checks'] = True
            for app in APPS:
                if path.startswith(f'apps/{app}/'):
                    result[f'{app}_checks'] = True
                    # Documentation never reaches the running image's behaviour.
                    if not path.endswith('.md'):
                        result[f'{app}_release'] = True
    return result


def everything():
    return dict.fromkeys(OUTPUTS, True)


def git(*args, cwd=None):
    return subprocess.run(['git', *args], cwd=cwd, check=True, capture_output=True, text=True).stdout


def changed_paths(base, head, cwd=None, merge_base=False):
    separator = '...' if merge_base else '..'
    return [p for p in git('diff', '--name-only', f'{base}{separator}{head}', cwd=cwd).splitlines() if p]


def has_commit(sha, cwd=None):
    if not sha or set(sha) == {'0'}:
        return False
    try:
        git('cat-file', '-e', f'{sha}^{{commit}}', cwd=cwd)
    except subprocess.CalledProcessError:
        return False
    return True


def plan(env, cwd=None):
    event = env['EVENT_NAME']
    head = env['HEAD_SHA']
    if event == 'workflow_dispatch':
        result = dict.fromkeys(OUTPUTS, False)
        result['infra_checks'] = True
        component = env.get('INPUT_COMPONENT', 'infra')
        # Without an image a manual run rebuilds the application from this ref.
        if component in APPS and not env.get('INPUT_IMAGE'):
            result[f'{component}_checks'] = result[f'{component}_release'] = True
        return result
    base = env.get('BASE_SHA', '')
    # A new branch or a force push has no reliable base: treat everything as changed.
    if not has_commit(base, cwd):
        return everything()
    result = classify(changed_paths(base, head, cwd, merge_base=event == 'pull_request'))
    if event == 'push':
        # Every production deploy validates the infrastructure first.
        result['infra_checks'] = True
    return result


def main():
    result = plan(os.environ)
    lines = [f'{key}={"true" if value else "false"}' for key, value in result.items()]
    print('\n'.join(lines))
    output = os.environ.get('GITHUB_OUTPUT')
    if output:
        with Path(output).open('a') as file:
            file.write('\n'.join(lines) + '\n')


if __name__ == '__main__':
    try:
        main()
    except (KeyError, subprocess.CalledProcessError) as error:
        print(f'ERROR: {error}', file=sys.stderr)
        sys.exit(1)
