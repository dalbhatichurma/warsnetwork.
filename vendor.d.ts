/// <reference types="vite/client" />

// Lightweight fallbacks let the app typecheck if package installation was interrupted
// while a declaration bundle was being unpacked. Installed library types take precedence.
declare module 'lucide-react';
declare module '*.css';
