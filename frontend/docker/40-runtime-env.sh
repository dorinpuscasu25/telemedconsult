#!/bin/sh
set -eu

envsubst \
  '${VITE_API_BASE_URL} ${VITE_REVERB_APP_KEY} ${VITE_REVERB_HOST} ${VITE_REVERB_PORT} ${VITE_REVERB_SCHEME}' \
  < /etc/telemedconsult/runtime-env.js.template \
  > /usr/share/nginx/html/runtime-env.js
