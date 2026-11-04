"""Safety and persistence checks for local orchestration; no real Docker commands."""
import importlib.util
import fcntl
import os
from pathlib import Path
import tempfile
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

    def test_rejects_ambiguous_port_configuration(self):
        with patch.dict(os.environ, DEV_DB_PORT='3000', FRONTEND_PORT='3000'):
            with self.assertRaisesRegex(RuntimeError, 'distinct'):
                local.prepare()


if __name__ == '__main__':
    unittest.main(verbosity=2)
