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
        outDir: resolve(root, 'docs'),
        skillsDir: resolve(root, 'skills'),
        commandsDir: resolve(root, 'commands'),
      })
      console.log(`generated ${routes.length} static route entrypoints`)
    },
  }
}

export default defineConfig({
  plugins: [react(), staticContentRoutes()],
  build: {
    // GitHub Pages serves the Actions artifact built into ./docs.
    outDir: 'docs',
    emptyOutDir: true,
  },
  // Project site, served from https://leoncheng.dev/agent-skills/ — the user
  // site (leoncheng57.github.io) owns the apex domain, this repo is a subpath.
  base: '/agent-skills/',
})
