import json
import os
import queue
import sys
import threading
import time
from pathlib import Path
from tkinter import Button, Frame, Label, Tk, Toplevel, messagebox

import pystray
from PIL import Image, ImageDraw

from network import NO_CONNECTION, NetworkSampler, byte_text
from public_ip import fetch_public_ip
from startup import is_startup_enabled, set_startup_enabled

THEMES = {
    "ocean": {
        "name": "Océano",
        "background": "#181e2a",
        "card": "#292f3b",
        "section": "#242b37",
        "heading": "#dce6f5",
        "text": "#f1f5fb",
        "muted": "#9eabc0",
        "download": "#65b8ff",
        "upload": "#b69cff",
        "button": "#65b8ff",
        "button_bg": "#20364c",
        "success": "#6ee7a8",
    },
    "midnight": {
        "name": "Medianoche",
        "background": "#1a142a",
        "card": "#302744",
        "section": "#29213a",
        "heading": "#f0e5ff",
        "text": "#fff8ff",
        "muted": "#b9a9cc",
        "download": "#c5a1ff",
        "upload": "#ff91c8",
        "button": "#d5baff",
        "button_bg": "#382b4d",
        "success": "#82e6b5",
    },
    "forest": {
        "name": "Bosque",
        "background": "#112620",
        "card": "#203a31",
        "section": "#1b3229",
        "heading": "#ddf7e9",
        "text": "#f0fff6",
        "muted": "#a5c6b3",
        "download": "#75e0ae",
        "upload": "#b4df82",
        "button": "#8aebbb",
        "button_bg": "#254538",
        "success": "#8aebbb",
    },
    "light": {
        "name": "Claro",
        "background": "#eef3fa",
        "card": "#ffffff",
        "section": "#dce5f1",
        "heading": "#263449",
        "text": "#1d2939",
        "muted": "#5b6b80",
        "download": "#1473cf",
        "upload": "#724ac8",
        "button": "#1268b8",
        "button_bg": "#dcecfb",
        "success": "#168454",
    },
}

NO_IP = "No disponible"
class NetworkTrayApp:
    def __init__(self):
        self.root = Tk()
        self.root.withdraw()
        self.root.title("Red en vivo")
        self.root.resizable(False, False)
        self.root.attributes("-topmost", True)
        self.root.protocol("WM_DELETE_WINDOW", self.hide_window)

        self.data_dir = Path(os.environ.get("APPDATA", Path.home())) / "RedEnVivo"
        self.settings_path = self.data_dir / "settings.json"
        self.theme = self._load_theme()
        self.sampler = NetworkSampler()
        self.results = queue.Queue()
        self.closed = False
        self.window = None
        self.last_public_ip_request = 0.0
        self.public_ip = "Consultando..."
        self.startup_error = None
        try:
            self.startup_enabled = is_startup_enabled()
            if getattr(sys, "frozen", False) and not self.startup_enabled:
                set_startup_enabled(True)
                self.startup_enabled = True
        except OSError as error:
            self.startup_enabled = False
            self.startup_error = str(error)

        self._create_widgets()
        self.icon = pystray.Icon(
            "red-en-vivo",
            self._create_icon(),
            "Red en vivo",
            menu=pystray.Menu(
                pystray.MenuItem("Abrir Red en vivo", self._tray_open, default=True),
                pystray.MenuItem(
                    "Tema",
                    pystray.Menu(
                        *[
                            pystray.MenuItem(
                                theme["name"],
                                self._tray_set_theme(key),
                                checked=lambda item, selected=key: self.theme == selected,
                                radio=True,
                            )
                            for key, theme in THEMES.items()
                        ]
                    ),
                ),
                pystray.MenuItem(
                    "Iniciar con Windows",
                    self._tray_toggle_startup,
                    checked=lambda _item: self.startup_enabled,
                ),
                pystray.MenuItem("Actualizar IP pública", self._tray_refresh_public_ip),
                pystray.MenuItem("Salir", self._tray_exit),
            ),
        )
        threading.Thread(target=self.icon.run, daemon=True).start()
        self.root.after(100, self._drain_results)
        self.root.after(1000, self._update)
        if self.startup_error:
            self.root.after(300, self._show_startup_error)
        self._request_public_ip()
        self.root.mainloop()

    def _load_theme(self):
        try:
            data = json.loads(self.settings_path.read_text(encoding="utf-8"))
            theme = data.get("theme", "ocean")
            return theme if theme in THEMES else "ocean"
        except FileNotFoundError:
            return "ocean"
        except (OSError, json.JSONDecodeError) as error:
            print(f"No se pudieron leer los ajustes: {error}")
            return "ocean"

    def _save_theme(self):
        try:
            self.data_dir.mkdir(parents=True, exist_ok=True)
            self.settings_path.write_text(
                json.dumps({"theme": self.theme}, indent=2),
                encoding="utf-8",
            )
        except OSError as error:
            print(f"No se pudo guardar el tema: {error}")

    @staticmethod
    def _create_icon():
        image = Image.new("RGBA", (64, 64), "#181e2a")
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((2, 2, 62, 62), radius=14, fill="#181e2a")
        draw.line((13, 34, 24, 34, 30, 20, 38, 46, 44, 31, 52, 31),
                  fill="#65b8ff", width=5, joint="curve")
        return image

    def _create_widgets(self):
        self.window = Toplevel(self.root)
        self.window.title("Red en vivo")
        self.window.geometry("360x410")
        self.window.resizable(False, False)
        self.window.attributes("-topmost", True)
        self.window.protocol("WM_DELETE_WINDOW", self.hide_window)

        theme = THEMES[self.theme]
        self.content = Frame(self.window, bg=theme["background"], padx=16, pady=14)
        self.content.pack(fill="both", expand=True)

        header = Frame(self.content, bg=theme["background"])
        header.pack(fill="x", pady=(0, 12))
        self.title_label = Label(
            header, text="RED EN VIVO", font=("Segoe UI", 11, "bold"),
            bg=theme["background"], fg=theme["heading"],
        )
        self.title_label.pack(side="left")
        self.status_label = Label(
            header, text="● ACTIVA", font=("Segoe UI", 9),
            bg=theme["background"], fg=theme["success"],
        )
        self.status_label.pack(side="right")
        self.interface_label = Label(
            header, text="", font=("Segoe UI", 8),
            bg=theme["background"], fg=theme["muted"],
        )
        self.interface_label.pack(side="right", padx=(0, 8))

        metrics = Frame(self.content, bg=theme["background"])
        metrics.pack(fill="x", pady=(0, 10))
        self.download_card, self.download_value = self._metric_card(
            metrics, "↓  DESCARGA", theme["download"]
        )
        self.upload_card, self.upload_value = self._metric_card(
            metrics, "↑  SUBIDA", theme["upload"]
        )
        self.download_card.pack(side="left", fill="both", expand=True, padx=(0, 4))
        self.upload_card.pack(side="left", fill="both", expand=True, padx=(4, 0))

        self.ip_rows = {}
        self.ip_labels = {}
        self.copy_buttons = {}
        for key, label in (("local", "IP PRIVADA (LOCAL)"), ("public", "IP PÚBLICA")):
            section = Frame(self.content, bg=theme["section"], padx=10, pady=8)
            section.pack(fill="x", pady=(0, 8))
            row = Frame(section, bg=theme["section"])
            row.pack(fill="x")
            Label(
                row, text=label, font=("Segoe UI", 8, "bold"),
                bg=theme["section"], fg=theme["muted"],
            ).pack(side="left")
            copy = Button(
                row, text="Copiar", command=lambda name=key: self._copy_ip(name),
                relief="flat", borderwidth=0, padx=7, pady=2,
                font=("Segoe UI", 8), cursor="hand2",
            )
            copy.pack(side="right")
            self.copy_buttons[key] = copy
            value = Label(
                section, text="Consultando...", anchor="w", justify="left",
                wraplength=310, font=("Segoe UI", 9),
                bg=theme["section"], fg=theme["text"],
            )
            value.pack(fill="x", pady=(5, 0))
            self.ip_rows[key] = section
            self.ip_labels[key] = value

        self.session_label = Label(
            self.content, text="Sesión: ↓ 0 B  ↑ 0 B",
            font=("Segoe UI", 8), bg=theme["background"], fg=theme["muted"],
        )
        self.session_label.pack(anchor="w", pady=(0, 8))

        footer = Frame(self.content, bg=theme["background"])
        footer.pack(fill="x")
        self.credit = Label(
            footer, text="by Alxndr", cursor="hand2",
            font=("Segoe UI", 8, "bold", "underline"),
            bg=theme["button_bg"], fg=theme["button"], padx=7, pady=3,
        )
        self.credit.pack(side="left")
        self.credit.bind("<Button-1>", lambda _event: self._open_github())
        self.window.withdraw()
        self._apply_theme()

    @staticmethod
    def _metric_card(parent, title, accent):
        card = Frame(parent, padx=10, pady=9)
        Label(card, text=title, font=("Segoe UI", 8, "bold"), anchor="w").pack(fill="x")
        value = Label(card, text="—", font=("Segoe UI", 16, "bold"), anchor="w")
        value.pack(fill="x", pady=(5, 0))
        card._accent = accent
        return card, value

    def _apply_theme(self):
        theme = THEMES[self.theme]
        self.window.configure(bg=theme["background"])
        self.content.configure(bg=theme["background"])
        for widget in (self.title_label, self.status_label, self.interface_label):
            widget.configure(bg=theme["background"])
        self.title_label.configure(fg=theme["heading"])
        status_color = (
            theme["success"]
            if self.status_label.cget("text") == "● ACTIVA"
            else "#ff8f8f"
        )
        self.status_label.configure(fg=status_color)
        self.interface_label.configure(fg=theme["muted"])

        for card, value, accent in (
            (self.download_card, self.download_value, theme["download"]),
            (self.upload_card, self.upload_value, theme["upload"]),
        ):
            card.configure(bg=theme["card"])
            for child in card.winfo_children():
                child.configure(bg=theme["card"])
            card.winfo_children()[0].configure(fg=accent)
            value.configure(fg=theme["text"])

        for key, section in self.ip_rows.items():
            section.configure(bg=theme["section"])
            for child in section.winfo_children():
                child.configure(bg=theme["section"])
                for nested in child.winfo_children():
                    nested.configure(bg=theme["section"])
            section.winfo_children()[0].winfo_children()[0].configure(fg=theme["muted"])
            self.ip_labels[key].configure(fg=theme["text"])
            self.copy_buttons[key].configure(
                bg=theme["button_bg"], fg=theme["button"],
                activebackground=theme["card"], activeforeground=theme["text"],
            )

        self.session_label.configure(bg=theme["background"], fg=theme["muted"])
        self.credit.configure(bg=theme["button_bg"], fg=theme["button"])

    def _set_theme(self, theme):
        if theme not in THEMES:
            return
        self.theme = theme
        self._save_theme()
        self._apply_theme()

    def _tray_set_theme(self, theme):
        return lambda _icon, _item: self.root.after(0, self._set_theme, theme)

    def _tray_open(self, _icon, _item):
        if not self.closed:
            self.root.after(0, self.show_window)

    def _tray_refresh_public_ip(self, _icon, _item):
        if not self.closed:
            self.root.after(0, self._request_public_ip, True)

    def _tray_exit(self, _icon, _item):
        if not self.closed:
            self.root.after(0, self.close)

    def _tray_toggle_startup(self, _icon, _item):
        if not self.closed:
            self.root.after(0, self._toggle_startup)

    def _toggle_startup(self):
        try:
            set_startup_enabled(not self.startup_enabled)
            self.startup_enabled = not self.startup_enabled
        except OSError as error:
            messagebox.showerror(
                "Red en vivo",
                f"No se pudo cambiar el inicio automático:\n{error}",
                parent=self.window,
            )

    def _show_startup_error(self):
        if self.startup_error and not self.closed:
            messagebox.showerror(
                "Red en vivo",
                "No se pudo configurar el inicio automático de Windows:\n"
                + self.startup_error,
                parent=self.window,
            )

    def show_window(self):
        if self.closed:
            return
        self.window.deiconify()
        self.window.lift()
        self.window.focus_force()

    def hide_window(self):
        if self.window:
            self.window.withdraw()

    def _copy_ip(self, key):
        value = self.ip_labels[key].cget("text")
        if value in ("", "Consultando...", NO_CONNECTION) or value.startswith(NO_IP):
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(value)
        button = self.copy_buttons[key]
        button.configure(text="¡Copiado!", fg=THEMES[self.theme]["success"])
        self.root.after(1400, lambda: button.configure(
            text="Copiar", fg=THEMES[self.theme]["button"]
        ))

    def _open_github(self):
        import webbrowser

        webbrowser.open("https://github.com/Alexanderrr9414")

    def _request_public_ip(self, force=False):
        now = time.monotonic()
        if not force and now - self.last_public_ip_request < 60:
            return
        self.last_public_ip_request = now

        def fetch():
            try:
                value = fetch_public_ip()
                self.results.put(("public_ip", value))
            except RuntimeError as error:
                self.results.put(("public_ip_error", str(error)))

        threading.Thread(target=fetch, daemon=True).start()

    def _drain_results(self):
        while True:
            try:
                result, value = self.results.get_nowait()
            except queue.Empty:
                break
            if result == "public_ip":
                self.public_ip = value
                self.ip_labels["public"].configure(text=value)
            else:
                self.public_ip = NO_IP
                self.ip_labels["public"].configure(
                    text=NO_IP + " (revisa Internet/DNS)"
                )
                print(f"No se pudo consultar la IP pública: {value}")
        if not self.closed:
            self.root.after(100, self._drain_results)

    def _update(self):
        if self.closed:
            return
        sample = self.sampler.sample()
        self.download_value.configure(text=sample["download"])
        self.upload_value.configure(text=sample["upload"])
        self.interface_label.configure(text=sample["interface"])
        self.ip_labels["local"].configure(
            text=NetworkSampler.local_ips(sample["interface"])
        )
        self.session_label.configure(
            text=f"Sesión: ↓ {byte_text(sample['received'])}  ↑ {byte_text(sample['sent'])}"
        )
        if sample["interface"] == NO_CONNECTION:
            self.status_label.configure(text="● SIN CONEXIÓN", fg="#ff8f8f")
        else:
            self.status_label.configure(
                text="● ACTIVA", fg=THEMES[self.theme]["success"]
            )
        self._request_public_ip()
        self.root.after(1000, self._update)

    def close(self):
        self.closed = True
        self.icon.stop()
        self.root.destroy()


if __name__ == "__main__":
    NetworkTrayApp()
