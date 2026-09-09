#!/usr/bin/env python3

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import b04_camera as B04  # noqa: E402


class KeycloakPortPreflightTests(unittest.TestCase):
    def test_explicit_b02_keycloak_port_is_checked_before_startup(self) -> None:
        original = B04.b02.PORTS["keycloak"]
        checked: list[int] = []
        try:
            with patch.dict(os.environ, {"B02_KEYCLOAK_PORT": "28083"}), patch.object(
                B04, "port_free", side_effect=lambda port, *_: checked.append(port) or True
            ):
                B04.preflight_ports()
            self.assertIn(28083, checked)
            self.assertNotIn(28080, checked)
        finally:
            B04.b02.PORTS["keycloak"] = original

    def test_invalid_b02_keycloak_port_fails_before_startup(self) -> None:
        with patch.dict(os.environ, {"B02_KEYCLOAK_PORT": "not-a-port"}):
            with self.assertRaisesRegex(B04.b02.B02Error, "must be an integer"):
                B04.preflight_ports()


if __name__ == "__main__":
    unittest.main(verbosity=2)
