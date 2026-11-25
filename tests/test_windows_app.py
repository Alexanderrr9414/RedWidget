import sys
import unittest
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src" / "windows"))
import network
import startup


class NetworkFormattingTests(unittest.TestCase):
    def test_formats_rates_and_session_bytes(self):
        self.assertEqual(network.rate_text(0), "0 Kbps")
        self.assertEqual(network.rate_text(125_000), "1.00 Mbps")
        self.assertEqual(network.byte_text(1024), "1.0 KB")
        self.assertEqual(network.byte_text(1024**3), "1.00 GB")


class NetworkSamplerTests(unittest.TestCase):
    def test_accumulates_traffic_only_on_same_interface(self):
        sampler = network.NetworkSampler()
        sampler._default_interface = lambda: "Ethernet"
        counters = [
            {"Ethernet": SimpleNamespace(bytes_recv=1000, bytes_sent=500)},
            {"Ethernet": SimpleNamespace(bytes_recv=2000, bytes_sent=900)},
            {"Ethernet": SimpleNamespace(bytes_recv=2500, bytes_sent=1100)},
        ]
        times = iter((10.0, 12.0, 15.0))

        with (
            patch.object(network.psutil, "net_io_counters", side_effect=counters),
            patch.object(
                network.psutil, "net_if_stats",
                return_value={"Ethernet": SimpleNamespace(isup=True)},
            ),
            patch.object(network.time, "monotonic", side_effect=lambda: next(times)),
        ):
            sampler.sample()
            second = sampler.sample()
            third = sampler.sample()

        self.assertEqual(second["download"], "4 Kbps")
        self.assertEqual(second["upload"], "2 Kbps")
        self.assertEqual(third["received"], 1500)
        self.assertEqual(third["sent"], 600)

    def test_resets_rate_baseline_after_interface_change(self):
        sampler = network.NetworkSampler()
        interfaces = iter(("Ethernet", "Wi-Fi"))
        sampler._default_interface = lambda: next(interfaces)
        with (
            patch.object(
                network.psutil, "net_io_counters",
                side_effect=[
                    {"Ethernet": SimpleNamespace(bytes_recv=1000, bytes_sent=1000)},
                    {"Wi-Fi": SimpleNamespace(bytes_recv=5, bytes_sent=5)},
                ],
            ),
            patch.object(
                network.psutil, "net_if_stats",
                return_value={
                    "Ethernet": SimpleNamespace(isup=True),
                    "Wi-Fi": SimpleNamespace(isup=True),
                },
            ),
            patch.object(network.time, "monotonic", side_effect=(10.0, 11.0)),
        ):
            sampler.sample()
            changed = sampler.sample()

        self.assertEqual(changed["interface"], "Wi-Fi")
        self.assertEqual(changed["download"], "—")
        self.assertEqual(changed["received"], 0)

    def test_local_ip_omits_loopback_and_link_local_addresses(self):
        addresses = {
            "Ethernet": [
                SimpleNamespace(family=network.socket.AF_INET, address="192.168.1.8"),
                SimpleNamespace(family=network.socket.AF_INET, address="127.0.0.1"),
                SimpleNamespace(family=network.socket.AF_INET6, address="fe80::1%12"),
                SimpleNamespace(family=network.socket.AF_INET6, address="fd00::7"),
            ]
        }
        with patch.object(network.psutil, "net_if_addrs", return_value=addresses):
            self.assertEqual(
                network.NetworkSampler.local_ips("Ethernet"),
                "192.168.1.8, fd00::7",
            )


class StartupRegistrationTests(unittest.TestCase):
    def test_enable_disable_and_check_startup_entry(self):
        values = {}
        registry = ModuleType("winreg")
        registry.HKEY_CURRENT_USER = object()
        registry.KEY_QUERY_VALUE = 1
        registry.KEY_SET_VALUE = 2
        registry.REG_SZ = 3

        class RegistryKey:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        def open_key(_root, _path, _reserved, _access):
            if not values:
                raise FileNotFoundError
            return RegistryKey()

        registry.OpenKey = open_key
        registry.CreateKeyEx = lambda *_args: RegistryKey()
        registry.QueryValueEx = lambda _key, name: (values[name], registry.REG_SZ)
        registry.SetValueEx = lambda _key, name, _reserved, _kind, value: values.update(
            {name: value}
        )
        registry.DeleteValue = lambda _key, name: values.pop(name)

        with patch.dict(sys.modules, {"winreg": registry}):
            self.assertFalse(startup.is_startup_enabled())
            startup.set_startup_enabled(True)
            self.assertEqual(values[startup.VALUE_NAME], startup.startup_command())
            self.assertTrue(startup.is_startup_enabled())
            startup.set_startup_enabled(False)
            self.assertFalse(startup.is_startup_enabled())


if __name__ == "__main__":
    unittest.main()
