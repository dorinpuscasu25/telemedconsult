import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { getToken } from './api';
import { runtimeEnv } from './runtime-env';

type EchoInstance = Echo<'reverb'>;

let echo: EchoInstance | null = null;

const apiBaseUrl = runtimeEnv.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || '/api/v1';
const apiOrigin = new URL(apiBaseUrl, window.location.origin).origin;

export function getEcho() {
  const token = getToken();

  if (!token) {
    disconnectEcho();
    return null;
  }

  if (echo) {
    return echo;
  }

  try {
    const pageUsesTls = window.location.protocol === 'https:';
    const reverbScheme = runtimeEnv.VITE_REVERB_SCHEME || import.meta.env.VITE_REVERB_SCHEME || (pageUsesTls ? 'https' : 'http');
    const reverbPort = Number(runtimeEnv.VITE_REVERB_PORT || import.meta.env.VITE_REVERB_PORT || (pageUsesTls ? 443 : 80));

    echo = new Echo({
      broadcaster: 'reverb',
      client: new Pusher(runtimeEnv.VITE_REVERB_APP_KEY || import.meta.env.VITE_REVERB_APP_KEY || 'doctor-md-local-key', {
        cluster: import.meta.env.VITE_REVERB_APP_CLUSTER || 'mt1',
        wsHost: runtimeEnv.VITE_REVERB_HOST || import.meta.env.VITE_REVERB_HOST || window.location.hostname,
        wsPort: reverbPort,
        wssPort: reverbPort,
        forceTLS: reverbScheme === 'https',
        enabledTransports: ['ws', 'wss'],
        disableStats: true,
        authEndpoint: `${apiOrigin}/api/broadcasting/auth`,
        auth: {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json'
          }
        }
      })
    });
  } catch (error) {
    console.warn('Realtime disabled:', error);
    echo = null;
  }

  return echo;
}

export function disconnectEcho() {
  echo?.disconnect();
  echo = null;
}
