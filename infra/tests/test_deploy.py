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
        for name in ['apply.sh', 'backup.sh', 'restore-test.sh', 'health-check.sh', 'job.sh', 'alert.sh', 'install-timers.sh', 'compose.yaml']:
            text = (SOURCE / name).read_text().replace('ROOT=/opt/iepf', f'ROOT={self.root}')
            (self.bundle / name).write_text(text)
        import shutil
        shutil.copytree(SOURCE / 'systemd', self.bundle / 'systemd')
        for name in ['host.env', 'backend.env', 'postgres.env']:
            (self.root / 'shared' / name).write_text('TEST=true\n')
        (self.root / 'shared' / 'backup.key').write_text('test-passphrase\n')
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
    if args[0]=='logs': print('ready to accept connections\\nready to accept connections')
    if args[0]=='exec':
        if fail=='backup': sys.exit(1)
        if 'select count(*) from users' in args: print('0' if fail=='restore' else '3')
        elif not ('-i' in args and fail==''): print('-- test dump')
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

    def test_alert_posts_the_failed_unit(self):
        (self.root / 'shared' / 'host.env').write_text('ALERT_WEBHOOK_URL=https://alerts.example/topic?a=b\n')
        r = subprocess.run(['bash', str(self.bundle / 'alert.sh'), 'iepf-backup.service'], env=self.env, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        call = self.commands()[-1]
        self.assertEqual(call[0], 'curl')
        self.assertIn('https://alerts.example/topic?a=b', call)
        self.assertTrue(any('iepf-backup.service' in arg for arg in call))

    def test_alert_without_url_warns_and_calls_nothing(self):
        r = subprocess.run(['bash', str(self.bundle / 'alert.sh'), 'iepf-backup.service'], env=self.env, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('nobody was notified', r.stderr)
        self.assertEqual(self.commands(), [])

    def test_alert_reports_a_failed_delivery(self):
        (self.root / 'shared' / 'host.env').write_text('ALERT_WEBHOOK_URL=https://alerts.example\n')
        r = subprocess.run(['bash', str(self.bundle / 'alert.sh'), 'x'], env=dict(self.env, FAIL='http'), capture_output=True, text=True)
        self.assertNotEqual(r.returncode, 0)

    def test_backup_pings_heartbeat_only_after_success(self):
        (self.root / 'shared' / 'host.env').write_text('BACKUP_HEARTBEAT_URL=https://ping.example/id\n')
        run = lambda failure: subprocess.run(['bash', str(self.bundle / 'backup.sh')], env=dict(self.env, FAIL=failure), capture_output=True, text=True)
        self.assertNotEqual(run('upload').returncode, 0)
        self.assertFalse(any(c[0] == 'curl' for c in self.commands()))
        self.assertEqual(run('').returncode, 0)
        self.assertIn('https://ping.example/id', self.commands()[-1])

    def test_failed_heartbeat_does_not_fail_the_backup(self):
        (self.root / 'shared' / 'host.env').write_text('BACKUP_HEARTBEAT_URL=https://ping.example/id\n')
        r = subprocess.run(['bash', str(self.bundle / 'backup.sh')], env=dict(self.env, FAIL='http'), capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('Backup heartbeat failed', r.stderr)

    def test_backup_keeps_an_encrypted_copy_of_the_configuration(self):
        r = subprocess.run(['bash', str(self.bundle / 'backup.sh')], env=self.env, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        archive = next((self.root / 'shared' / 'backups').glob('iepf-config-*.tar.gz.gpg'))
        self.assertNotIn(b'TEST=true', archive.read_bytes())
        self.assertTrue(any(c[:2] == ['rclone', 'copy'] and c[-1].endswith('/config') for c in self.commands()))
        (self.root / 'shared' / 'backup.key').unlink()
        r = subprocess.run(['bash', str(self.bundle / 'backup.sh')], env=self.env, capture_output=True, text=True)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('Missing shared/backup.key', r.stderr)

    def test_restore_test_loads_the_newest_backup(self):
        backups = self.root / 'shared' / 'backups'
        backups.mkdir()
        (backups / 'iepf-20261101T010000-1.sql.gz').write_bytes(subprocess.run(['gzip', '-c'], input=b'-- dump', capture_output=True).stdout)
        r = subprocess.run(['bash', str(self.bundle / 'restore-test.sh')], env=self.env, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('3 users', r.stdout)
        r = subprocess.run(['bash', str(self.bundle / 'restore-test.sh')], env=dict(self.env, FAIL='restore'), capture_output=True, text=True)
        self.assertNotEqual(r.returncode, 0)

    def run_health(self, **state):
        # Its own fakes: disk, memory, containers, services, certificate and kernel log.
        fakes = self.base / 'health-bin'
        fakes.mkdir(exist_ok=True)
        scripts = {
            'df': 'echo "Use%"; echo " ${DISK:-40}%"',
            'free': 'echo "Mem: 3900 800 100 30 3000 ${AVAILABLE:-3000}"; echo "Swap: 512 ${SWAP_USED:-10} 502"',
            'docker': 'case "$*" in *traefik*) echo "${TRAEFIK:-running}";; *backend*) echo "${BACKEND:-healthy}";; *) echo healthy;; esac',
            'systemctl': 'echo "${FAILED:-}"',
            'openssl': 'case "$1" in x509) echo "notAfter=$(date -d "+${CERT_DAYS:-60} days" "+%b %d %H:%M:%S %Y GMT")";; esac',
            'journalctl': 'printf "%b" "${KERNEL:-}"',
            'curl': 'echo "$*" >> "$CURL_LOG"; [ "${CURL_FAIL:-}" != 1 ]',
        }
        for name, body in scripts.items():
            (fakes / name).write_text('#!/usr/bin/env bash\n' + body + '\n')
            (fakes / name).chmod(0o755)
        (self.root / 'shared' / 'host.env').write_text('ALERT_WEBHOOK_URL=https://ntfy.example/iepf\n')
        env = dict(self.env, PATH=f'{fakes}:{self.env["PATH"]}', CURL_LOG=str(self.base / 'curl.log'), **state)
        return subprocess.run(['bash', str(self.bundle / 'health-check.sh')], env=env, capture_output=True, text=True)

    def alerts(self):
        log = self.base / 'curl.log'
        return log.read_text().splitlines() if log.exists() else []

    def test_health_check_alerts_once_per_change(self):
        self.assertEqual(self.run_health().returncode, 0)
        self.assertEqual(self.alerts(), [])
        r = self.run_health(DISK='85', BACKEND='unhealthy')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(len(self.alerts()), 1)
        self.assertIn('disco al 85%', self.alerts()[0])
        self.assertIn('iepf-backend-1: unhealthy', self.alerts()[0])
        self.run_health(DISK='85', BACKEND='unhealthy')
        self.assertEqual(len(self.alerts()), 1)
        self.run_health()
        self.assertEqual(len(self.alerts()), 2)
        self.assertIn('risolto', self.alerts()[1])

    def test_health_check_covers_memory_services_certificate_and_kernel(self):
        r = self.run_health(AVAILABLE='200', SWAP_USED='500', TRAEFIK='exited', FAILED='logrotate.service', CERT_DAYS='5', KERNEL='[TTM] Buffer eviction failed\\n')
        self.assertEqual(r.returncode, 0, r.stderr)
        alert = self.alerts()[0]
        for text in ['RAM disponibile 200 MB', 'swap usato al 97%', 'traefik: exited', 'servizi in errore: logrotate.service', 'certificato TLS in scadenza tra', "1 errori del kernel"]:
            self.assertIn(text, alert)

    def test_health_check_retries_an_alert_that_was_not_sent(self):
        self.assertNotEqual(self.run_health(DISK='90', CURL_FAIL='1').returncode, 0)
        self.run_health(DISK='90')
        self.assertEqual(len(self.alerts()), 2)

    def run_install_timers(self, crontab):
        (self.previous / 'systemd').mkdir()
        (self.previous / 'alert.sh').write_text('')
        for name, body in [('crontab', crontab), ('systemctl', ''), ('install', '')]:
            path = self.bin / name
            path.write_text('#!/bin/bash\n' + body)
            path.chmod(0o755)
        return subprocess.run(['bash', str(self.bundle / 'install-timers.sh')], env=self.env, capture_output=True, text=True)

    def test_install_timers_works_without_a_crontab(self):
        r = self.run_install_timers('[[ "$1" != -l ]] || { echo "no crontab for root" >&2; exit 1; }\n')
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_install_timers_keeps_unrelated_cron_jobs(self):
        r = self.run_install_timers('[[ "$1" != -l ]] || printf "0 1 * * * other\\n0 2 * * * /opt/infra/iepf/backup-postgres.sh\\n"\n')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual((self.root / 'shared' / 'crontab.after-timers').read_text(), '0 1 * * * other\n')

    def test_alert_survives_a_rollback(self):
        self.assertIn('/opt/iepf/shared/alert.sh', (SOURCE / 'systemd' / 'iepf-alert@.service').read_text())
        self.assertIn('"$ROOT/shared/alert.sh"', (SOURCE / 'install-timers.sh').read_text())

    def test_cleanup_job_runs_its_script(self):
        r = subprocess.run(['bash', str(self.bundle / 'job.sh'), 'cleanup-data'], env=self.env, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self.commands()[-1][-2:], ['run', 'cleanup:data'])

    def test_every_timer_is_enabled_by_install_timers(self):
        script = (SOURCE / 'install-timers.sh').read_text()
        for timer in (SOURCE / 'systemd').glob('*.timer'):
            self.assertEqual(script.count(timer.name), 2, timer.name)

    def test_scheduled_units_alert_on_failure(self):
        for name in ['iepf-job@.service', 'iepf-backup.service', 'iepf-restore-test.service', 'iepf-health.service']:
            self.assertIn('OnFailure=iepf-alert@%n.service', (SOURCE / 'systemd' / name).read_text())

if __name__ == '__main__':
    unittest.main(verbosity=2)
