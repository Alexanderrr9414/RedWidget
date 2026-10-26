# Red en vivo

Desklet para Cinnamon que muestra la velocidad de descarga y subida, la IP
local y la IP pública. La velocidad se actualiza cada segundo; la IP pública
se consulta una vez por minuto mediante `api.ipify.org`.

## Instalación

1. Copia `netinfo@local` a `~/.local/share/cinnamon/desklets/`.
2. Activa **Red en vivo** desde la aplicación **Desklets** de Cinnamon.

La IP pública requiere conexión a Internet y `curl`. El resto de datos se
obtiene localmente desde Linux.
