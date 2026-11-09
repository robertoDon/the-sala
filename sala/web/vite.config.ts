import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// o app usa a regra de @ e de nomes de agente do servidor (supabase/functions/_shared), então o dev server lê a pasta da Sala
export default defineConfig({ plugins: [react()], server: { fs: { allow: [".."] } } });
