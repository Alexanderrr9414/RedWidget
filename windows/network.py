import ctypes
import ipaddress
import socket
import time

import psutil


NO_CONNECTION = "Sin conexión"


def rate_text(bytes_per_second):
    bits_per_second = max(0, bytes_per_second) * 8
    if bits_per_second < 1_000_000:
        return f"{bits_per_second / 1_000:.0f} Kbps"
    return f"{bits_per_second / 1_000_000:.2f} Mbps"


def byte_text(byte_count):
    if byte_count < 1024:
        return f"{byte_count:.0f} B"
    if byte_count < 1024**2:
        return f"{byte_count / 1024:.1f} KB"
    if byte_count < 1024**3:
        return f"{byte_count / 1024**2:.1f} MB"
    return f"{byte_count / 1024**3:.2f} GB"


class NetworkSampler:
    def __init__(self):
        self.previous = None
        self.session_received = 0
        self.session_sent = 0

    @staticmethod
    def _default_interface():
        try:
            destination = int.from_bytes(socket.inet_aton("1.1.1.1"), "little")
            index = ctypes.c_ulong()
            get_best_interface = ctypes.WinDLL("iphlpapi").GetBestInterface
            get_best_interface.argtypes = (ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong))
            get_best_interface.restype = ctypes.c_ulong
            result = get_best_interface(destination, ctypes.byref(index))
            if result == 0:
                return dict(socket.if_nameindex()).get(index.value)
        except (AttributeError, OSError, socket.error):
            pass
        return None

    @staticmethod
    def _fallback_interface():
        addresses = psutil.net_if_addrs()
        stats = psutil.net_if_stats()
        for name, entries in addresses.items():
            if not stats.get(name) or not stats[name].isup:
                continue
            if any(
                entry.family == socket.AF_INET
                and not ipaddress.ip_address(entry.address).is_loopback
                for entry in entries
            ):
                return name
        return None

    def sample(self):
        counters = psutil.net_io_counters(pernic=True)
        interface = self._default_interface()
        interface_stats = psutil.net_if_stats()
        if (
            interface not in counters
            or not interface_stats.get(interface)
            or not interface_stats[interface].isup
        ):
            interface = self._fallback_interface()
        if not interface or interface not in counters:
            self.previous = None
            return {
                "interface": NO_CONNECTION,
                "download": "—",
                "upload": "—",
                "received": self.session_received,
                "sent": self.session_sent,
            }

        current = counters[interface]
        now = time.monotonic()
        download = upload = "—"
        if self.previous and self.previous["interface"] == interface:
            elapsed = now - self.previous["time"]
            if elapsed > 0:
                received_delta = max(0, current.bytes_recv - self.previous["received"])
                sent_delta = max(0, current.bytes_sent - self.previous["sent"])
                self.session_received += received_delta
                self.session_sent += sent_delta
                download = rate_text(received_delta / elapsed)
                upload = rate_text(sent_delta / elapsed)

        self.previous = {
            "interface": interface,
            "received": current.bytes_recv,
            "sent": current.bytes_sent,
            "time": now,
        }
        return {
            "interface": interface,
            "download": download,
            "upload": upload,
            "received": self.session_received,
            "sent": self.session_sent,
        }

    @staticmethod
    def local_ips(interface):
        if interface == NO_CONNECTION:
            return NO_CONNECTION
        values = []
        for entry in psutil.net_if_addrs().get(interface, []):
            if entry.family not in (socket.AF_INET, socket.AF_INET6):
                continue
            address = entry.address.split("%", 1)[0]
            parsed = ipaddress.ip_address(address)
            if not parsed.is_loopback and not parsed.is_link_local and address not in values:
                values.append(address)
        return ", ".join(values) if values else NO_CONNECTION
