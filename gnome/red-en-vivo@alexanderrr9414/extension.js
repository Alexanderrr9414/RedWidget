import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const PUBLIC_IP_SERVICES = [
    'https://api.ipify.org',
    'https://checkip.amazonaws.com',
    'https://ipv4.icanhazip.com',
    'https://api64.ipify.org',
];

export default class RedEnVivoExtension extends Extension {
    enable() {
        this._previousCounters = null;
        this._sessionReceived = 0;
        this._sessionSent = 0;
        this._lastPublicIpRequest = 0;
        this._lastPrivateIpUpdate = 0;
        this._publicIp = '';
        this._publicIpRequestGeneration = 0;
        this._privateIp = '';
        this._disposed = false;
        this._publicIpProcess = null;

        this._indicator = new PanelMenu.Button(0.0, this.gettext('Red en vivo'));
        const panelBox = new St.BoxLayout({style_class: 'panel-status-menu-box'});
        this._icon = new St.Icon({
            icon_name: 'network-transmit-receive-symbolic',
            style_class: 'system-status-icon',
        });
        this._speedLabel = new St.Label({
            text: '↓ --  ↑ --',
            y_align: Clutter.ActorAlign.CENTER,
        });
        panelBox.add_child(this._icon);
        panelBox.add_child(this._speedLabel);
        this._indicator.add_child(panelBox);

        this._interfaceItem = this._addInfoItem(this.gettext('Interfaz: consultando…'));
        this._sessionItem = this._addInfoItem(this.gettext('Sesión: ↓ 0 B  ↑ 0 B'));
        this._privateIpItem = this._addCopyItem(this.gettext('IP privada: consultando…'), 'private');
        this._publicIpItem = this._addCopyItem(this.gettext('IP pública: consultando…'), 'public');
        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const refreshItem = new PopupMenu.PopupMenuItem(this.gettext('Actualizar IP pública'));
        refreshItem.connect('activate', () => this._requestPublicIp(true));
        this._indicator.menu.addMenuItem(refreshItem);
        const creditItem = new PopupMenu.PopupMenuItem('by Alxndr');
        creditItem.connect('activate', () => {
            Gio.AppInfo.launch_default_for_uri(
                'https://github.com/Alexanderrr9414',
                global.create_app_launch_context(0, -1)
            );
        });
        this._indicator.menu.addMenuItem(creditItem);

        Main.panel.addToStatusArea(this.uuid, this._indicator);
        this._update();
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            if (this._disposed)
                return GLib.SOURCE_REMOVE;
            this._update();
            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        this._disposed = true;
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = 0;
        }
        if (this._publicIpProcess) {
            this._publicIpProcess.force_exit();
            this._publicIpProcess = null;
        }
        this._indicator?.destroy();
        this._indicator = null;
    }

    _addInfoItem(text) {
        const item = new PopupMenu.PopupMenuItem(text, {
            reactive: false,
            can_focus: false,
        });
        this._indicator.menu.addMenuItem(item);
        return item;
    }

    _addCopyItem(text, addressType) {
        const item = new PopupMenu.PopupMenuItem(text);
        item.connect('activate', () => {
            const address = addressType === 'private' ? this._privateIp : this._publicIp;
            const unavailable = [
                'Consultando…',
                'No disponible',
                'Sin conexión',
                'Instala curl',
            ];
            if (!address || unavailable.includes(address))
                return;
            St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, address);
            item.label.text = this.gettext('¡Copiada! ') + address;
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1400, () => {
                if (!this._disposed)
                    this._setAddressLabel(addressType);
                return GLib.SOURCE_REMOVE;
            });
        });
        this._indicator.menu.addMenuItem(item);
        return item;
    }

    _readText(path) {
        const [ok, bytes] = GLib.file_get_contents(path);
        if (!ok)
            throw new Error(`No se pudo leer ${path}`);
        return new TextDecoder().decode(bytes);
    }

    _defaultInterface() {
        for (const line of this._readText('/proc/net/route').split('\n').slice(1)) {
            const fields = line.trim().split(/\s+/);
            if (fields.length > 3 && fields[1] === '00000000' &&
                (Number.parseInt(fields[3], 16) & 1) !== 0)
                return fields[0];
        }
        return null;
    }

    _readCounters() {
        const defaultInterface = this._defaultInterface();
        let received = 0;
        let sent = 0;
        let found = false;

        for (const line of this._readText('/proc/net/dev').split('\n').slice(2)) {
            const match = line.match(/^\s*([^:]+):\s*(.*)$/);
            if (!match)
                continue;
            const name = match[1].trim();
            if ((defaultInterface && name !== defaultInterface) ||
                (!defaultInterface && name === 'lo'))
                continue;
            const values = match[2].trim().split(/\s+/).map(Number);
            if (values.length < 9)
                continue;
            received += values[0];
            sent += values[8];
            found = true;
        }
        if (!found)
            throw new Error('No se encontró una interfaz de red activa');
        return {
            received,
            sent,
            interfaceName: defaultInterface ?? this.gettext('Todas'),
            at: GLib.get_monotonic_time(),
        };
    }

    _readPrivateIp() {
        const ipPath = GLib.find_program_in_path('ip');
        if (!ipPath)
            throw new Error('No se encontró el comando ip');
        const process = Gio.Subprocess.new(
            [ipPath, '-o', '-4', 'addr', 'show', 'scope', 'global'],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
        );
        const [ok, stdout, stderr] = process.communicate_utf8(null, null);
        if (!ok || !process.get_successful())
            throw new Error((stderr ?? '').trim() || 'Falló la consulta de IP local');
        const addresses = [];
        for (const line of (stdout ?? '').split('\n')) {
            const match = line.match(/\binet\s+([0-9.]+)\//);
            if (match && !addresses.includes(match[1]))
                addresses.push(match[1]);
        }
        return addresses.join(', ');
    }

    _formatRate(bytesPerSecond) {
        const bitsPerSecond = Math.max(0, bytesPerSecond) * 8;
        if (bitsPerSecond < 1000000)
            return `${(bitsPerSecond / 1000).toFixed(0)} Kbps`;
        return `${(bitsPerSecond / 1000000).toFixed(2)} Mbps`;
    }

    _formatBytes(bytes) {
        if (bytes < 1024)
            return `${Math.round(bytes)} B`;
        if (bytes < 1024 ** 2)
            return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 ** 3)
            return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
        return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
    }

    _setAddressLabel(addressType) {
        if (addressType === 'private')
            this._privateIpItem.label.text =
                `${this.gettext('IP privada')}: ${this._privateIp || this.gettext('No disponible')}`;
        else
            this._publicIpItem.label.text =
                `${this.gettext('IP pública')}: ${this._publicIp || this.gettext('No disponible')}`;
    }

    _update() {
        try {
            const current = this._readCounters();
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
                    const download = this._formatRate(
                        (current.received - this._previousCounters.received) / elapsed
                    );
                    const upload = this._formatRate(
                        (current.sent - this._previousCounters.sent) / elapsed
                    );
                    this._speedLabel.text = `↓ ${download}  ↑ ${upload}`;
                }
            }
            this._previousCounters = current;
            this._interfaceItem.label.text = `${this.gettext('Interfaz')}: ${current.interfaceName}`;
            this._sessionItem.label.text = `${this.gettext('Sesión')}: ↓ ${this._formatBytes(this._sessionReceived)}  ↑ ${this._formatBytes(this._sessionSent)}`;
        } catch (error) {
            console.error(`Red en vivo: ${error.message}`);
            this._speedLabel.text = '↓ --  ↑ --';
            this._interfaceItem.label.text = this.gettext('Interfaz: sin datos');
        }

        const now = GLib.get_monotonic_time();
        if (now - this._lastPrivateIpUpdate >= 5000000) {
            this._lastPrivateIpUpdate = now;
            try {
                this._privateIp = this._readPrivateIp() || this.gettext('Sin conexión');
            } catch (error) {
                console.error(`Red en vivo: ${error.message}`);
                this._privateIp = this.gettext('No disponible');
            }
            this._setAddressLabel('private');
        }

        if (!this._publicIp || now - this._lastPublicIpRequest >= 60000000)
            this._requestPublicIp();
    }

    _requestPublicIp(force = false) {
        const now = GLib.get_monotonic_time();
        if (!force && this._publicIp && now - this._lastPublicIpRequest < 60000000)
            return;
        const generation = ++this._publicIpRequestGeneration;
        if (this._publicIpProcess) {
            this._publicIpProcess.force_exit();
            this._publicIpProcess = null;
        }
        this._lastPublicIpRequest = now;
        this._publicIp = this.gettext('Consultando…');
        this._setAddressLabel('public');
        this._tryPublicIpService(0, generation);
    }

    _tryPublicIpService(index, generation) {
        if (this._disposed || generation !== this._publicIpRequestGeneration)
            return;
        if (index >= PUBLIC_IP_SERVICES.length) {
            this._publicIp = this.gettext('No disponible');
            this._setAddressLabel('public');
            return;
        }
        const curlPath = GLib.find_program_in_path('curl');
        if (!curlPath) {
            this._publicIp = this.gettext('Instala curl');
            this._setAddressLabel('public');
            return;
        }
        try {
            const process = Gio.Subprocess.new(
                [
                    curlPath,
                    '--fail',
                    '--silent',
                    '--show-error',
                    '--max-time',
                    '5',
                    PUBLIC_IP_SERVICES[index],
                ],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );
            this._publicIpProcess = process;
            process.communicate_utf8_async(null, null, (source, result) => {
                if (this._disposed || generation !== this._publicIpRequestGeneration)
                    return;
                this._publicIpProcess = null;
                try {
                    const [ok, stdout, stderr] = source.communicate_utf8_finish(result);
                    const address = (stdout ?? '').trim();
                    if (!ok || !source.get_successful() || !Gio.InetAddress.new_from_string(address))
                        throw new Error((stderr ?? '').trim() || 'Respuesta de IP pública no válida');
                    this._publicIp = address;
                    this._setAddressLabel('public');
                } catch (error) {
                    console.error(`Red en vivo: no se pudo consultar la IP pública: ${error.message}`);
                    this._tryPublicIpService(index + 1, generation);
                }
            });
        } catch (error) {
            console.error(`Red en vivo: no se pudo iniciar curl: ${error.message}`);
            this._tryPublicIpService(index + 1, generation);
        }
    }
}
