"""Safety and persistence checks for local orchestration; no real Docker commands."""
import importlib.util
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('local_dev', Path(__file__).resolve().parents[1] / 'dev/local.py')
local = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local)


class LocalTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.patch = patch.object(local, 'HOME', self.home)
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def test_setup_preserves_existing_files_and_keys(self):
        local.prepare()
        first = (self.home / 'backend.env').read_bytes()
        (self.home / 'frontend.env').write_text('CUSTOM=true\n')
        local.prepare()
        self.assertEqual((self.home / 'backend.env').read_bytes(), first)
        self.assertEqual((self.home / 'frontend.env').read_text(), 'CUSTOM=true\n')
        self.assertEqual((self.home / 'backend.env').stat().st_mode & 0o777, 0o600)

    def test_ports_are_configurable_and_propagated(self):
        with patch.dict(os.environ, DEV_DB_PORT='55432', FRONTEND_PORT='3300'):
            local.prepare()
        backend = local.read_env(self.home / 'backend.env')
        self.assertIn(':55432/iepf_dev', backend['DATABASE_URL'])
        self.assertEqual(backend['SITE_URL'], 'http://localhost:3300')

    def test_refuses_external_database_before_seed_or_reset(self):
        local.prepare()
        (self.home / 'backend.env').write_text('DATABASE_URL=postgresql://user:pass@production/iepf_dev\nNODE_ENV=development\n')
        with patch.object(local, 'node_environment', return_value={}):
            with self.assertRaisesRegex(RuntimeError, 'Refusing'):
                local.local_database()

    def test_refuses_remote_docker_context_even_for_down(self):
        local.prepare()
        with patch.dict(os.environ, DOCKER_HOST='ssh://root@production'):
            with patch.object(local, 'run') as run:
                with self.assertRaisesRegex(RuntimeError, 'remote Docker'):
                    local.compose('down')
                run.assert_not_called()

    def test_test_startup_failure_cleans_up_ephemeral_database(self):
        def failing_compose(*args):
            if args[0] == 'up':
                raise RuntimeError('Docker startup failed')
        with patch('sys.argv', ['local.py', 'test']), patch.object(local, 'local_database', return_value={}):
            with patch.object(local, 'compose', side_effect=failing_compose) as compose:
                with self.assertRaisesRegex(RuntimeError, 'startup failed'):
                    local.main()
                removals = [c for c in compose.call_args_list if c.args[0] == 'rm']
                self.assertEqual(len(removals), 2)

    def test_concurrent_tests_cannot_destroy_each_others_database(self):
        local.prepare()
        with (self.home / 'test.lock').open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with patch('sys.argv', ['local.py', 'test']), patch.object(local, 'local_database', return_value={}):
                with patch.object(local, 'compose') as compose:
                    with self.assertRaisesRegex(RuntimeError, 'Another test run'):
                        local.main()
                    compose.assert_not_called()

    def test_e2e_runs_playwright_on_a_fresh_test_database(self):
        local.prepare()
        with patch('sys.argv', ['local.py', 'e2e']), patch.object(local, 'local_database', return_value={}):
            with patch.object(local, 'compose') as compose, patch.object(local, 'pnpm') as pnpm, patch.object(local, 'run') as run:
                local.main()
        pnpm.assert_called_once_with('db:migrate', test=True)
        self.assertEqual(run.call_args_list[-1].args[0][-2:], ['playwright', 'test'])
        self.assertEqual(run.call_args_list[-1].kwargs['env']['FRONTEND_PORT'], '3000')
        self.assertEqual([c.args[0] for c in compose.call_args_list if c.args[0] == 'rm'], ['rm', 'rm'])

    def test_seed_full_migrates_before_running_existing_pipeline(self):
        with patch('sys.argv', ['local.py', 'seed-full']), patch.object(local, 'start_infra'):
            with patch.object(local, 'pnpm') as pnpm:
                local.main()
                self.assertEqual([call.args for call in pnpm.call_args_list], [('db:migrate',), ('seed:all-mock-data',)])

    def test_clear_requires_explicit_confirmation(self):
        with patch('sys.argv', ['local.py', 'db-clear']), patch.object(local, 'compose') as compose:
            with self.assertRaisesRegex(RuntimeError, 'make db-clear CONFIRM=yes'):
                local.main()
            compose.assert_not_called()

    def test_clear_migrates_empty_database_without_reseeding(self):
        with patch('sys.argv', ['local.py', 'db-clear', '--confirm']):
            with patch.object(local, 'stop_apps'), patch.object(local, 'local_database', return_value={}), patch.object(local, 'start_infra'):
                with patch.object(local, 'compose') as compose, patch.object(local, 'pnpm') as pnpm:
                    local.main()
                    self.assertIn('DROP DATABASE iepf_dev WITH (FORCE)', compose.call_args.args)
                    self.assertIn('CREATE DATABASE iepf_dev OWNER iepf', compose.call_args.args)
                    self.assertEqual([call.args for call in pnpm.call_args_list], [('db:migrate',)])

    def test_paths_follow_the_monorepo_layout(self):
        root = Path(__file__).resolve().parents[2]
        self.assertEqual(local.ROOT, root)
        self.assertEqual(local.BACKEND, root / 'apps/backend')
        self.assertEqual(local.FRONTEND, root / 'apps/frontend')
        self.assertEqual(local.INFRA, root / 'infra')
        for path in (local.BACKEND, local.FRONTEND, local.ROOT):
            self.assertTrue((path / 'package.json').exists())
        self.assertTrue((local.INFRA / 'docker-compose-dev.yml').exists())

    def test_setup_installs_the_workspace_once_from_the_root(self):
        with patch('sys.argv', ['local.py', 'setup']), patch.object(local, 'node_environment', return_value={}):
            with patch.object(local, 'run') as run:
                local.main()
        self.assertEqual(run.call_count, 1)
        self.assertEqual(run.call_args.kwargs['cwd'], local.ROOT)
        self.assertEqual(run.call_args.args[0][-2:], ['install', '--frozen-lockfile'])

    def test_check_runs_each_script_inside_each_app(self):
        with patch('sys.argv', ['local.py', 'check']), patch.object(local, 'node_environment', return_value={}):
            with patch.object(local, 'run') as run:
                local.main()
        calls = [(c.kwargs['cwd'], c.args[0][-1]) for c in run.call_args_list]
        self.assertEqual(calls, [(app, script) for app in (local.BACKEND, local.FRONTEND) for script in ('typecheck', 'lint', 'build')])

    def test_default_local_home_is_at_the_repository_root(self):
        source = (local.INFRA / 'dev/local.py').read_text()
        self.assertIn("ROOT / '.local'", source)
        self.assertIn('.local/', (local.ROOT / '.gitignore').read_text().splitlines())

    def start_supervisor(self):
        # Same process identity as dev(): the launcher path appears in its command line.
        pidfile = self.home / 'processes.json'
        ready = self.home / 'ready'
        code = ('import os, pathlib, signal, sys, time\n'
                'def stop(*_):\n'
                '    pathlib.Path(sys.argv[1]).unlink(missing_ok=True)\n'
                '    os._exit(0)\n'
                'signal.signal(signal.SIGTERM, stop)\n'
                'pathlib.Path(sys.argv[2]).touch()\n'
                'time.sleep(30)\n')
        process = subprocess.Popen([sys.executable, '-c', code, str(pidfile), str(ready), str(Path(local.__file__).resolve())])
        self.addCleanup(process.wait)
        self.addCleanup(process.kill)
        for _ in range(200):
            if ready.exists():
                return process, pidfile
            time.sleep(0.05)
        self.fail('Fake supervisor did not start')

    def test_stop_recognizes_supervisor_from_another_locale_and_timezone(self):
        process, pidfile = self.start_supervisor()
        with patch.dict(os.environ, TZ='Asia/Tokyo', LC_ALL='it_IT.UTF-8'):
            started = local.process_start(process.pid)
        pidfile.write_text(json.dumps({'supervisor': process.pid, 'started': started, 'children': []}))
        with patch.dict(os.environ, TZ='America/New_York', LC_ALL='C'):
            local.stop_apps()
        self.assertEqual(process.wait(timeout=5), 0)
        self.assertFalse(pidfile.exists())

    def test_stop_never_signals_a_reused_pid(self):
        process, pidfile = self.start_supervisor()
        pidfile.write_text(json.dumps({'supervisor': process.pid, 'started': 'Thu Jan  1 00:00:00 1970', 'children': []}))
        local.stop_apps()
        self.assertIsNone(process.poll())
        self.assertFalse(pidfile.exists())

    def test_rejects_ambiguous_port_configuration(self):
        with patch.dict(os.environ, DEV_DB_PORT='3000', FRONTEND_PORT='3000'):
            with self.assertRaisesRegex(RuntimeError, 'distinct'):
                local.prepare()


if __name__ == '__main__':
    unittest.main(verbosity=2)
