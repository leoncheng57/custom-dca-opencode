import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { generateStaticRoutes } from './src/lib/staticRoutes'

function staticContentRoutes() {
  return {
    name: 'static-content-routes',
    closeBundle() {
      const root = import.meta.dirname
      const routes = generateStaticRoutes({
        outDir: resolve(root, 'dist'),
        skillsDir: resolve(root, 'skills'),
        commandsDir: resolve(root, 'commands'),
        contentBase: 'agent-skills',
        staticRoutes: ['features', 'docs', 'architecture', 'roadmap', 'changelog'],
      })
      console.log(`generated ${routes.length} static route entrypoints`)
    },
  }
}

export default defineConfig({
  plugins: [react(), staticContentRoutes()],
  build: {
    // The publisher copies this complete site into the shared gh-pages branch.
    outDir: 'dist',
    emptyOutDir: true,
  },
  base: '/custom-dca-opencode/',
})
