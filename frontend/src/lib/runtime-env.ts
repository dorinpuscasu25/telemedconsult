type RuntimeEnvironment = {
  VITE_API_BASE_URL?: string;
  VITE_REVERB_APP_KEY?: string;
  VITE_REVERB_HOST?: string;
  VITE_REVERB_PORT?: string;
  VITE_REVERB_SCHEME?: string;
};

declare global {
  interface Window {
    __TELEMEDCONSULT_ENV__?: RuntimeEnvironment;
  }
}

export const runtimeEnv: RuntimeEnvironment =
  typeof window === 'undefined' ? {} : (window.__TELEMEDCONSULT_ENV__ ?? {});
