import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
	base: './',
	plugins: [react()],
	resolve: {
		alias: {
			'@shared': resolve(import.meta.dirname, 'shared'),
		},
	},
	server: {
		proxy: {
			'/api': {
				target: 'http://127.0.0.1:3847',
				changeOrigin: true,
			},
		},
	},
})
