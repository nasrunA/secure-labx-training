import {defineConfig} from 'vitest/config'
export default defineConfig({test:{environment:'jsdom',include:['tests/**/*.test.{js,jsx}'],setupFiles:['./tests/setup.js'],pool:'forks',maxWorkers:1,minWorkers:1}})
