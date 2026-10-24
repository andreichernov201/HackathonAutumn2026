import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({ plugins: [tailwindcss()], server: { proxy: { '/api': process.env.REGULA_API_TARGET || 'http://127.0.0.1:8000' } } })

