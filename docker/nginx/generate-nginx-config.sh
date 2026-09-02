#!/bin/sh
set -eu

domain="${API_DOMAIN:-localhost}"
tls_enabled="${NGINX_TLS_ENABLED:-false}"
cert_path="${NGINX_SSL_CERT_PATH:-/etc/nginx/certs/fullchain.pem}"
key_path="${NGINX_SSL_KEY_PATH:-/etc/nginx/certs/privkey.pem}"
client_max_body_size="${NGINX_CLIENT_MAX_BODY_SIZE:-25m}"

if [ "$tls_enabled" = "true" ] || [ "$tls_enabled" = "1" ]; then
  if [ ! -f "$cert_path" ]; then
    echo "Nginx TLS enabled but certificate file not found: $cert_path" >&2
    exit 1
  fi

  if [ ! -f "$key_path" ]; then
    echo "Nginx TLS enabled but private key file not found: $key_path" >&2
    exit 1
  fi

  cat > /etc/nginx/conf.d/default.conf <<EOF
map \$http_upgrade \$connection_upgrade {
  default upgrade;
  '' close;
}

server {
  listen 80;
  listen [::]:80;
  server_name ${domain};
  return 301 https://\$host\$request_uri;
}

server {
  listen 443 ssl;
  listen [::]:443 ssl;
  http2 on;
  server_name ${domain};

  ssl_certificate ${cert_path};
  ssl_certificate_key ${key_path};

  client_max_body_size ${client_max_body_size};

  location /api/ {
    proxy_pass http://gateway:3010/;
    proxy_http_version 1.1;
    proxy_set_header Host \$http_host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
  }

  location = /openapi.json {
    proxy_pass http://gateway:3010;
    proxy_http_version 1.1;
    proxy_set_header Host \$http_host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
  }

  location = /docs {
    proxy_pass http://gateway:3010;
    proxy_http_version 1.1;
    proxy_set_header Host \$http_host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
  }

  location /docs/ {
    proxy_pass http://gateway:3010;
    proxy_http_version 1.1;
    proxy_set_header Host \$http_host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
  }

  location / {
    proxy_pass http://web:3000;
    proxy_http_version 1.1;
    proxy_set_header Host \$http_host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
  }
}
EOF
else
  cat > /etc/nginx/conf.d/default.conf <<EOF
map \$http_upgrade \$connection_upgrade {
  default upgrade;
  '' close;
}

server {
  listen 80;
  listen [::]:80;
  server_name ${domain};

  client_max_body_size ${client_max_body_size};

  location /api/ {
    proxy_pass http://gateway:3010/;
    proxy_http_version 1.1;
    proxy_set_header Host \$http_host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Proto http;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
  }

  location = /openapi.json {
    proxy_pass http://gateway:3010;
    proxy_http_version 1.1;
    proxy_set_header Host \$http_host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Proto http;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
  }

  location = /docs {
    proxy_pass http://gateway:3010;
    proxy_http_version 1.1;
    proxy_set_header Host \$http_host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Proto http;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
  }

  location /docs/ {
    proxy_pass http://gateway:3010;
    proxy_http_version 1.1;
    proxy_set_header Host \$http_host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Proto http;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
  }

  location / {
    proxy_pass http://web:3000;
    proxy_http_version 1.1;
    proxy_set_header Host \$http_host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Proto http;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
  }
}
EOF
fi
