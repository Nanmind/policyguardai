import os
import unittest
from unittest.mock import patch
from scripts.run_local import birth


@unittest.skipIf(os.name == 'nt', 'Linux /proc process-state parser')
class LauncherIdentity(unittest.TestCase):
    def test_zombie_is_not_running(self):
        stat = '123 (process with spaces) ' + ' '.join(['Z'] + ['0'] * 18 + ['999'])
        with patch('scripts.run_local.Path.read_text', return_value=stat):
            self.assertIsNone(birth(123))

    def test_live_identity_includes_start_time(self):
        stat = '123 (process with spaces) ' + ' '.join(['S'] + ['0'] * 18 + ['999'])
        with patch('scripts.run_local.Path.read_text', return_value=stat):
            self.assertEqual(birth(123), '999')

    def test_missing_process_has_no_identity(self):
        with patch('scripts.run_local.Path.read_text', side_effect=FileNotFoundError):
            self.assertIsNone(birth(123))
