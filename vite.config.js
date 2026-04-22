import { defineConfig } from ‘vite’
import react from ‘@vitejs/plugin-react’
import { VitePWA } from ‘vite-plugin-pwa’

export default defineConfig({
plugins: [
react(),
VitePWA({
registerType: ‘autoUpdate’,
includeAssets: [‘icon-192.png’, ‘icon-512.png’, ‘icon-maskable.png’],
manifest: {
name: ‘Planlösning’,
short_name: ‘Planlösning’,
description: ‘Rita planlösningar på mobil och surfplatta’,
theme_color: ‘#2c2416’,
background_color: ‘#f5f0e8’,
display: ‘standalone’,
orientation: ‘any’,
start_url: ‘/’,
scope: ‘/’,
lang: ‘sv’,
icons: [
{
src: ‘icon-192.png’,
sizes: ‘192x192’,
type: ‘image/png’
},
{
src: ‘icon-512.png’,
sizes: ‘512x512’,
type: ‘image/png’
},
{
src: ‘icon-maskable.png’,
sizes: ‘512x512’,
type: ‘image/png’,
purpose: ‘maskable’
}
]
},
workbox: {
globPatterns: [’**/*.{js,css,html,ico,png,svg}’],
runtimeCaching: []
}
})
]
})