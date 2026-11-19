const Desklet = imports.ui.desklet;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const St = imports.gi.St;
const Mainloop = imports.mainloop;
const ByteArray = imports.byteArray;
const PopupMenu = imports.ui.popupMenu;
const Settings = imports.ui.settings;

const MIN_SIZE = 0.75;
const MAX_SIZE = 1.5;
const DEFAULT_SIZE = 1;

class NetworkInfoDesklet extends Desklet.Desklet {
    constructor(metadata, deskletId) {
        super(metadata, deskletId);

        this.size = DEFAULT_SIZE;

        try {
            this._menuManager = new PopupMenu.PopupMenuManager(this);
        } catch (e) {
            global.logError(e);
        }

        this.settings = new Settings.DeskletSettings(this, metadata.uuid, deskletId);
        this.settings.bind("size", "size", this._applySize);

        this._previousCounters = null;
        this._timer = 0;
        this._publicIp = _("Consultando...");
        this._lastPublicIpRequest = 0;
        this._removed = false;
        this._sessionReceived = 0;
        this._sessionSent = 0;
        this._copyFeedbackTimeouts = [];
        this._interfaceLabel = new St.Label({
            text: "",
            style: "font-size: 9px; color: #9eabc0;"
        });

        this._status = new St.Label({
            text: "● " + _("ACTIVA"),
            style: "font-size: 10px; color: #6ee7a8;"
        });

        this._download = new St.Label({
            text: "—",
            style: "font-size: 21px; font-weight: bold; color: #ffffff;"
        });
        this._upload = new St.Label({
            text: "—",
            style: "font-size: 21px; font-weight: bold; color: #ffffff;"
        });
        this._localIp = new St.Label({ text: _("Consultando...") });
        this._publicIpLabel = new St.Label({ text: this._publicIp });
        this._sessionLabel = new St.Label({
            text: _("Sesión: ↓ 0 B  ↑ 0 B"),
            style: "font-size: 9px; color: #9eabc0;"
        });

        const content = new St.BoxLayout({
            vertical: true,
            style: "min-width: 280px; padding: 14px; spacing: 10px; " +
                "background-color: rgba(24, 30, 42, 0.96); border-radius: 12px;"
        });

        const heading = new St.BoxLayout({ vertical: false });
        const title = new St.Label({
            text: _("RED EN VIVO"),
            style: "font-size: 12px; font-weight: bold; color: #dce6f5;"
        });
        title.set_x_expand(true);
        heading.add_child(title);
        const headingRight = new St.BoxLayout({ vertical: true, style: "spacing: 1px;" });
        headingRight.add_child(this._status);
        headingRight.add_child(this._interfaceLabel);
        heading.add_child(headingRight);

        const speeds = new St.BoxLayout({ vertical: false, style: "spacing: 8px;" });
        const downloadCard = this._createMetric(_("↓  DESCARGA"), this._download, "#65b8ff");
        const uploadCard = this._createMetric(_("↑  SUBIDA"), this._upload, "#b69cff");
        downloadCard.set_x_expand(true);
        uploadCard.set_x_expand(true);
        speeds.add_child(downloadCard);
        speeds.add_child(uploadCard);

        content.add_child(heading);
        content.add_child(speeds);
        content.add_child(this._createIpRow(_("IP LOCAL"), this._localIp));
        content.add_child(this._createIpRow(_("IP PÚBLICA"), this._publicIpLabel));
        content.add_child(this._sessionLabel);

        const footer = new St.BoxLayout({ vertical: false });
        const credit = new St.Button({
            label: "by Alxndr",
            style: "padding: 3px 7px; color: #65b8ff; font-size: 9px; " +
                "font-weight: bold; text-decoration: underline; " +
                "background-color: rgba(101, 184, 255, 0.12); border-radius: 5px;",
            can_focus: true,
            track_hover: true
        });
        credit.connect("clicked", () => {
            try {
                Gio.app_info_launch_default_for_uri(
                    "https://github.com/Alexanderrr9414",
                    global.create_app_launch_context()
                );
            } catch (error) {
                global.logError("Desklet de red: no se pudo abrir el perfil de GitHub: " + error);
            }
        });
        footer.add_child(credit);
        content.add_child(footer);

        this.setHeader(_("Red"));
        this.setContent(content);

        if (!this.size) {
            this.size = DEFAULT_SIZE;
        }
        this.actor.set_scale(this.size, this.size);
    }

    _applySize() {
        if (!this.actor || !this.size) {
            return;
        }
        this.actor.set_scale(this.size, this.size);
    }

    _createMetric(title, value, accent) {
        const card = new St.BoxLayout({
            vertical: true,
            style: "spacing: 5px; padding: 10px; " +
                "background-color: rgba(255, 255, 255, 0.07); border-radius: 8px;"
        });
        const label = new St.Label({
            text: title,
            style: "font-size: 9px; font-weight: bold; color: " + accent + ";"
        });
        card.add_child(label);
        card.add_child(value);
        return card;
    }

    _createIpRow(title, value) {
        const section = new St.BoxLayout({
            vertical: true,
            style: "spacing: 3px; padding: 7px 9px; " +
                "background-color: rgba(255, 255, 255, 0.05); border-radius: 7px;"
        });
        const label = new St.Label({
            text: title,
            style: "font-size: 9px; font-weight: bold; color: #9eabc0;"
        });
        const heading = new St.BoxLayout({ vertical: false });
        const copyButton = new St.Button({
            label: _("Copiar"),
            style: "padding: 2px 6px; color: #65b8ff; font-size: 9px; " +
                "background-color: rgba(101, 184, 255, 0.1); border-radius: 4px;",
            can_focus: true,
            track_hover: true
        });
        copyButton.set_accessible_name(_("Copiar ") + title.toLowerCase());
        copyButton.connect("clicked", () => this._copyIp(value, copyButton));
        label.set_x_expand(true);
        heading.add_child(label);
        heading.add_child(copyButton);
        value.style = "font-size: 12px; color: #f1f5fb;";
        value.clutter_text.set_line_wrap(true);
        section.add_child(heading);
        section.add_child(value);
        return section;
    }

    _copyIp(valueLabel, button) {
        const value = valueLabel.text.trim();
        const unavailable = [
            "",
            _("Consultando..."),
            _("Sin conexión"),
            _("No disponible")
        ];
        if (unavailable.includes(value)) {
            return;
        }

        try {
            St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, value);
            button.label = _("¡Copiado!");
            button.style = "padding: 2px 6px; color: #6ee7a8; font-size: 9px; " +
                "background-color: rgba(110, 231, 168, 0.12); border-radius: 4px;";
            const timeout = Mainloop.timeout_add(1400, () => {
                button.label = _("Copiar");
                button.style = "padding: 2px 6px; color: #65b8ff; font-size: 9px; " +
                    "background-color: rgba(101, 184, 255, 0.1); border-radius: 4px;";
                this._copyFeedbackTimeouts = this._copyFeedbackTimeouts.filter(
                    id => id !== timeout
                );
                return false;
            });
            this._copyFeedbackTimeouts.push(timeout);
        } catch (error) {
            global.logError("Desklet de red: no se pudo copiar la IP: " + error);
        }
    }

    on_desklet_added_to_desktop() {
        this._removed = false;
        this._update();
        this._timer = Mainloop.timeout_add_seconds(1, () => {
            this._update();
            return true;
        });
    }

    on_desklet_removed() {
        this._removed = true;
        if (this._timer) {
            Mainloop.source_remove(this._timer);
            this._timer = 0;
        }
        for (const timeout of this._copyFeedbackTimeouts) {
            Mainloop.source_remove(timeout);
        }
        this._copyFeedbackTimeouts = [];
    }

    _readFile(path) {
        const [ok, bytes] = GLib.file_get_contents(path);
        if (!ok) {
            throw new Error("No se pudo leer " + path);
        }
        return ByteArray.toString(bytes);
    }

    _getDefaultInterface() {
        const routes = this._readFile("/proc/net/route").split("\n");
        for (let i = 1; i < routes.length; i++) {
            const fields = routes[i].trim().split(/\s+/);
            if (fields.length > 3 && fields[1] === "00000000" &&
                (parseInt(fields[3], 16) & 1) !== 0) {
                return fields[0];
            }
        }
        return null;
    }

    _getCounters() {
        const defaultInterface = this._getDefaultInterface();
        const lines = this._readFile("/proc/net/dev").split("\n");
        let received = 0;
        let sent = 0;
        let found = false;

        for (let i = 2; i < lines.length; i++) {
            const match = lines[i].match(/^\s*([^:]+):\s*(.*)$/);
            if (!match) {
                continue;
            }
            const interfaceName = match[1].trim();
            if (defaultInterface && interfaceName !== defaultInterface) {
                continue;
            }
            if (!defaultInterface && interfaceName === "lo") {
                continue;
            }

            const values = match[2].trim().split(/\s+/).map(Number);
            if (values.length >= 9) {
                received += values[0];
                sent += values[8];
                found = true;
            }
        }

        if (!found) {
            throw new Error("No se encontró una interfaz de red activa");
        }
        return {
            received,
            sent,
            interfaceName: defaultInterface || _("Todas"),
            at: GLib.get_monotonic_time()
        };
    }

    _getLocalIps() {
        const [ok, stdout, stderr, status] =
            GLib.spawn_command_line_sync("ip -o -4 addr show scope global");
        if (!ok || status !== 0) {
            throw new Error(ByteArray.toString(stderr) || "Falló la consulta de IP local");
        }

        const output = ByteArray.toString(stdout);
        const addresses = [];
        for (const line of output.split("\n")) {
            const match = line.match(/\binet\s+([0-9.]+)\//);
            if (match && !addresses.includes(match[1])) {
                addresses.push(match[1]);
            }
        }
        return addresses.length ? addresses.join(", ") : _("Sin conexión");
    }

    _formatRate(bytesPerSecond) {
        const bitsPerSecond = Math.max(0, bytesPerSecond) * 8;
        if (bitsPerSecond < 1000000) {
            return (bitsPerSecond / 1000).toFixed(0) + " Kbps";
        }
        return (bitsPerSecond / 1000000).toFixed(2) + " Mbps";
    }

    _formatBytes(bytes) {
        if (bytes < 1024) {
            return Math.round(bytes) + " B";
        }
        if (bytes < 1024 * 1024) {
            return (bytes / 1024).toFixed(1) + " KB";
        }
        if (bytes < 1024 * 1024 * 1024) {
            return (bytes / (1024 * 1024)).toFixed(1) + " MB";
        }
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
    }

    _update() {
        try {
            const current = this._getCounters();
            if (this._previousCounters) {
                const elapsed = (current.at - this._previousCounters.at) / 1000000;
                if (elapsed > 0) {
                    if (current.interfaceName === this._previousCounters.interfaceName) {
                        this._sessionReceived += Math.max(
                            0,
                            current.received - this._previousCounters.received
                        );
                        this._sessionSent += Math.max(
                            0,
                            current.sent - this._previousCounters.sent
                        );
                    }
                    this._download.text = this._formatRate(
                        (current.received - this._previousCounters.received) / elapsed
                    );
                    this._upload.text = this._formatRate(
                        (current.sent - this._previousCounters.sent) / elapsed
                    );
                }
            }
            this._previousCounters = current;
            this._interfaceLabel.text = current.interfaceName;
            this._sessionLabel.text = _("Sesión: ↓ ") + this._formatBytes(this._sessionReceived) +
                "  ↑ " + this._formatBytes(this._sessionSent);
            this._status.text = "● " + _("ACTIVA");
            this._status.style = "font-size: 10px; color: #6ee7a8;";
        } catch (error) {
            global.logError("Desklet de red: " + error);
            this._download.text = _("No disponible");
            this._upload.text = _("No disponible");
            this._status.text = "● " + _("SIN DATOS");
            this._status.style = "font-size: 10px; color: #ff8f8f;";
        }

        try {
            this._localIp.text = this._getLocalIps();
        } catch (error) {
            global.logError("Desklet de red: " + error);
            this._localIp.text = _("No disponible");
        }

        const now = GLib.get_monotonic_time();
        if (now - this._lastPublicIpRequest >= 60000000) {
            this._lastPublicIpRequest = now;
            this._fetchPublicIp();
        }
    }

    _fetchPublicIp() {
        let process;
        try {
            process = Gio.Subprocess.new(
                ["/usr/bin/curl", "--fail", "--silent", "--show-error",
                    "--max-time", "5", "https://api.ipify.org"],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );
        } catch (error) {
            global.logError("Desklet de red: no se pudo iniciar la consulta de IP pública: " + error);
            this._publicIpLabel.text = _("No disponible");
            return;
        }

        process.communicate_utf8_async(null, null, (source, result) => {
            if (this._removed) {
                return;
            }
            try {
                const [ok, stdout, stderr] = source.communicate_utf8_finish(result);
                const address = (stdout || "").trim();
                if (!ok || !Gio.InetAddress.new_from_string(address)) {
                    throw new Error((stderr || "").trim() || "Respuesta de IP pública no válida");
                }
                this._publicIp = address;
                this._publicIpLabel.text = address;
            } catch (error) {
                global.logError("Desklet de red: no se pudo consultar la IP pública: " + error);
                this._publicIp = _("No disponible");
                this._publicIpLabel.text = this._publicIp;
            }
        });
    }

    finalizeContextMenu() {
        super.finalizeContextMenu();

        const resize = new PopupMenu.PopupSubMenuMenuItem(_("Redimensionar"));
        this._sizeSlider = new PopupMenu.PopupSliderMenuItem(
            (this.size - MIN_SIZE) / (MAX_SIZE - MIN_SIZE)
        );
        this._sizeSlider.connect("value-changed", (slider, value) => {
            this.size = Math.round((MIN_SIZE + value * (MAX_SIZE - MIN_SIZE)) * 20) / 20;
            this._applySize();
            slider.setValue((this.size - MIN_SIZE) / (MAX_SIZE - MIN_SIZE));
        });
        resize.menu.addMenuItem(this._sizeSlider);
        resize.menu.addAction(_("Aumentar tamaño"), () => {
            this.size = Math.min(MAX_SIZE, Math.round((this.size + 0.05) * 20) / 20);
            this._applySize();
            this._sizeSlider.setValue((this.size - MIN_SIZE) / (MAX_SIZE - MIN_SIZE));
        });
        resize.menu.addAction(_("Disminuir tamaño"), () => {
            this.size = Math.max(MIN_SIZE, Math.round((this.size - 0.05) * 20) / 20);
            this._applySize();
            this._sizeSlider.setValue((this.size - MIN_SIZE) / (MAX_SIZE - MIN_SIZE));
        });
        resize.menu.addAction(_("Tamaño normal"), () => {
            this.size = DEFAULT_SIZE;
            this._applySize();
            this._sizeSlider.setValue((DEFAULT_SIZE - MIN_SIZE) / (MAX_SIZE - MIN_SIZE));
        });
        this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._menu.addMenuItem(resize);
    }
}

function main(metadata, deskletId) {
    return new NetworkInfoDesklet(metadata, deskletId);
}
