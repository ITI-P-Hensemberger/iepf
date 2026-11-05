"""CI path filters and release bundles. Remote commands are replaced with fakes."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest

INFRA = Path(__file__).resolve().parents[1]
ROOT = INFRA.parent
sys.path.insert(0, str(INFRA / 'ci'))
import changes  # noqa: E402
import deploy  # noqa: E402

DIGEST = 'sha256:' + 'a' * 64
TOOLS = 'sha256:' + 'b' * 64
FRONT = 'sha256:' + 'c' * 64


def on(result):
    return {key for key, value in result.items() if value}


def git(cwd, *args):
    subprocess.run(['git', '-c', 'user.name=t', '-c', 'user.email=t@example.test', *args], cwd=cwd, check=True, capture_output=True)


class ClassifyTests(unittest.TestCase):
    def test_app_change_only_touches_that_app(self):
        self.assertEqual(on(changes.classify(['apps/backend/src/app.ts'])), {'backend_checks', 'backend_release'})
        self.assertEqual(on(changes.classify(['apps/frontend/app/page.tsx'])), {'frontend_checks', 'frontend_release'})

    def test_lockfile_rebuilds_both_apps(self):
        self.assertEqual(on(changes.classify(['pnpm-lock.yaml'])),
                         {'backend_checks', 'backend_release', 'frontend_checks', 'frontend_release'})

    def test_documentation_never_releases(self):
        result = changes.classify(['apps/backend/README.md', 'infra/deploy/README.md', 'README.md', 'docs/cutover.md'])
        self.assertEqual({k for k in on(result) if k.endswith('_release')}, set())

    def test_only_bundle_files_release_infra(self):
        for path in ['infra/deploy/compose.yaml', 'infra/deploy/apply.sh', 'infra/deploy/systemd/iepf-backup.timer']:
            self.assertIn('infra_release', on(changes.classify([path])), path)
        for path in ['infra/deploy/bootstrap.sh', 'infra/dev/local.py', 'infra/tests/test_ci.py', 'Makefile']:
            self.assertEqual(on(changes.classify([path])), {'infra_checks'}, path)

    def test_pipeline_change_checks_all_but_rebuilds_nothing(self):
        for path in ['.github/workflows/ci-release.yml', 'infra/ci/deploy.py']:
            self.assertEqual(on(changes.classify([path])),
                             {'backend_checks', 'frontend_checks', 'infra_checks', 'infra_release'})

    def test_every_bundle_file_is_filtered(self):
        for member in deploy.BUNDLE_MEMBERS:
            if member not in ('request.json', 'release-id', 'systemd'):
                self.assertIn(f'infra/deploy/{member}', changes.DEPLOY_FILES)


class HistoryTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.repo = temp.name
        git(self.repo, 'init', '-q', '-b', 'main')
        self.first = self.commit('apps/backend/a.ts')

    def commit(self, path):
        file = Path(self.repo) / path
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text((file.read_text() if file.exists() else '') + 'x\n')
        git(self.repo, 'add', '-A')
        git(self.repo, 'commit', '-q', '-m', path)
        return subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=self.repo, text=True).strip()

    def plan(self, **env):
        return changes.plan({'EVENT_NAME': 'push', **env}, cwd=self.repo)

    def test_push_covers_all_commits_in_the_range(self):
        self.commit('apps/backend/b.ts')
        head = self.commit('apps/frontend/c.ts')
        result = on(self.plan(BASE_SHA=self.first, HEAD_SHA=head))
        self.assertIn('backend_release', result)
        self.assertIn('frontend_release', result)
        self.assertIn('infra_checks', result)

    def test_new_branch_or_force_push_changes_everything(self):
        for base in ['0' * 40, 'f' * 40, '']:
            self.assertEqual(self.plan(BASE_SHA=base, HEAD_SHA=self.first), changes.everything())

    def test_pull_request_ignores_changes_made_on_main_since_branching(self):
        git(self.repo, 'checkout', '-q', '-b', 'feature')
        head = self.commit('apps/frontend/f.ts')
        git(self.repo, 'checkout', '-q', 'main')
        base = self.commit('apps/backend/later.ts')
        result = on(self.plan(EVENT_NAME='pull_request', BASE_SHA=base, HEAD_SHA=head))
        self.assertEqual(result, {'frontend_checks', 'frontend_release'})

    def test_manual_run_rebuilds_only_without_an_image(self):
        rebuild = on(self.plan(EVENT_NAME='workflow_dispatch', HEAD_SHA=self.first, INPUT_COMPONENT='backend'))
        self.assertEqual(rebuild, {'backend_checks', 'backend_release', 'infra_checks'})
        for inputs in [{'INPUT_COMPONENT': 'backend', 'INPUT_IMAGE': 'x'}, {'INPUT_COMPONENT': 'rollback'}, {'INPUT_COMPONENT': 'infra'}]:
            self.assertEqual(on(self.plan(EVENT_NAME='workflow_dispatch', HEAD_SHA=self.first, **inputs)), {'infra_checks'})

    def test_docs_commit_does_not_supersede_an_older_build(self):
        # A plain "head != sha" guard would lose this backend release for good.
        head = self.commit('apps/backend/README.md')
        requests = [{'component': 'backend'}]
        keep, skipped = deploy.drop_superseded(requests, self.first, head, cwd=self.repo)
        self.assertEqual((keep, skipped), (requests, []))

    def test_other_component_does_not_supersede_an_older_build(self):
        head = self.commit('apps/frontend/x.ts')
        keep, _ = deploy.drop_superseded([{'component': 'backend'}], self.first, head, cwd=self.repo)
        self.assertEqual(keep, [{'component': 'backend'}])

    def test_same_component_supersedes_an_older_build(self):
        head = self.commit('apps/backend/newer.ts')
        keep, skipped = deploy.drop_superseded([{'component': 'backend'}], self.first, head, cwd=self.repo)
        self.assertEqual((keep, skipped), ([], [{'component': 'backend'}]))


class RequestTests(unittest.TestCase):
    builds = {'BACKEND_DIGEST': DIGEST, 'TOOLS_DIGEST': TOOLS, 'FRONTEND_DIGEST': FRONT, 'SOURCE_SHA': 'abc'}

    def test_backend_deploys_before_frontend(self):
        requests = deploy.requests_from_push(dict(self.builds, INFRA_RELEASE='true'))
        self.assertEqual([r['component'] for r in requests], ['backend', 'frontend'])
        self.assertEqual(requests[0]['image'], f'ghcr.io/iti-p-hensemberger/iepf-backend@{DIGEST}')
        self.assertEqual(requests[0]['tools_image'], f'ghcr.io/iti-p-hensemberger/iepf-backend@{TOOLS}')
        self.assertEqual(requests[1]['image'], f'ghcr.io/iti-p-hensemberger/iepf-frontend@{FRONT}')

    def test_infra_alone_needs_its_own_release(self):
        self.assertEqual(deploy.requests_from_push({'INFRA_RELEASE': 'true'}), [{'component': 'infra'}])
        self.assertEqual(deploy.requests_from_push({'INFRA_RELEASE': 'false'}), [])

    def test_manual_requests(self):
        self.assertEqual(deploy.requests_from_dispatch({'INPUT_COMPONENT': 'rollback', 'INPUT_RELEASE': '1-11'}),
                         [{'component': 'rollback', 'release': '1-11'}])
        self.assertEqual(deploy.requests_from_dispatch({'INPUT_COMPONENT': 'infra'}), [{'component': 'infra'}])
        self.assertEqual(deploy.requests_from_dispatch({'INPUT_COMPONENT': 'frontend', 'INPUT_IMAGE': 'img'}),
                         [{'component': 'frontend', 'image': 'img', 'tools_image': ''}])
        rebuilt = deploy.requests_from_dispatch(dict(self.builds, INPUT_COMPONENT='frontend', BACKEND_DIGEST=''))
        self.assertEqual([r['component'] for r in rebuilt], ['frontend'])

    def test_release_ids_are_unique_and_accepted_by_apply(self):
        # apply.sh refuses an existing release and accepts only digits-digits.
        apply = (INFRA / 'deploy/apply.sh').read_text()
        self.assertIn('^[0-9]+-[0-9]+$', apply)
        ids = {deploy.release_id('55', attempt, c) for attempt in (1, 2, 12) for c in deploy.SLOTS}
        self.assertEqual(len(ids), 12)
        self.assertEqual(deploy.release_id('55', 1, 'backend'), '55-11')


class BundleTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.base = Path(temp.name)

    def test_bundle_keeps_the_format_apply_expects(self):
        target = self.base / 'b.tar.gz'
        deploy.build_bundle({'component': 'infra'}, '9-13', target)
        with tarfile.open(target) as archive:
            names = archive.getnames()
            top = {name.split('/')[0] for name in names}
            self.assertEqual(top, {'compose.yaml', 'apply.sh', 'job.sh', 'backup.sh', 'alert.sh', 'systemd', 'request.json', 'release-id'})
            self.assertIn('systemd/iepf-job@.service', names)
            self.assertEqual(archive.extractfile('release-id').read(), b'9-13\n')
            self.assertEqual(json.load(archive.extractfile('request.json')), {'component': 'infra'})

    def test_two_components_of_one_run_apply_in_order_and_stop_on_failure(self):
        bin_dir = self.base / 'bin'
        bin_dir.mkdir()
        log = self.base / 'log.jsonl'
        fake = f'''#!/usr/bin/env python3
import json, os, sys
open({str(log)!r},'a').write(json.dumps([os.path.basename(sys.argv[0])]+sys.argv[1:])+'\\n')
fail = os.environ.get('FAIL_ON')
sys.exit(1 if fail and any(fail in a and 'apply.sh' in a for a in sys.argv) else 0)
'''
        for name in ('ssh', 'scp'):
            (bin_dir / name).write_text(fake)
            (bin_dir / name).chmod(0o755)
        env = dict(os.environ, PATH=f'{bin_dir}:{os.environ["PATH"]}', EVENT_NAME='workflow_dispatch', INPUT_COMPONENT='backend',
                   RUN_ID='77', RUN_ATTEMPT='1', VPS_HOST='vps.example.test', VPS_USER='root', VPS_PORT='2222',
                   BACKEND_DIGEST=DIGEST, TOOLS_DIGEST=TOOLS, FRONTEND_DIGEST=FRONT, SOURCE_SHA='abc')
        script = str(INFRA / 'ci/deploy.py')
        result = subprocess.run([sys.executable, script], env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        commands = [json.loads(x) for x in log.read_text().splitlines()]
        applied = [c[-1] for c in commands if c[0] == 'ssh' and 'apply.sh' in c[-1]]
        self.assertEqual(len(applied), 2)
        self.assertIn('/tmp/iepf-77-11/', applied[0])
        self.assertIn('/tmp/iepf-77-12/', applied[1])
        log.unlink()
        result = subprocess.run([sys.executable, script], env=dict(env, FAIL_ON='77-11'), capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        commands = [json.loads(x) for x in log.read_text().splitlines()]
        self.assertFalse(any('77-12' in ' '.join(c) for c in commands))
        self.assertTrue(any('rm -rf' in c[-1] and '77-11' in c[-1] for c in commands))

    def test_rejects_unsafe_host_before_any_remote_command(self):
        with self.assertRaisesRegex(RuntimeError, 'Invalid VPS'):
            deploy.main({'VPS_HOST': 'x;reboot', 'VPS_USER': 'root', 'EVENT_NAME': 'push'})


class LayoutTests(unittest.TestCase):
    def test_images_keep_the_names_apply_validates(self):
        apply = (INFRA / 'deploy/apply.sh').read_text()
        self.assertIn(r"ghcr\.io/iti-p-hensemberger/iepf-'+repo", apply)
        self.assertEqual(deploy.image('backend', DIGEST), f'ghcr.io/iti-p-hensemberger/iepf-backend@{DIGEST}')
        workflow = (ROOT / '.github/workflows/ci-release.yml').read_text()
        for tag in ['iepf-backend:${{ github.sha }}', 'iepf-backend:tools-${{ github.sha }}', 'iepf-frontend:${{ github.sha }}']:
            self.assertIn('ghcr.io/iti-p-hensemberger/' + tag, workflow)

    def test_dispatch_token_is_gone(self):
        workflow = (ROOT / '.github/workflows/ci-release.yml').read_text()
        self.assertNotIn('repository_dispatch', workflow)
        self.assertNotIn('INFRA_DISPATCH_TOKEN', workflow)

    def test_one_lockfile_and_no_nested_workflows(self):
        self.assertTrue((ROOT / 'pnpm-lock.yaml').exists())
        for app in ('backend', 'frontend'):
            self.assertFalse((ROOT / 'apps' / app / 'pnpm-lock.yaml').exists())
            self.assertFalse((ROOT / 'apps' / app / '.github').exists())
            self.assertTrue((ROOT / 'apps' / app / 'Dockerfile.dockerignore').exists())

    def test_docker_contexts_never_send_env_files(self):
        for app in ('backend', 'frontend'):
            ignore = (ROOT / 'apps' / app / 'Dockerfile.dockerignore').read_text().splitlines()
            self.assertEqual(ignore[1], '*')
            self.assertIn('**/.env', ignore)
            self.assertIn('**/.env.*', ignore)


if __name__ == '__main__':
    unittest.main(verbosity=2)
