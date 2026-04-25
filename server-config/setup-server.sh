#!/bin/bash
# =====================================================================
#  VATTO – Script de configuración del servidor para vatto.online
#  Ejecutar como root o con sudo en el servidor Ubuntu
#  Uso: bash setup-server.sh
# =====================================================================

set -e

echo "=== VATTO Server Setup ==="

# 1. Instalar certbot
echo "[1/6] Instalando certbot..."
apt update -qq
apt install -y certbot python3-certbot-nginx

# 2. Crear directorios
echo "[2/6] Creando directorios..."
mkdir -p /var/www/vatto/qr
mkdir -p /var/www/vatto/apk
mkdir -p /var/www/vatto/web

# 3. Copiar config de nginx
echo "[3/6] Copiando configuración nginx..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SCRIPT_DIR/vatto.conf" /etc/nginx/sites-available/vatto.online
cp "$SCRIPT_DIR/qr-landing/index.html" /var/www/vatto/qr/index.html

# Activar el site
ln -sf /etc/nginx/sites-available/vatto.online /etc/nginx/sites-enabled/vatto.online

# Desactivar default si existe
rm -f /etc/nginx/sites-enabled/default

# 4. Test nginx
echo "[4/6] Verificando configuración nginx..."
nginx -t

# 5. Recargar nginx (sin SSL todavía)
echo "[5/6] Recargando nginx..."
systemctl reload nginx

# 6. Obtener certificado SSL
echo "[6/6] Obteniendo certificado SSL con Let's Encrypt..."
echo "      Asegúrate de que DNS vatto.online → 217.71.203.129 ya propagó."
certbot --nginx -d vatto.online -d www.vatto.online \
  --non-interactive --agree-tos --email admin@vatto.online \
  --redirect

echo ""
echo "=== Setup completado ==="
echo "  Web app:  https://vatto.online"
echo "  API:      https://vatto.online/api/v1"
echo "  QR page:  https://vatto.online/qr?mac=AA:BB:CC:DD:EE:FF"
echo "  APK:      https://vatto.online/apk/vatto-latest.apk"
echo ""
echo "Próximos pasos:"
echo "  1. Copia el build de la web app a /var/www/vatto/web/"
echo "  2. Coloca el APK en /var/www/vatto/apk/vatto-latest.apk"
echo "  3. Asegúrate de que el backend Express corre en puerto 3000"
echo "     (pm2 start ecosystem.config.js)"
