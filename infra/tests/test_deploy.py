"""Linux regression tests. All infrastructure commands are replaced with fakes."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'deploy'
DIGEST = 'a' * 64
NEW_DIGEST = 'b' * 64


def image(repo, digest=DIGEST):
    return f'ghcr.io/iti-p-hensemberger/iepf-{repo}@sha256:{digest}'


class DeployTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.root = self.base / 'runtime'
        self.bundle = self.base / 'bundle'
        self.bin = self.base / 'bin'
        for p in [self.root / 'shared', self.root / 'releases', self.bundle, self.bin]:
            p.mkdir(parents=True)
        for name in ['apply.sh', 'backup.sh', 'job.sh', 'compose.yaml']:
            text = (SOURCE / name).read_text().replace('ROOT=/opt/iepf', f'ROOT={self.root}')
            (self.bundle / name).write_text(text)
        import shutil
        shutil.copytree(SOURCE / 'systemd', self.bundle / 'systemd')
        for name in ['host.env', 'backend.env', 'postgres.env']:
            (self.root / 'shared' / name).write_text('TEST=true\n')
        self.previous = self.root / 'releases' / '100-1'
        self.previous.mkdir()
        self.state = '\n'.join([
            f'FRONTEND_IMAGE={image("frontend")}',
            f'BACKEND_IMAGE={image("backend")}',
            f'TOOLS_IMAGE={image("backend")}', ''])
        (self.previous / 'images.env').write_text(self.state)
        (self.previous / 'compose.yaml').write_text('services: {}\n')
        (self.root / 'shared' / 'images.env').write_text(self.state)
        (self.root / 'current').symlink_to(self.previous)
        (self.bundle / 'release-id').write_text('101-1\n')
        self.log = self.base / 'commands.jsonl'
        fake = '''#!/usr/bin/env python3
import json, os, sys
name=os.path.basename(sys.argv[0]); args=sys.argv[1:]
with open(os.environ['COMMAND_LOG'],'a') as f: f.write(json.dumps([name]+args)+'\\n')
fail=os.environ.get('FAIL','')
if name=='docker':
    if args[0]=='exec':
        if fail=='backup': sys.exit(1)
        print('-- test dump')
    if 'db:migrate' in args and fail=='migration': sys.exit(1)
    if 'up' in args and 'traefik' in args and fail=='activation': sys.exit(1)
if name=='rclone' and fail=='upload': sys.exit(1)
if name=='curl' and fail=='http': sys.exit(1)
'''
        for name in ['docker', 'curl', 'rclone']:
            p = self.bin / name
            p.write_text(fake)
            p.chmod(0o755)
        self.env = dict(os.environ, PATH=f'{self.bin}:{os.environ["PATH"]}', COMMAND_LOG=str(self.log))

    def run_deploy(self, request, failure=''):
        (self.bundle / 'request.json').write_text(json.dumps(request))
        return subprocess.run(['bash', str(self.bundle / 'apply.sh')], env=dict(self.env, FAIL=failure), capture_output=True, text=True)

    def commands(self):
        return [json.loads(x) for x in self.log.read_text().splitlines()] if self.log.exists() else []

    def test_frontend_preserves_backend_and_skips_migrations(self):
        r = self.run_deploy({'component': 'frontend', 'image': image('frontend', NEW_DIGEST)})
        self.assertEqual(r.returncode, 0, r.stderr)
        state = (self.root / 'current' / 'images.env').read_text()
        self.assertIn(f'BACKEND_IMAGE={image("backend")}', state)
        self.assertIn(f'FRONTEND_IMAGE={image("frontend", NEW_DIGEST)}', state)
        self.assertFalse(any('db:migrate' in c for c in self.commands()))

    def test_backend_backs_up_before_migrating(self):
        r = self.run_deploy({'component': 'backend', 'image': image('backend', NEW_DIGEST), 'tools_image': image('backend', NEW_DIGEST)})
        self.assertEqual(r.returncode, 0, r.stderr)
        commands = self.commands()
        backup = next(i for i,c in enumerate(commands) if c[:2] == ['docker','exec'])
        upload = next(i for i,c in enumerate(commands) if c[:2] == ['rclone','copy'])
        migration = next(i for i,c in enumerate(commands) if 'db:migrate' in c)
        self.assertLess(backup, upload)
        self.assertLess(upload, migration)

    def test_failures_preserve_active_release(self):
        for failure in ['backup', 'upload', 'migration', 'activation', 'http']:
            with self.subTest(failure=failure):
                release = self.root / 'releases' / '101-1'
                if release.exists():
                    import shutil
                    shutil.rmtree(release)
                self.log.unlink(missing_ok=True)
                r = self.run_deploy({'component':'backend', 'image':image('backend', NEW_DIGEST), 'tools_image':image('backend', NEW_DIGEST)}, failure)
                self.assertNotEqual(r.returncode, 0)
                self.assertEqual((self.root / 'current').resolve(), self.previous)
                commands = self.commands()
                if failure in ['backup', 'upload']:
                    self.assertFalse(any('db:migrate' in c for c in commands))
                if failure in ['activation','http']:
                    self.assertTrue(any(str(self.previous / 'compose.yaml') in c and 'up' in c for c in commands))

    def test_invalid_input_never_invokes_docker(self):
        for request in [
            {'component':'backend', 'image':image('backend')},
            {'component':'frontend', 'image':'$(touch /tmp/unwanted)'},
            {'component':'rollback', 'release':'../../shared'},
        ]:
            self.assertNotEqual(self.run_deploy(request).returncode, 0)
            self.assertEqual(self.commands(), [])

    def test_transfer_preserves_exact_bootstrap_images(self):
        legacy = self.state.replace('iti-p-hensemberger', 'previous-owner')
        (self.previous / 'images.env').write_text(legacy)
        (self.root / 'shared' / 'images.env').write_text(legacy)
        r = self.run_deploy({'component':'frontend', 'image':image('frontend', NEW_DIGEST)})
        self.assertEqual(r.returncode, 0, r.stderr)
        active = (self.root / 'current' / 'images.env').read_text()
        self.assertIn('BACKEND_IMAGE=' + image('backend').replace('iti-p-hensemberger','previous-owner'), active)
        self.assertIn('FRONTEND_IMAGE=' + image('frontend', NEW_DIGEST), active)

    def test_dispatch_rejects_other_registry_owners(self):
        legacy_image = image('frontend', NEW_DIGEST).replace('iti-p-hensemberger','previous-owner')
        r = self.run_deploy({'component':'frontend','image':legacy_image})
        self.assertNotEqual(r.returncode, 0)
        self.assertEqual(self.commands(), [])

    def test_rollback_skips_migrations(self):
        r = self.run_deploy({'component':'rollback','release':'100-1'})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertFalse(any('db:migrate' in c for c in self.commands()))

    def test_bootstrap_infra_does_not_migrate(self):
        (self.root / 'current').unlink()
        r = self.run_deploy({'component':'infra'})
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertFalse(any('db:migrate' in c for c in self.commands()))

    def test_jobs_forward_today_and_tomorrow(self):
        for name, flag in [('remind-lessons-today','--today'),('remind-lessons-tomorrow','--tomorrow')]:
            r = subprocess.run(['bash', str(self.bundle / 'job.sh'), name], env=self.env, capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertEqual(self.commands()[-1][-4:], ['run','remind:lessons','--',flag])

if __name__ == '__main__':
    unittest.main(verbosity=2)
